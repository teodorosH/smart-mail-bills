
const pool = require('../config/db'); // או הנתיב לקובץ החיבור שלך ל-PostgreSQL

const { google } = require('googleapis');

const path = require('path');
const fs = require('fs');
const getDocuments = async (req, res) => {
  console.log('GET DOCUMENTS START');

  try {
    const userId = req.user?.id || req.user?.userId;

    console.log('User ID:', userId);

    const query = `
      SELECT *
      FROM documents
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    console.log('Before DB query');

    const { rows } = await pool.query(query, [userId]);

    console.log('After DB query:', rows.length);

    return res.status(200).json({
      success: true,
      documents: rows
    });

  } catch (error) {
    console.error('GET DOCUMENTS ERROR:', error);

    return res.status(500).json({
      error: error.message
    });
  }
};

const triggerEmailScan = async (req, res) => {
  console.log('Email Scan START');
  try {
    const userId = req.user?.id || req.user?.userId;

    // 1. שליפת ה-access_token וה-refresh_token מטבלת oauth_tokens
    const tokenResult = await pool.query(
      'SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE user_id = $1 AND provider = $2',
      [userId, 'google']
    );

    const tokenRow = tokenResult.rows[0];

    if (!tokenRow || !tokenRow.access_token) {
      console.log('Email Scan Ended With Error: No Google tokens found for user ID:', userId);
      return res.status(400).json({ error: 'לא נמצאו נתוני התחברות לגוגל. אנא התחבר מחדש.' });
    }

    // 2. הגדרת Google OAuth2 Client עם פרטי האפליקציה שלך
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: tokenRow.access_token,
      refresh_token: tokenRow.refresh_token,
      expiry_date: tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : null
    });

    // יצירת Gmail client
    const gmail = google.gmail({
      version: 'v1',
      auth: oauth2Client
    });

    // חיפוש מייל אחד בלבד לבדיקה
    const emailsResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 1,
      q: 'has:attachment'
    });

    const messages = emailsResponse.data.messages || [];

    if (messages.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'לא נמצאו מיילים עם קבצים',
        data: { count: 0 }
      });
    }

    // כרגע מעבדים רק מייל אחד
    const messageId = messages[0].id;

    const email = await gmail.users.messages.get({
      userId: 'me',
      id: messageId
    });

    const headers = email.data.payload.headers;

    const subject =
      headers.find(h => h.name === 'Subject')?.value || 'No subject';

    const from =
      headers.find(h => h.name === 'From')?.value || 'Unknown sender';

    const receivedDate =
      headers.find(h => h.name === 'Date')?.value || new Date();

    console.log('Found email:', messageId);

    const attachment = email.data.payload.parts?.find(
      part => part.filename && part.body.attachmentId
    );

    const filename = attachment.filename;

    const attachmentResponse = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: attachment.body.attachmentId
    });

    const fileBuffer = Buffer.from(
      attachmentResponse.data.data,
      'base64'
    );
    const uploadDir = path.join(__dirname, '../uploads');
    console.log('Upload directory:', uploadDir);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    const savedFileName = `${Date.now()}-${filename}`;

    const savedFilePath = path.join(
      uploadDir,
      savedFileName
    );


    fs.writeFileSync(
      savedFilePath,
      fileBuffer
    );

    if (attachment) {
      console.log('Attachment found:', attachment.filename);
    }

    const documentType =
      filename.toLowerCase().includes('invoice') ||
        filename.toLowerCase().includes('receipt')
        ? 'invoice'
        : 'other';

    await pool.query(
      `
    INSERT INTO documents
    (
    user_id,
    title,
    source,
    created_at,
    category,
    document_type,
    payment_status,
    file_path,
    mime_type
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
      [
        userId,
        savedFileName,
        from,
        new Date(receivedDate),
        'gmail_scan',
        documentType,
        'unknown',
        savedFilePath,
        attachment.mimeType || 'application/pdf'
      ]
    );


    const newInvoicesCount = 1;

    return res.status(200).json({
      success: true,
      message: 'סריקת בדיקה הסתיימה',
      data: {
        count: newInvoicesCount
      }
    });

  } catch (error) {
    console.error('Error in triggerEmailScan:', error);
    console.log('Email Scan ENDED');
    // אם גם ה-refresh_token פג תוקף או נדחה
    if (error.message && error.message.includes('invalid_grant')) {
      return res.status(401).json({ error: 'פג תוקף ההרשאה מול גוגל. אנא התחבר מחדש דרך האפליקציה.' });
    }

    return res.status(500).json({ error: 'שגיאה פנימית בסריקת המיילים' });
  }
};


const downloadDocument = async (req, res) => {

  const { id } = req.params;

  try {
    console.log('Download Document START, ID:', id);
    const result = await pool.query(
      `
      SELECT file_path, title
      FROM documents
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Document not found'
      });
    }

    const doc = result.rows[0];
    console.log('Document from DB:', doc);
  if (!doc.file_path || !fs.existsSync(doc.file_path)) {
    return res.status(404).json({
      error: 'File not found on server'
    });
  }

  res.download(doc.file_path, doc.title);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Download failed'
    });
  }
};

module.exports = {
  getDocuments,
  triggerEmailScan,
  downloadDocument
};

