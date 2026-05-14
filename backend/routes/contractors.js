const express = require('express');
const { body, query: queryValidator, param, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation Error', errors: errors.array() });
  next();
};

// GET /api/contractors?zip=&specialty=&page=1&limit=20
router.get(
  '/',
  authenticateToken,
  [
    queryValidator('page').optional().isInt({ min: 1 }).toInt(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    queryValidator('zip').optional().isString().trim(),
    queryValidator('specialty').optional().isString().trim(),
  ],
  validate,
  async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;
    const { zip, specialty } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (zip) { conditions.push(`zip_code = $${idx++}`); params.push(zip); }
    if (specialty) { conditions.push(`specialty ILIKE $${idx++}`); params.push(`%${specialty}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const countResult = await query(`SELECT COUNT(*) FROM contractors ${where}`, params);
      const total = parseInt(countResult.rows[0].count);

      params.push(limit, offset);
      const result = await query(
        `SELECT * FROM contractors ${where} ORDER BY rating DESC NULLS LAST, review_count DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        params
      );

      return res.json({
        data: result.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// POST /api/contractors
router.post(
  '/',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('name is required').trim(),
    body('specialty').optional().isString().trim(),
    body('license_number').optional().isString().trim(),
    body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
    body('email').optional({ nullable: true }).isEmail().withMessage('Invalid email'),
    body('rating').optional({ nullable: true }).isFloat({ min: 0, max: 5 }).withMessage('rating must be 0-5'),
    body('review_count').optional().isInt({ min: 0 }),
    body('zip_code').optional().isString().isLength({ max: 10 }).trim(),
    body('is_certified_aging_specialist').optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    const { name, specialty, license_number, phone, email, rating, review_count, zip_code, is_certified_aging_specialist } = req.body;
    try {
      const result = await query(
        `INSERT INTO contractors (name, specialty, license_number, phone, email, rating, review_count, zip_code, is_certified_aging_specialist)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [name, specialty || null, license_number || null, phone || null, email || null,
         rating || null, review_count || 0, zip_code || null, is_certified_aging_specialist || false]
      );
      return res.status(201).json({ contractor: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// PATCH /api/contractors/:id
router.patch(
  '/:id',
  authenticateToken,
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('name').optional().notEmpty().trim(),
    body('specialty').optional().isString().trim(),
    body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
    body('email').optional({ nullable: true }).isEmail(),
    body('rating').optional({ nullable: true }).isFloat({ min: 0, max: 5 }),
    body('zip_code').optional().isString().isLength({ max: 10 }).trim(),
    body('is_certified_aging_specialist').optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    const { name, specialty, license_number, phone, email, rating, review_count, zip_code, is_certified_aging_specialist } = req.body;
    try {
      const result = await query(
        `UPDATE contractors SET
           name = COALESCE($1, name),
           specialty = COALESCE($2, specialty),
           license_number = COALESCE($3, license_number),
           phone = COALESCE($4, phone),
           email = COALESCE($5, email),
           rating = COALESCE($6, rating),
           review_count = COALESCE($7, review_count),
           zip_code = COALESCE($8, zip_code),
           is_certified_aging_specialist = COALESCE($9, is_certified_aging_specialist)
         WHERE id = $10 RETURNING *`,
        [name || null, specialty || null, license_number || null, phone || null,
         email || null, rating ?? null, review_count ?? null, zip_code || null,
         is_certified_aging_specialist ?? null, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not Found' });
      return res.json({ contractor: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// DELETE /api/contractors/:id
router.delete(
  '/:id',
  authenticateToken,
  [param('id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      const result = await query('DELETE FROM contractors WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not Found' });
      return res.json({ message: 'Contractor deleted successfully' });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

module.exports = router;
