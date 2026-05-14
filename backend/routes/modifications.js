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

// GET /api/modifications?assessmentId=X&page=1&limit=20
router.get(
  '/',
  authenticateToken,
  [
    queryValidator('assessmentId').isInt({ min: 1 }).toInt().withMessage('assessmentId must be a positive integer'),
    queryValidator('page').optional().isInt({ min: 1 }).toInt(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res) => {
    const assessmentId = req.query.assessmentId;
    const page = req.query.page || 1;
    const limit = req.query.limit || 50;
    const offset = (page - 1) * limit;

    try {
      // Verify assessment belongs to this user
      const aCheck = await query(
        'SELECT id FROM assessments WHERE id = $1 AND user_id = $2',
        [assessmentId, req.user.id]
      );
      if (aCheck.rows.length === 0) return res.status(404).json({ error: 'Assessment not found or access denied' });

      const countResult = await query('SELECT COUNT(*) FROM modifications WHERE assessment_id = $1', [assessmentId]);
      const total = parseInt(countResult.rows[0].count);

      const result = await query(
        `SELECT m.*, ce.labor_cost, ce.materials_cost, ce.timeline_days, ce.roi_score,
                c.name AS contractor_name, c.phone AS contractor_phone
         FROM modifications m
         LEFT JOIN cost_estimates ce ON ce.modification_id = m.id
         LEFT JOIN contractors c ON c.id = m.contractor_id
         WHERE m.assessment_id = $1
         ORDER BY m.priority ASC
         LIMIT $2 OFFSET $3`,
        [assessmentId, limit, offset]
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

// PATCH /api/modifications/:id
router.patch(
  '/:id',
  authenticateToken,
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('status')
      .optional()
      .isIn(['recommended', 'planned', 'in_progress', 'completed'])
      .withMessage('status must be one of: recommended, planned, in_progress, completed'),
    body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('priority must be 1-10'),
    body('description').optional().isString().trim(),
    body('contractor_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('completion_pct').optional().isInt({ min: 0, max: 100 }).withMessage('completion_pct must be 0-100'),
    body('start_date').optional({ nullable: true }).isISO8601(),
    body('end_date').optional({ nullable: true }).isISO8601(),
    body('notes').optional().isString().trim(),
  ],
  validate,
  async (req, res) => {
    const { status, priority, description, contractor_id, completion_pct, start_date, end_date, notes } = req.body;
    try {
      // Verify ownership via assessment join
      const ownerCheck = await query(
        `SELECT m.id FROM modifications m
         JOIN assessments a ON m.assessment_id = a.id
         WHERE m.id = $1 AND a.user_id = $2`,
        [req.params.id, req.user.id]
      );
      if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Modification not found or access denied' });

      const result = await query(
        `UPDATE modifications SET
           status = COALESCE($1, status),
           priority = COALESCE($2, priority),
           description = COALESCE($3, description),
           contractor_id = COALESCE($4, contractor_id),
           completion_pct = COALESCE($5, completion_pct),
           start_date = COALESCE($6, start_date),
           end_date = COALESCE($7, end_date),
           notes = COALESCE($8, notes)
         WHERE id = $9
         RETURNING *`,
        [status || null, priority || null, description || null, contractor_id ?? null,
         completion_pct ?? null, start_date || null, end_date || null, notes || null, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not Found' });
      return res.json({ modification: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// DELETE /api/modifications/:id
router.delete(
  '/:id',
  authenticateToken,
  [param('id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      const ownerCheck = await query(
        `SELECT m.id FROM modifications m
         JOIN assessments a ON m.assessment_id = a.id
         WHERE m.id = $1 AND a.user_id = $2`,
        [req.params.id, req.user.id]
      );
      if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Modification not found or access denied' });

      await query('DELETE FROM modifications WHERE id = $1', [req.params.id]);
      return res.json({ message: 'Modification deleted successfully' });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

module.exports = router;
