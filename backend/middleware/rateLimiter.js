const rateLimit = require('express-rate-limit');

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too Many Requests', message: 'Too many requests. Please try again in 15 minutes.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too Many Requests', message: 'Too many login/register attempts. Please try again later.' },
});

const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader) return authHeader;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return ip.replace(/^::ffff:/, '');
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ipKeyGenerator: false },
  message: { error: 'Too Many Requests', message: 'AI rate limit: max 20 requests per hour.' },
});

module.exports = { generalLimiter, authLimiter, aiRateLimiter };
