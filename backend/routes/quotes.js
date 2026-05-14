const express = require('express');
const { body, param, query: queryValidator, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation Error', errors: errors.array() });
  next();
};

// GET /api/quotes?modification_id=X&page=1&limit=20
router.get(
  '/',
  authenticateToken,
  [
    queryValidator('modification_id').optional().isInt({ min: 1 }).toInt(),
    queryValidator('page').optional().isInt({ min: 1 }).toInt(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;
    const { modification_id } = req.query;

    const conditions = ['q.user_id = $1'];
    const params = [req.user.id];
    let idx = 2;

    if (modification_id) { conditions.push(`q.modification_id = $${idx++}`); params.push(modification_id); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    try {
      const countResult = await query(`SELECT COUNT(*) FROM quotes q ${where}`, params);
      const total = parseInt(countResult.rows[0].count);

      params.push(limit, offset);
      const result = await query(
        `SELECT q.*, c.name AS contractor_name, c.phone AS contractor_phone, c.email AS contractor_email,
                m.modification_type, m.room, m.description AS modification_description
         FROM quotes q
         JOIN contractors c ON q.contractor_id = c.id
         JOIN modifications m ON q.modification_id = m.id
         ${where}
         ORDER BY q.requested_at DESC
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

// POST /api/quotes — request a quote from a contractor for a modification
router.post(
  '/',
  authenticateToken,
  [
    body('modification_id').isInt({ min: 1 }).withMessage('modification_id must be a positive integer'),
    body('contractor_id').isInt({ min: 1 }).withMessage('contractor_id must be a positive integer'),
    body('notes').optional().isString().trim().isLength({ max: 2000 }),
  ],
  validate,
  async (req, res) => {
    const { modification_id, contractor_id, notes } = req.body;
    try {
      // Verify modification ownership via assessment
      const modCheck = await query(
        `SELECT m.id FROM modifications m
         JOIN assessments a ON m.assessment_id = a.id
         WHERE m.id = $1 AND a.user_id = $2`,
        [modification_id, req.user.id]
      );
      if (modCheck.rows.length === 0) return res.status(404).json({ error: 'Modification not found or access denied' });

      // Verify contractor exists
      const contractorCheck = await query('SELECT id FROM contractors WHERE id = $1', [contractor_id]);
      if (contractorCheck.rows.length === 0) return res.status(404).json({ error: 'Contractor not found' });

      // Check for existing pending quote
      const existing = await query(
        'SELECT id FROM quotes WHERE modification_id = $1 AND contractor_id = $2 AND user_id = $3 AND status = $4',
        [modification_id, contractor_id, req.user.id, 'pending']
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Conflict', message: 'A pending quote already exists for this contractor and modification' });
      }

      const result = await query(
        `INSERT INTO quotes (modification_id, contractor_id, user_id, status, notes)
         VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
        [modification_id, contractor_id, req.user.id, notes || null]
      );
      return res.status(201).json({ quote: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// PATCH /api/quotes/:id — update quote (accept, reject, or add received amount)
router.patch(
  '/:id',
  authenticateToken,
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('status').optional().isIn(['pending', 'received', 'accepted', 'rejected']).withMessage('Invalid status'),
    body('quote_amount').optional({ nullable: true }).isInt({ min: 0 }).withMessage('quote_amount must be a non-negative integer'),
    body('notes').optional().isString().trim().isLength({ max: 2000 }),
  ],
  validate,
  async (req, res) => {
    const { status, quote_amount, notes } = req.body;
    try {
      const ownerCheck = await query('SELECT id FROM quotes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Quote not found or access denied' });

      const result = await query(
        `UPDATE quotes SET
           status = COALESCE($1, status),
           quote_amount = COALESCE($2, quote_amount),
           notes = COALESCE($3, notes),
           responded_at = CASE WHEN $1 IN ('received', 'accepted', 'rejected') THEN NOW() ELSE responded_at END
         WHERE id = $4 RETURNING *`,
        [status || null, quote_amount ?? null, notes || null, req.params.id]
      );
      return res.json({ quote: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// DELETE /api/quotes/:id — cancel/delete a quote request
router.delete(
  '/:id',
  authenticateToken,
  [param('id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      const result = await query(
        'DELETE FROM quotes WHERE id = $1 AND user_id = $2 RETURNING id',
        [req.params.id, req.user.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found or access denied' });
      return res.json({ message: 'Quote deleted successfully' });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

module.exports = router;
