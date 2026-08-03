const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// 🟢 1. הרשמה (כולל עדכון סיסמה לחשבונות Google קיימים)
const register = async (req, res) => {
  try {
    const { email, password, language } = req.body;
    const userLanguage = language || 'he';

    if (!email || !password) {
      return res.status(400).json({ error: 'יש לספק אימייל וסיסמה' });
    }

    // הצפנת הסיסמה
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // בדיקה אם המשתמש קיים
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];

      // אם המשתמש נוצר בעבר דרך גוגל ואין לו סיסמה (NULL) - נעדכן לו סיסמה כעת!
      if (!user.password_hash) {
        await pool.query(
          'UPDATE users SET password_hash = $1, language = $2 WHERE id = $3',
          [hashedPassword, userLanguage, user.id]
        );

        return res.status(200).json({
          success: true,
          message: 'הסיסמה עודכנה בהצלחה! כעת תוכל להתחבר.'
        });
      }

      return res.status(400).json({ error: 'משתמש עם אימייל זה כבר קיים במערכת' });
    }

    // יצירת משתמש חדש
    const newUser = await pool.query(
      `INSERT INTO users (email, password_hash, language)
       VALUES ($1, $2, $3)
       RETURNING id, email, language`,
      [email, hashedPassword, userLanguage]
    );

    res.status(201).json({
      success: true,
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'שגיאה פנימית בהרשמה' });
  }
};

// 🟢 2. התחברות מוגנת
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'יש לספק אימייל וסיסמה' });
    }

    // שליפת כל עמודות המשתמש מ-PostgreSQL (כולל password)
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'אימייל או סיסמה שגויים' });
    }

    const user = userResult.rows[0];

    // הגנה: אם מסיבה כלשהי עדיין אין סיסמה ב-DB (undefined / null)
    if (!user.password_hash) {
      return res.status(400).json({ 
        error: 'לחשבון זה עדיין לא הוגדרה סיסמה. אנא בצע הרשמה מחדש עם הסיסמה הרצויה.' 
      });
    }

    // אימות הסיסמה הבטוח
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'אימייל או סיסמה שגויים' });
    }

    // יצירת Token
    const token = jwt.sign(
      { userId: user.id, email: user.email, language: user.language || 'he' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        language: user.language || 'he'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'שגיאה פנימית בהתחברות' });
  }
};

module.exports = {
  register,
  login
};