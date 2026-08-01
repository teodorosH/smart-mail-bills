
const pool = require('../config/db'); // או הנתיב לקובץ החיבור שלך ל-PostgreSQL
const { extractTextFromPdf } = require('../services/pdfService'); // או הנתיב לקובץ החיבור שלך ל-PostgreSQL

const { google } = require('googleapis');

const path = require('path');
const fs = require('fs');
const { parseDocument } = require('../services/documentParser');


const getDocuments = async (req, res) => {
  try {

    const userId =
      req.user.userId;


    const { rows } = await pool.query(
      `
      SELECT
        id,
        title,
        company_name,
        amount,
        currency,
        document_type,
        payment_status,
        payment_required,
        invoice_date,
        due_date,
        summary,
        created_at
      FROM documents
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    console.log(res.data);
    res.json({
      success: true,
      documents: rows
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Failed loading documents'
    });

  }
};


function safeDate(value) {
  if (!value) return null;

      const date = new Date(value);

      return isNaN(date.getTime()) ? null : date;
}

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
      q: 'has:attachment (invoice OR receipt OR חשבונית) filename:pdf',
      maxResults: 10
    });

    const messages = emailsResponse.data.messages || [];

    if (messages.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'לא נמצאו מיילים עם קבצים',
        data: { count: 0 }
      });
    }

    let newDocumentsCount = 0;
    console.log('Found emails:', messages.length);
    for (const message of messages) {

      const messageId = message.id;


      // בדיקה האם כבר סרקנו את המייל הזה
      const existing = await pool.query(
        `
        SELECT id
        FROM documents
        WHERE gmail_message_id = $1
        `,
        [messageId]
      );


      if (existing.rows.length > 0) {

        console.log(
          'Skipping existing email:',
          messageId
        );

        continue;
      }


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

      if (!attachment.mimeType?.includes('pdf')) {
        console.log('Skipping non PDF:', attachment.filename);
        continue;
}

      const filename = attachment.filename;
      const { generateFileHash } = require('../utils/fileHash');

      const attachmentResponse = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachment.body.attachmentId
      });

      const data = attachmentResponse.data.data
        .replace(/-/g, '+')
        .replace(/_/g, '/');

      const fileBuffer = Buffer.from(data, 'base64');

      const documentHash = generateFileHash(fileBuffer);

      const exists =
        await pool.query(
          `
  SELECT id
  FROM documents
  WHERE 
  gmail_message_id=$1
  AND attachment_id=$2

  OR document_hash=$3
  `,
          [
            gmail.messageId,
            attachment.id,
            documentHash
          ]
        );


      if (exists.rows.length > 0) {

        console.log(
          "Document already exists:",
          "message: המסמך כבר קיים במערכת",
          documentHash
        );
        continue;

      }

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


      let text = '';

      try {
          text = await extractTextFromPdf(savedFilePath);
      } catch (err) {
          console.error(
              'Cannot parse PDF:',
              filename,
              err.message
          );

          continue;
      }

      console.log("*************>>  " + text);

      const parsed = parseDocument(text);

      console.log('Parsed document:', parsed);

      // const { sanitizeText } = require('../services/sanitizeService');

      // const cleanText = sanitizeText(text);

      // const result = await analyzeDocument(cleanText);

      //     {
      //  "amount": "48.50",
      //  "currency": "USD",
      //  "date": "2026-06-01",
      //  "document_text": "Monthly cloud hosting invoice"
      // }

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
 payment_required,
 company_name,
 amount,
 currency,
 invoice_date,
 due_date,
 gmail_message_id,
 attachment_id,
 document_hash,
 file_path
)

VALUES
(
 $1,$2,$3,$4,$5,$6,$7,$8,
 $9,$10,$11,$12,$13,
 $14,$15,$16,$17
)

`,
        [
          userId,
          filename,
          from,
          new Date(receivedDate),
          'gmail_scan',

          parsed.documentType,

          parsed.paymentRequired
            ? 'pending'
            : 'paid',

          parsed.paymentRequired,

          parsed.company,

          parsed.amount,

          parsed.currency,

          safeDate(parsed.invoiceDate),

          safeDate(parsed.dueDate),

          messageId,

          attachment.body.attachmentId,

          documentHash,

          savedFilePath
        ]
      );

      console.log(
        'Saved document:',
        {
          filename,
          company: parsed.company,
          amount: parsed.amount,
          type: parsed.documentType
        }
      );
      newDocumentsCount++;
    }

    return res.status(200).json({
      success: true,
      message: 'סריקת בדיקה הסתיימה',
      data: {
        count: newDocumentsCount
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

