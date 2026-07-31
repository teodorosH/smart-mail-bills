const { google } = require('googleapis');
const pool = require('../config/db');

// יצירת קคลיינט מאומת של גוגל עבור משתמש ספציפי
const getGoogleClientForUser = async (userId) => {
  const tokenResult = await pool.query(
    'SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE user_id = $1 AND provider = $2',
    [userId, 'google']
  );

  if (tokenResult.rows.length === 0) {
    throw new Error('Google account not connected for this user');
  }

  const { access_token, refresh_token, expires_at } = tokenResult.rows[0];

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token,
    refresh_token,
    expiry_date: new Date(expires_at).getTime(),
  });

  return oauth2Client;
};

// פונקציית סריקת מיילים וחיפוש מסמכים פיננסיים
const scanUserEmails = async (userId) => {
  try {
    const auth = await getGoogleClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth });

    // חיפוש מיילים המכילים מילות מפתח פיננסיות או קבצי PDF
    const query = 'has:attachment filename:pdf (invoice OR bill OR receipt OR חשבונית OR קבלה)';
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 10,
    });

    const messages = response.data.messages || [];
    const processedDocuments = [];

    for (const msg of messages) {
      const messageDetail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
      });

      const headers = messageDetail.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const sender = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
      const date = headers.find(h => h.name === 'Date')?.value || new Date();

      // בדיקת קבצים מצורפים
      const parts = messageDetail.data.payload.parts || [];
      for (const part of parts) {
        if (part.filename && part.filename.toLowerCase().endsWith('.pdf') && part.body && part.body.attachmentId) {
          
          // שמירת מטא-דאטה ראשונית או שליפה להמשך עיבוד OCR
          processedDocuments.push({
            messageId: msg.id,
            subject,
            sender,
            date,
            filename: part.filename,
            attachmentId: part.body.attachmentId
          });
        }
      }
    }

    return { success: true, count: processedDocuments.length, documents: processedDocuments };
  } catch (error) {
    console.error('Error scanning emails:', error);
    throw error;
  }
};

module.exports = { scanUserEmails };