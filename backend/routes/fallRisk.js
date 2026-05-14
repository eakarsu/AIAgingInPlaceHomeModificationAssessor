const express = require('express');
const { param, query: queryValidator, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation Error', errors: errors.array() });
  next();
};

// GET /api/fall-risk-history?home_id=X&page=1&limit=20
router.get(
  '/',
  authenticateToken,
  [
    queryValidator('home_id').optional().isInt({ min: 1 }).toInt(),
    queryValidator('page').optional().isInt({ min: 1 }).toInt(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;
    const { home_id } = req.query;

    const conditions = ['frh.user_id = $1'];
    const params = [req.user.id];
    let idx = 2;

    if (home_id) { conditions.push(`frh.home_id = $${idx++}`); params.push(home_id); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    try {
      const countResult = await query(`SELECT COUNT(*) FROM fall_risk_history frh ${where}`, params);
      const total = parseInt(countResult.rows[0].count);

      params.push(limit, offset);
      const result = await query(
        `SELECT frh.id, frh.home_id, frh.fall_risk_score, frh.risk_category,
                frh.annual_fall_probability, frh.five_year_fall_probability, frh.ai_result, frh.created_at,
                h.address
         FROM fall_risk_history frh
         JOIN homes h ON frh.home_id = h.id
         ${where}
         ORDER BY frh.created_at DESC
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

// GET /api/fall-risk-history/:id — get single fall risk entry
router.get(
  '/:id',
  authenticateToken,
  [param('id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      const result = await query(
        `SELECT frh.*, h.address
         FROM fall_risk_history frh
         JOIN homes h ON frh.home_id = h.id
         WHERE frh.id = $1 AND frh.user_id = $2`,
        [req.params.id, req.user.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not Found' });
      return res.json({ fall_risk: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// DELETE /api/fall-risk-history/:id
router.delete(
  '/:id',
  authenticateToken,
  [param('id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      const result = await query(
        'DELETE FROM fall_risk_history WHERE id = $1 AND user_id = $2 RETURNING id',
        [req.params.id, req.user.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not Found' });
      return res.json({ message: 'Fall risk record deleted successfully' });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

module.exports = router;
