require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./config/db');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// 🟢 חשיפת תיקיית העלאת הקבצים (הכרחי לצפייה/הורדת PDFים)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🟢 נתיב בדיקת תקינות השרת (Health Check)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// ייבוא וחיבור הנתיבים (Routes)
const documentsRoutes = require('./routes/documentRoutes');
app.use('/api/documents', documentsRoutes);

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`🚀 Server is running on port ${PORT}`);

  // 🟢 בדיקת חיבור למסד הנתונים PostgreSQL
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL database successfully.');
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL database:', err.message);
  }
});