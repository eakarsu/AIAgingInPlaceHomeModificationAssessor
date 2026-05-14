const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Unauthorized', message: 'Access token required' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'TokenExpired', message: 'Token expired. Please log in again.' });
    }
    return res.status(403).json({ error: 'Forbidden', message: 'Invalid access token' });
  }
};

module.exports = { authenticateToken };
