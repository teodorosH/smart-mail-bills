const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  console.log("Authorization Header:", authHeader);

  const token = authHeader && authHeader.split(" ")[1];

  console.log("Token:", token);
  if (!token) return res.status(401).json({ error: 'Access token missing' });

  console.log("Verifying token: %s vs %s", token, process.env.JWT_SECRET); // Debugging line to print the token
  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// שים לב: מייצאים את הפונקציה עצמה ישירות!
module.exports = verifyToken;