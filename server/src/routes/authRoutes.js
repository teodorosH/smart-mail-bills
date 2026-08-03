const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');

const pool = require('../config/db');
const { register, login } = require('../controllers/authController');
const verifyToken = require('../middleware/authMiddleware');

// נתיבים רגילים
router.post('/register', register);
router.post('/login', login);

router.get('/me', verifyToken, async (req, res) => {
  res.status(200).json({
    message: 'Authorized route accessed',
    user: req.user
  });
});

// 1. קבלת כתובת ההתחברות של גוגל
router.get('/google/url', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    'http://localhost:5000/api/auth/google/callback';

  const googleAuthUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=profile%20email%20https://www.googleapis.com/auth/gmail.readonly` +
    `&access_type=offline` +
    `&prompt=consent`;

  res.json({ url: googleAuthUrl });
});

// בדיקת סטטוס החיבור לגוגל עבור המשתמש המחובר
router.get('/google/status', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const tokenResult = await pool.query(
      `SELECT expires_at FROM oauth_tokens 
       WHERE user_id = $1 AND provider = $2 AND expires_at > NOW()`,
      [userId, 'google']
    );

    if (tokenResult.rows.length > 0) {
      return res.json({ connected: true });
    }

    res.json({ connected: false });
  } catch (error) {
    console.error('Check Google status error:', error);
    res.status(500).json({ connected: false });
  }
});

// 2. Callback מגוגל
router.get('/google/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).json({
      error: 'Authorization code missing'
    });
  }

  try {
    // החלפת code ב-Google tokens
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:
          process.env.GOOGLE_REDIRECT_URI ||
          'http://localhost:5000/api/auth/google/callback',
        grant_type: 'authorization_code',
      }
    );

    const {
      access_token,
      refresh_token,
      expires_in
    } = tokenResponse.data;


    // קבלת פרטי משתמש מגוגל
    const userResponse = await axios.get(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const {
      email
    } = userResponse.data;


    // חיפוש משתמש קיים
    let userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    let user;

    // יצירת משתמש חדש אם אין כזה
    if (userResult.rows.length === 0) {
      const newUser = await pool.query(
        `INSERT INTO users (email)
         VALUES ($1)
         RETURNING *`,
        [email]
      );

      user = newUser.rows[0];
    } else {
      user = userResult.rows[0];
    }


    // יצירת JWT של האפליקציה
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    );


    // שמירת Google tokens במסד הנתונים
    await pool.query(
      `
      INSERT INTO oauth_tokens
      (
        user_id,
        provider,
        access_token,
        refresh_token,
        expires_at
      )
      VALUES ($1, $2, $3, $4, NOW() + ($5 || ' seconds')::interval)
      ON CONFLICT (user_id, provider)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(
          EXCLUDED.refresh_token,
          oauth_tokens.refresh_token
        ),
        expires_at = EXCLUDED.expires_at
      `,
      [
        user.id,
        'google',
        access_token,
        refresh_token || null,
        expires_in || 3600
      ]
    );


    // שולחים רק JWT של המערכת לפרונט
    res.redirect(
      `http://localhost:8081/dashboard?email=${encodeURIComponent(email)}&token=${token}`
    );

  } catch (error) {
    console.error(
      'Google Auth Error:',
      error.response?.data || error.message
    );

    res.redirect(
      'http://localhost:8081/login?error=auth_failed'
    );
  }
});


module.exports = router;