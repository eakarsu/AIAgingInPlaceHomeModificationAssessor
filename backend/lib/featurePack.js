'use strict';
// Feature-pack pure helpers (wave 25A). No DB / network access in this module,
// so it is unit-testable offline.
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(records) {
  const rows = Array.isArray(records) ? records : [];
  if (!rows.length) return '';
  const keys = [];
  for (const r of rows) for (const k of Object.keys(r || {})) if (!keys.includes(k)) keys.push(k);
  return [keys.join(','), ...rows.map((r) => keys.map((k) => csvEscape(r ? r[k] : '')).join(','))].join('\n') + '\n';
}
function filterRecords(records, filters = {}) {
  const rows = Array.isArray(records) ? records : [];
  const q = String(filters.q || '').trim().toLowerCase();
  return rows.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    for (const [key, val] of Object.entries(filters)) {
      if (key === 'q' || val === undefined || val === null || val === '') continue;
      if (!(key in r)) continue;
      if (String(r[key]).toLowerCase() !== String(val).toLowerCase()) return false;
    }
    if (!q) return true;
    return Object.values(r).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q));
  });
}
const TASK_STATUSES = ['todo', 'in_progress', 'done'];
function validateTaskInput(body, { partial = false } = {}) {
  const errors = [];
  const out = {};
  if (!partial || body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) errors.push('title is required');
    else if (title.length > 255) errors.push('title must be at most 255 characters');
    else out.title = title;
  }
  if (body.description !== undefined) out.description = body.description === null ? null : String(body.description).slice(0, 2000);
  if (body.status !== undefined) {
    if (!TASK_STATUSES.includes(body.status)) errors.push('status must be one of: ' + TASK_STATUSES.join(', '));
    else out.status = body.status;
  }
  if (body.priority !== undefined) out.priority = String(body.priority).slice(0, 50);
  if (body.related_type !== undefined) out.related_type = body.related_type === null ? null : String(body.related_type).slice(0, 100);
  if (body.related_id !== undefined) out.related_id = body.related_id === null ? null : String(body.related_id).slice(0, 100);
  return { errors, value: out };
}
// Deterministic, record-grounded insight. Preserves 0 / false / empty counts
// explicitly instead of dropping falsy values.
function buildDeterministicInsight(feature, records, spec = {}) {
  const rows = Array.isArray(records) ? records : [];
  const statusKey = spec.statusKey || 'status';
  const numericKeys = spec.numericKeys || [];
  const byStatus = {};
  let recordsWithNoStatus = 0;
  for (const r of rows) {
    const s = r && r[statusKey] !== undefined && r[statusKey] !== null && r[statusKey] !== '' ? String(r[statusKey]) : '';
    if (!s) recordsWithNoStatus += 1; else byStatus[s] = (byStatus[s] || 0) + 1;
  }
  const numericTotals = {};
  for (const k of numericKeys) numericTotals[k] = rows.reduce((sum, r) => sum + (Number(r && r[k]) || 0), 0);
  const topStatus = Object.entries(byStatus).sort((a, b) => b[1] - a[1])[0] || null;
  const findings = [
    `Records considered: ${rows.length}`,
    topStatus ? `Most common ${statusKey}: ${topStatus[0]} (${topStatus[1]})` : `Most common ${statusKey}: (empty) (0)`,
    `Records with no ${statusKey}: ${recordsWithNoStatus}`,
    ...numericKeys.map((k) => `Total ${k}: ${numericTotals[k]}`),
    ...(spec.findings ? spec.findings(rows, { byStatus, numericTotals }) : []),
  ];
  return {
    feature,
    label: spec.label || feature,
    aiGenerated: false,
    mode: 'deterministic-fallback',
    note: 'Deterministic fallback — no AI provider was called because OPENROUTER_API_KEY/OPENAI_API_KEY is not configured, or the provider call did not return usable JSON. Values below are computed directly from this app\'s records; 0, false and empty values are preserved.',
    summary: rows.length
      ? `${spec.label || feature}: reviewed ${rows.length} record(s). ${topStatus ? `${topStatus[1]} record(s) are "${topStatus[0]}".` : 'No record has a status value.'}`
      : `${spec.label || feature}: no records were available to review (records considered: 0).`,
    metrics: { totalRecords: rows.length, byStatus, recordsWithNoStatus, numericTotals },
    findings,
    recommendations: spec.recommendations || ['Review the largest status group first.', 'Fill in missing status values so follow-up work can be tracked.'],
    recordsConsidered: rows.length,
  };
}
function providerConfigured(env = process.env) {
  return Boolean((env.OPENROUTER_API_KEY || '').trim() || (env.OPENAI_API_KEY || '').trim());
}
async function callProviderIfConfigured(feature, records, spec = {}, env = process.env, fetchFn = global.fetch) {
  const openRouterKey = (env.OPENROUTER_API_KEY || '').trim();
  const openAiKey = (env.OPENAI_API_KEY || '').trim();
  if (!openRouterKey && !openAiKey) return null;
  if (typeof fetchFn !== 'function') return null;
  const useOpenRouter = Boolean(openRouterKey);
  const url = useOpenRouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
  const model = useOpenRouter ? (env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5') : (env.OPENAI_MODEL || 'gpt-4o-mini');
  const sample = (Array.isArray(records) ? records : []).slice(0, 50);
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${useOpenRouter ? openRouterKey : openAiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `You analyse records for the feature "${spec.label || feature}". Return only JSON: {"summary":string,"findings":[string],"recommendations":[string]}. Do not invent records.` },
        { role: 'user', content: `Records (JSON): ${JSON.stringify(sample)}` },
      ],
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`Provider request failed (${response.status})`);
  const data = await response.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  let parsed = null;
  try { parsed = JSON.parse(String(text || '').replace(/```(?:json)?/g, '').trim()); } catch (_) { parsed = null; }
  if (!parsed || typeof parsed.summary !== 'string') return null;
  return {
    feature, label: spec.label || feature, aiGenerated: true,
    provider: useOpenRouter ? 'openrouter' : 'openai', model,
    summary: parsed.summary,
    findings: Array.isArray(parsed.findings) ? parsed.findings : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    metrics: { totalRecords: sample.length },
    recordsConsidered: sample.length,
  };
}
module.exports = { csvEscape, toCsv, filterRecords, validateTaskInput, TASK_STATUSES, buildDeterministicInsight, providerConfigured, callProviderIfConfigured };
