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

// GET /api/assessments?page=1&limit=20&home_id=X
router.get(
  '/',
  authenticateToken,
  [
    queryValidator('page').optional().isInt({ min: 1 }).toInt(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    queryValidator('home_id').optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;
    const homeId = req.query.home_id;

    try {
      const params = [req.user.id];
      let whereClause = 'a.user_id = $1';
      if (homeId) {
        params.push(homeId);
        whereClause += ` AND a.home_id = $${params.length}`;
      }

      const countResult = await query(
        `SELECT COUNT(*) FROM assessments a WHERE ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count);

      params.push(limit, offset);
      const result = await query(
        `SELECT a.*, h.address FROM assessments a
         JOIN homes h ON a.home_id = h.id
         WHERE ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
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

// GET /api/assessments/:id
router.get(
  '/:id',
  authenticateToken,
  [param('id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      const result = await query(
        `SELECT a.*, h.address, h.year_built, h.sq_footage, h.num_floors
         FROM assessments a JOIN homes h ON a.home_id = h.id
         WHERE a.id = $1 AND a.user_id = $2`,
        [req.params.id, req.user.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not Found' });
      return res.json({ assessment: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// POST /api/assessments
router.post(
  '/',
  authenticateToken,
  [
    body('home_id').isInt({ min: 1 }).withMessage('home_id must be a positive integer'),
    body('assessment_type')
      .optional()
      .isIn(['full', 'bathroom', 'kitchen', 'entrance', 'bedroom'])
      .withMessage('assessment_type must be one of: full, bathroom, kitchen, entrance, bedroom'),
  ],
  validate,
  async (req, res) => {
    const { home_id, assessment_type = 'full' } = req.body;
    try {
      const homeCheck = await query('SELECT id FROM homes WHERE id = $1 AND user_id = $2', [home_id, req.user.id]);
      if (homeCheck.rows.length === 0) return res.status(404).json({ error: 'Home not found' });

      const result = await query(
        'INSERT INTO assessments (home_id, user_id, assessment_type) VALUES ($1, $2, $3) RETURNING *',
        [home_id, req.user.id, assessment_type]
      );
      return res.status(201).json({ assessment: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// DELETE /api/assessments/:id
router.delete(
  '/:id',
  authenticateToken,
  [param('id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      const result = await query(
        'DELETE FROM assessments WHERE id = $1 AND user_id = $2 RETURNING id',
        [req.params.id, req.user.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not Found' });
      return res.json({ message: 'Assessment deleted successfully' });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

module.exports = router;
