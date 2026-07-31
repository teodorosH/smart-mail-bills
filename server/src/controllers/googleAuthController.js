const { google } = require('googleapis');
const pool = require('../config/db');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// שלב 1: הפניית המשתמש לעמוד ההתחברות והרשאות של גוגל
const getGoogleAuthURL = (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/gmail.readonly' // קריאת מיילים בלבד לפי הדרישה
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent' // מבטיח קבלת Refresh Token
  });

  res.status(200).json({ url });
};

// שלב 2: קבלת ה-Callback מגוגל ושמירת הטוקנים במסד הנתונים
const googleAuthCallback = async (req, res) => {
  const { code, userId } = req.query; // בהנחה שמעבירים userId או מזהים דרך Session/JWT

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is missing' });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // כאן נשמור או נעדכן את הטוקנים בטבלת oauth_tokens עבור המשתמש
    // לצורך הדוגמה נניח שיש לנו userId מועבר (בפועל נשלף מה-JWT של המשתמש המחובר)
    const targetUserId = userId || 1; // זמני להדגמה

    const expiresAt = new Date(tokens.expiry_date || Date.now() + 3600 * 1000);

    // בדיקה האם כבר קיים רשומת טוקן לגוגל עבור משתמש זה
    const existingToken = await pool.query(
      'SELECT * FROM oauth_tokens WHERE user_id = $1 AND provider = $2',
      [targetUserId, 'google']
    );

try {
  console.log("=== התחלת שמירת טוקן מגוגל ===");
  console.log("Tokens received:", tokens);
  console.log("Target User ID:", targetUserId);

  await pool.query(
    `INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, expires_at) 
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, provider) 
     DO UPDATE SET access_token = $3, refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token), expires_at = $5, updated_at = CURRENT_TIMESTAMP`,
    [targetUserId, 'google', tokens.access_token, tokens.refresh_token || '', expiresAt]
  );

  console.log("=== הטוקן נשמר בהצלחה במסד! ===");
} catch (dbError) {
  console.error("!!! שגיאה בשמירת הטוקן במסד הנתונים:", dbError); // חשוב לראות אם יש שגיאה כאן!
}

    res.status(200).json({ message: 'Google account connected successfully!' });
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({ error: 'Failed to authenticate with Google' });
  }
};

module.exports = { getGoogleAuthURL, googleAuthCallback };