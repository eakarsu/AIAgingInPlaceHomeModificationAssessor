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

// GET /api/homes?page=1&limit=20
router.get(
  '/',
  authenticateToken,
  [
    queryValidator('page').optional().isInt({ min: 1 }).toInt(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;
    try {
      const countResult = await query('SELECT COUNT(*) FROM homes WHERE user_id = $1', [req.user.id]);
      const total = parseInt(countResult.rows[0].count);

      const result = await query(
        `SELECT h.*,
           (SELECT COUNT(*) FROM assessments a WHERE a.home_id = h.id) AS assessment_count,
           (SELECT status FROM assessments a WHERE a.home_id = h.id ORDER BY a.created_at DESC LIMIT 1) AS latest_assessment_status
         FROM homes h WHERE h.user_id = $1 ORDER BY h.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
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

// GET /api/homes/:id
router.get(
  '/:id',
  authenticateToken,
  [param('id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      const result = await query('SELECT * FROM homes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not Found' });
      return res.json({ home: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// POST /api/homes
router.post(
  '/',
  authenticateToken,
  [
    body('address').notEmpty().withMessage('address is required').trim(),
    body('year_built').optional({ nullable: true }).isInt({ min: 1800, max: 2100 }).withMessage('year_built must be a valid year'),
    body('sq_footage').optional({ nullable: true }).isInt({ min: 100, max: 100000 }).withMessage('sq_footage must be between 100 and 100000'),
    body('num_floors').optional().isInt({ min: 1, max: 20 }).withMessage('num_floors must be between 1 and 20'),
    body('current_accessibility_score').optional().isInt({ min: 0, max: 100 }).withMessage('score must be 0-100'),
  ],
  validate,
  async (req, res) => {
    const { address, year_built, sq_footage, num_floors, current_accessibility_score } = req.body;
    try {
      const result = await query(
        `INSERT INTO homes (user_id, address, year_built, sq_footage, num_floors, current_accessibility_score)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.user.id, address, year_built || null, sq_footage || null, num_floors || 1, current_accessibility_score || 0]
      );
      return res.status(201).json({ home: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// PATCH /api/homes/:id
router.patch(
  '/:id',
  authenticateToken,
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('address').optional().notEmpty().trim().withMessage('address cannot be empty'),
    body('year_built').optional({ nullable: true }).isInt({ min: 1800, max: 2100 }).withMessage('year_built must be a valid year'),
    body('sq_footage').optional({ nullable: true }).isInt({ min: 100, max: 100000 }).withMessage('sq_footage must be between 100 and 100000'),
    body('num_floors').optional({ nullable: true }).isInt({ min: 1, max: 20 }).withMessage('num_floors must be between 1 and 20'),
    body('current_accessibility_score').optional({ nullable: true }).isInt({ min: 0, max: 100 }).withMessage('score must be 0-100'),
  ],
  validate,
  async (req, res) => {
    const { address, year_built, sq_footage, num_floors, current_accessibility_score } = req.body;
    try {
      const result = await query(
        `UPDATE homes SET
           address = COALESCE($1, address),
           year_built = COALESCE($2, year_built),
           sq_footage = COALESCE($3, sq_footage),
           num_floors = COALESCE($4, num_floors),
           current_accessibility_score = COALESCE($5, current_accessibility_score),
           updated_at = NOW()
         WHERE id = $6 AND user_id = $7 RETURNING *`,
        [address || null, year_built ?? null, sq_footage ?? null, num_floors ?? null,
         current_accessibility_score ?? null, req.params.id, req.user.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not Found' });
      return res.json({ home: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// DELETE /api/homes/:id
router.delete(
  '/:id',
  authenticateToken,
  [param('id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      const result = await query('DELETE FROM homes WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not Found' });
      return res.json({ message: 'Home deleted successfully' });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// GET /api/homes/:id/budget — budget planning summary
router.get(
  '/:id/budget',
  authenticateToken,
  [param('id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      const homeCheck = await query('SELECT id FROM homes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      if (homeCheck.rows.length === 0) return res.status(404).json({ error: 'Home not found' });

      const result = await query(
        `SELECT m.id, m.modification_type, m.room, m.description, m.priority,
                m.estimated_cost_min, m.estimated_cost_max, m.status, m.aging_benefit,
                ce.roi_score, ce.timeline_days, ce.labor_cost, ce.materials_cost
         FROM modifications m
         JOIN assessments a ON m.assessment_id = a.id
         LEFT JOIN cost_estimates ce ON ce.modification_id = m.id
         WHERE a.home_id = $1 AND a.user_id = $2 AND m.status != 'completed'
         ORDER BY m.priority ASC`,
        [req.params.id, req.user.id]
      );

      const mods = result.rows;
      const totalMin = mods.reduce((s, m) => s + (m.estimated_cost_min || 0), 0);
      const totalMax = mods.reduce((s, m) => s + (m.estimated_cost_max || 0), 0);

      return res.json({
        home_id: req.params.id,
        total_modifications: mods.length,
        estimated_total_min: totalMin,
        estimated_total_max: totalMax,
        modifications: mods,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

module.exports = router;
