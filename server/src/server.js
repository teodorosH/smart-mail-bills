require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const documentsRoutes = require('./routes/documentRoutes'); // או הנתיב המדויק אצלך
app.use('/api/documents', documentsRoutes);

// ייבוא ראוטר האותנטיקציה הישיר (ללא פאספורט)
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

