const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation Error', errors: errors.array() });
  next();
};

const generateToken = (user) =>
  jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role || 'resident' }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('name').notEmpty().trim().withMessage('Name is required'),
    body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
  ],
  validate,
  async (req, res) => {
    const { email, password, name, phone } = req.body;
    try {
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Conflict', message: 'Email already registered' });
      }

      const hash = await bcrypt.hash(password, 12);
      const result = await query(
        'INSERT INTO users (email, password_hash, name, phone) VALUES ($1, $2, $3, $4) RETURNING id, email, name, phone, role, created_at',
        [email, hash, name, phone || null]
      );
      const user = result.rows[0];
      return res.status(201).json({ token: generateToken(user), user });
    } catch (err) {
      console.error('Register error:', err);
      return res.status(500).json({ error: 'Internal Server Error', message: 'Registration failed' });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  async (req, res) => {
    const { email, password } = req.body;
    try {
      const result = await query('SELECT * FROM users WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });

      const { password_hash, ...safeUser } = user;
      return res.json({ token: generateToken(user), user: safeUser });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Internal Server Error', message: 'Login failed' });
    }
  }
);

// GET /api/auth/me — uses proper middleware
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT id, email, name, phone, role, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not Found' });
    return res.json({ user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: 'Profile lookup failed' });
  }
});

// PATCH /api/auth/me — update profile
router.patch(
  '/me',
  authenticateToken,
  [
    body('name').optional().notEmpty().trim().withMessage('Name cannot be empty'),
    body('phone').optional({ nullable: true }).isMobilePhone('any').withMessage('Invalid phone number'),
  ],
  validate,
  async (req, res) => {
    const { name, phone } = req.body;
    try {
      const result = await query(
        `UPDATE users SET
           name = COALESCE($1, name),
           phone = COALESCE($2, phone)
         WHERE id = $3
         RETURNING id, email, name, phone, role, created_at`,
        [name || null, phone ?? null, req.user.id]
      );
      return res.json({ user: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: 'Profile update failed' });
    }
  }
);

module.exports = router;
