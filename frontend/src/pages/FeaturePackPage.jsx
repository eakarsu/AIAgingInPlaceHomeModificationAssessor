import React, { useCallback, useEffect, useState } from 'react';

// Feature pack (wave 25A): authenticated tasks, main-record export links and
// record-grounded AI insights. AI JSON is rendered as labelled sections and
// 0 / false / empty values are shown explicitly instead of being dropped.
function token() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /token/i.test(k)) { const v = localStorage.getItem(k); if (v && v.split('.').length === 3) return v; }
    }
  } catch (_) {}
  return '';
}
async function api(path, options = {}) {
  const t = token();
  const res = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
  return data;
}
export function renderValue(v) {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(empty)';
  return String(v);
}
function InsightSections({ result }) {
  if (!result) return null;
  const metrics = result.metrics || {};
  return (
    <section aria-label="AI insight result">
      <h3>{renderValue(result.label || result.feature)}</h3>
      <p><strong>AI-generated:</strong> {renderValue(result.aiGenerated)}</p>
      {result.aiGenerated === false ? <p role="note">Deterministic fallback — not AI-generated. {renderValue(result.note)}</p> : null}
      <h4>Summary</h4><p>{renderValue(result.summary)}</p>
      <h4>Metrics</h4>
      <dl>{Object.entries(metrics).map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{typeof v === 'object' && v !== null ? JSON.stringify(v) : renderValue(v)}</dd></div>))}</dl>
      <h4>Findings</h4>
      {(result.findings && result.findings.length) ? <ul>{result.findings.map((f, i) => <li key={i}>{renderValue(f)}</li>)}</ul> : <p>(empty)</p>}
      <h4>Recommendations</h4>
      {(result.recommendations && result.recommendations.length) ? <ul>{result.recommendations.map((f, i) => <li key={i}>{renderValue(f)}</li>)}</ul> : <p>(empty)</p>}
      <h4>Records considered</h4><p>{renderValue(result.recordsConsidered)}</p>
    </section>
  );
}
export default function FeaturePackPage() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [features, setFeatures] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const loadTasks = useCallback(async () => { try { const d = await api('/feature-pack/tasks'); setTasks(d.tasks || []); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { loadTasks(); api('/feature-pack/ai/features').then((d) => setFeatures(d.features || [])).catch((e) => setError(e.message)); }, [loadTasks]);
  const createTask = async (e) => { e.preventDefault(); try { await api('/feature-pack/tasks', { method: 'POST', body: JSON.stringify({ title }) }); setTitle(''); loadTasks(); } catch (err) { setError(err.message); } };
  const toggle = async (task) => { try { await api('/feature-pack/tasks/' + task.id, { method: 'PUT', body: JSON.stringify({ status: task.status === 'done' ? 'todo' : 'done' }) }); loadTasks(); } catch (err) { setError(err.message); } };
  const run = async (id) => { try { setResult(await api('/feature-pack/ai/' + id, { method: 'POST', body: '{}' })); } catch (err) { setError(err.message); } };
  return (
    <main>
      <h2>Tasks, export &amp; record insights</h2>
      {error ? <p role="alert">{error}</p> : null}
      <h3>Tasks</h3>
      <form onSubmit={createTask}><label>New task title <input value={title} onChange={(e) => setTitle(e.target.value)} required /></label><button type="submit">Create task</button></form>
      {tasks.length ? <ul>{tasks.map((t) => <li key={t.id}>{renderValue(t.title)} — status: {renderValue(t.status)} <button type="button" onClick={() => toggle(t)}>{t.status === 'done' ? 'Reopen' : 'Mark done'}</button></li>)}</ul> : <p>No tasks yet (empty).</p>}
      <h3>Export main records</h3>
      <p><a href="/api/feature-pack/records/export?format=csv">Download CSV</a> {' '}<a href="/api/feature-pack/records/export?format=json">Download JSON</a></p>
      <h3>Record insights</h3>
      {features.map((f) => <button key={f.id} type="button" onClick={() => run(f.id)}>{f.label}</button>)}
      <InsightSections result={result} />
    </main>
  );
}
