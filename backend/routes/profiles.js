const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation Error', errors: errors.array() });
  next();
};

// GET /api/profiles/:home_id — get resident profile for a home
router.get(
  '/:home_id',
  authenticateToken,
  [param('home_id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      // Verify home ownership
      const homeCheck = await query('SELECT id FROM homes WHERE id = $1 AND user_id = $2', [req.params.home_id, req.user.id]);
      if (homeCheck.rows.length === 0) return res.status(404).json({ error: 'Home not found' });

      const result = await query(
        'SELECT * FROM resident_profiles WHERE home_id = $1 AND user_id = $2',
        [req.params.home_id, req.user.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'No profile found for this home' });
      return res.json({ profile: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// PUT /api/profiles/:home_id — create or update resident profile
router.put(
  '/:home_id',
  authenticateToken,
  [
    param('home_id').isInt({ min: 1 }).toInt(),
    body('resident_name').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('age').optional({ nullable: true }).isInt({ min: 1, max: 130 }).withMessage('age must be 1-130'),
    body('mobility_issues').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
    body('vision_issues').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
    body('balance_issues').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
    body('medical_notes').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  ],
  validate,
  async (req, res) => {
    const { resident_name, age, mobility_issues, vision_issues, balance_issues, medical_notes } = req.body;
    try {
      // Verify home ownership
      const homeCheck = await query('SELECT id FROM homes WHERE id = $1 AND user_id = $2', [req.params.home_id, req.user.id]);
      if (homeCheck.rows.length === 0) return res.status(404).json({ error: 'Home not found' });

      const result = await query(
        `INSERT INTO resident_profiles (home_id, user_id, resident_name, age, mobility_issues, vision_issues, balance_issues, medical_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (home_id, user_id) DO UPDATE SET
           resident_name = COALESCE(EXCLUDED.resident_name, resident_profiles.resident_name),
           age = COALESCE(EXCLUDED.age, resident_profiles.age),
           mobility_issues = COALESCE(EXCLUDED.mobility_issues, resident_profiles.mobility_issues),
           vision_issues = COALESCE(EXCLUDED.vision_issues, resident_profiles.vision_issues),
           balance_issues = COALESCE(EXCLUDED.balance_issues, resident_profiles.balance_issues),
           medical_notes = COALESCE(EXCLUDED.medical_notes, resident_profiles.medical_notes),
           updated_at = NOW()
         RETURNING *`,
        [req.params.home_id, req.user.id, resident_name || null, age || null,
         mobility_issues || null, vision_issues || null, balance_issues || null, medical_notes || null]
      );
      return res.json({ profile: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// DELETE /api/profiles/:home_id — remove resident profile
router.delete(
  '/:home_id',
  authenticateToken,
  [param('home_id').isInt({ min: 1 }).toInt()],
  validate,
  async (req, res) => {
    try {
      const result = await query(
        'DELETE FROM resident_profiles WHERE home_id = $1 AND user_id = $2 RETURNING id',
        [req.params.home_id, req.user.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
      return res.json({ message: 'Resident profile deleted successfully' });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

module.exports = router;
