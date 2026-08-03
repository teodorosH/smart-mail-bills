const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  // קריאת ה-Header
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  console.log('Authorization Header:', authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'גישה דחויה: לא סופק Token תקין' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token Verification Error:', error.message);
    return res.status(401).json({ error: 'Token פג תוקף או אינו תקין' });
  }
};

module.exports = verifyToken;