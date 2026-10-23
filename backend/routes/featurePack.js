'use strict';
// Feature pack (wave 25A): authenticated tasks, main-record export and
// record-grounded AI insights with a labelled deterministic fallback.
const express = require('express');
const pool = require('../db').pool;
const authMw = require('../middleware/auth').authenticateToken;
const { toCsv, filterRecords, validateTaskInput, buildDeterministicInsight, callProviderIfConfigured } = require('../lib/featurePack');

const router = express.Router();
router.use(authMw);

const TABLE = 'homes';
const FEATURES = [
    {"id": "home-safety-priority", "label": "Home safety priority digest", "statusKey": "latest_assessment_status", "numericKeys": [], "recommendations": ["Prioritise homes with no recent assessment.", "Schedule follow-up assessments for low accessibility scores."]},
    {"id": "accessibility-watch", "label": "Accessibility score watch", "statusKey": "latest_assessment_status", "numericKeys": [], "recommendations": ["Review homes by accessibility score before quoting work.", "Record missing scores as unknown, not zero risk."]},
    {"id": "modification-backlog", "label": "Modification backlog summary", "statusKey": "latest_assessment_status", "numericKeys": [], "recommendations": ["Group homes by latest assessment status.", "Confirm contractor capacity for the largest group."]}
];

let tasksReady = null;
function ensureTasks() {
  if (!tasksReady) {
    tasksReady = pool.query(`CREATE TABLE IF NOT EXISTS feature_pack_tasks (
      id SERIAL PRIMARY KEY, user_id INTEGER, tenant_id TEXT,
      title VARCHAR(255) NOT NULL, description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'todo', priority VARCHAR(50),
      related_type VARCHAR(100), related_id VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).catch((e) => { tasksReady = null; throw e; });
  }
  return tasksReady;
}
function userId(req) { return (req.user && (req.user.id || (req.user.user && req.user.user.id))) || null; }
function tenantId(req) { return (req.user && (req.user.tenant_id || req.user.tenantId)) || req.tenantId || null; }

async function fetchMainRecords(req) {
  const scoped = true;
  const r = scoped ? await pool.query(`SELECT * FROM ${TABLE} WHERE user_id = $1 ORDER BY id DESC LIMIT 200`, [req.user && req.user.id])
                     : await pool.query(`SELECT * FROM ${TABLE} ORDER BY id DESC LIMIT 200`);
  return r.rows;
}

router.get('/tasks', async (req, res) => {
  try { await ensureTasks(); const uid = userId(req);
    const r = await pool.query('SELECT * FROM feature_pack_tasks WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY id DESC', [uid]);
    res.json({ tasks: r.rows }); } catch (e) { res.status(500).json({ error: 'Failed to list tasks' }); }
});
router.post('/tasks', async (req, res) => {
  const { errors, value } = validateTaskInput(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  try { await ensureTasks();
    const r = await pool.query(`INSERT INTO feature_pack_tasks (user_id, tenant_id, title, description, status, priority, related_type, related_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [userId(req), tenantId(req), value.title, value.description ?? null, value.status || 'todo', value.priority ?? null, value.related_type ?? null, value.related_id ?? null]);
    res.status(201).json({ task: r.rows[0] }); } catch (e) { res.status(500).json({ error: 'Failed to create task' }); }
});
router.put('/tasks/:id', async (req, res) => {
  const { errors, value } = validateTaskInput(req.body || {}, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const keys = Object.keys(value); if (!keys.length) return res.status(400).json({ error: 'No updatable fields supplied' });
  try { await ensureTasks();
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const r = await pool.query(`UPDATE feature_pack_tasks SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} AND user_id IS NOT DISTINCT FROM $${keys.length + 2} RETURNING *`,
      [...keys.map((k) => value[k]), req.params.id, userId(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json({ task: r.rows[0] }); } catch (e) { res.status(500).json({ error: 'Failed to update task' }); }
});
router.patch('/tasks/:id', (req, res, next) => { req.url = req.url; next(); }, async (req, res) => {
  // PATCH mirrors PUT for clients that prefer partial-update verbs.
  const { errors, value } = validateTaskInput(req.body || {}, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const keys = Object.keys(value); if (!keys.length) return res.status(400).json({ error: 'No updatable fields supplied' });
  try { await ensureTasks();
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const r = await pool.query(`UPDATE feature_pack_tasks SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} AND user_id IS NOT DISTINCT FROM $${keys.length + 2} RETURNING *`,
      [...keys.map((k) => value[k]), req.params.id, userId(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json({ task: r.rows[0] }); } catch (e) { res.status(500).json({ error: 'Failed to update task' }); }
});

router.get('/records/export', async (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  if (!['csv', 'json'].includes(format)) return res.status(400).json({ error: 'format must be csv or json' });
  try {
    const records = filterRecords(await fetchMainRecords(req), { q: req.query.q, status: req.query.status });
    if (format === 'csv') { res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${TABLE}.csv"`); return res.send(toCsv(records)); }
    res.setHeader('Content-Disposition', `attachment; filename="${TABLE}.json"`);
    return res.json({ records, count: records.length, exported_at: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: 'Failed to export records' }); }
});

router.get('/ai/features', (req, res) => res.json({ features: FEATURES.map(({ id, label }) => ({ id, label })) }));
router.post('/ai/:feature', async (req, res) => {
  const spec = FEATURES.find((f) => f.id === req.params.feature);
  if (!spec) return res.status(404).json({ error: 'Unknown feature' });
  try {
    const records = await fetchMainRecords(req);
    let ai = null;
    try { ai = await callProviderIfConfigured(spec.id, records, spec); } catch (_) { ai = null; }
    if (ai) return res.json(ai);
    return res.json(buildDeterministicInsight(spec.id, records, spec));
  } catch (e) { res.status(500).json({ error: 'Failed to build insight from records' }); }
});

module.exports = router;
