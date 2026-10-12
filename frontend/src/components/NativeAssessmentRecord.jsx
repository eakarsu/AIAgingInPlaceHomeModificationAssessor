import React, { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import Modal from './AIWorkspaceModal';
import AIReport from './AIReport';
import './AIWorkspace.css';

const display = value => value === null || value === undefined || value === '' ? 'Not supplied' : String(value);
const money = value => value == null ? 'Not estimated' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const modificationFields = [
  ['description', 'Planning description', 'textarea'], ['priority', 'Priority (1–10)', 'number'],
  ['status', 'Recorded status', 'select'], ['completion_pct', 'Recorded completion (%)', 'number'],
  ['start_date', 'Recorded start date', 'date'], ['end_date', 'Recorded end date', 'date'],
  ['notes', 'Owner review notes', 'textarea'],
];
const valueForForm = (record, key) => record[key] == null ? '' : key.endsWith('_date') ? String(record[key]).slice(0, 10) : String(record[key]);

export default function NativeAssessmentRecord({ kind, recordId, onClose, onChanged, onOpenAssessment }) {
  const [record, setRecord] = useState(null);
  const [mode, setMode] = useState('detail');
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const read = useRef(null), mutation = useRef(null);
  const endpoint = `/${kind === 'assessment' ? 'assessments' : 'modifications'}/${recordId}`;
  const itemKey = kind === 'assessment' ? 'assessment' : 'modification';
  const load = async () => {
    read.current?.abort(); const controller = new AbortController(); read.current = controller;
    setLoading(true); setError('');
    try {
      const response = await api.get(endpoint, { signal: controller.signal });
      const item = response.data?.[itemKey];
      if (!item || String(item.id) !== String(recordId)) throw Error('The record service returned an invalid source.');
      if (read.current === controller && !controller.signal.aborted) setRecord(item);
    } catch (failure) {
      if (read.current === controller && !controller.signal.aborted) setError(failure.response?.data?.message || failure.message || 'The source record could not be loaded.');
    } finally {
      if (read.current === controller && !controller.signal.aborted) { read.current = null; setLoading(false); }
    }
  };
  useEffect(() => {
    setRecord(null); setMode('detail'); load();
    return () => { read.current?.abort(); read.current = null; mutation.current?.abort(); mutation.current = null; };
  }, [endpoint]);
  const close = () => { read.current?.abort(); read.current = null; mutation.current?.abort(); mutation.current = null; onClose(); };
  const edit = () => {
    setForm(kind === 'assessment' ? { review_notes: record.review_notes || '' } : Object.fromEntries(modificationFields.map(([key]) => [key, valueForForm(record, key)])));
    setError(''); setMode('edit');
  };
  const save = async () => {
    if (mutation.current) return;
    const controller = new AbortController(); mutation.current = controller; setSaving(true); setError('');
    try {
      if (mode === 'delete') await api.delete(endpoint, { signal: controller.signal });
      else {
        const payload = kind === 'assessment' ? { review_notes: form.review_notes } : { description: form.description, notes: form.notes, status: form.status };
        if (kind === 'modification') {
          for (const key of ['priority', 'completion_pct']) {
            const number = Number(form[key]);
            if (!String(form[key]).trim() || !Number.isInteger(number) || number < (key === 'priority' ? 1 : 0) || number > (key === 'priority' ? 10 : 100)) throw Error('Enter a priority from 1–10 and completion from 0–100.');
            payload[key] = number;
          }
          payload.start_date = form.start_date || null; payload.end_date = form.end_date || null;
          if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) throw Error('End date must be on or after the start date.');
        }
        const response = await api.patch(endpoint, payload, { signal: controller.signal });
        if (String(response.data?.[itemKey]?.id) !== String(recordId)) throw Error('The source service returned an invalid saved record.');
      }
      if (mutation.current !== controller || controller.signal.aborted) return;
      onChanged?.({ kind, id: recordId, deleted: mode === 'delete' }); onClose();
    } catch (failure) {
      if (mutation.current === controller && !controller.signal.aborted) setError(failure.response?.data?.message || failure.message || 'The record change could not be saved.');
    } finally {
      if (mutation.current === controller && !controller.signal.aborted) { mutation.current = null; setSaving(false); }
    }
  };
  const title = `${mode === 'delete' ? 'Delete' : mode === 'edit' ? 'Edit' : 'Native'} ${itemKey}${mode === 'detail' ? ' details' : ''}`;
  const facts = kind === 'assessment' ? [
    ['Native assessment ID', record?.id], ['Native home ID', record?.home_id], ['Home address', record?.address],
    ['Assessment scope', record?.assessment_type], ['Recorded status', record?.status], ['Safety score', record?.safety_score == null ? 'Not assessed' : record.safety_score],
    ['Urgency', record?.urgency_level || 'Not assessed'], ['Owner review notes', record?.review_notes],
  ] : [
    ['Native modification ID', record?.id], ['Native assessment ID', record?.assessment_id], ['Native home ID', record?.home_id],
    ['Home address', record?.address], ['Room', record?.room], ['Modification type', record?.modification_type],
    ['Planning description', record?.description], ['Recorded status', record?.status], ['Priority', record?.priority],
    ['Recorded completion', record?.completion_pct == null ? 'Not recorded' : `${record.completion_pct}%`],
    ['Estimated minimum', money(record?.estimated_cost_min)], ['Estimated maximum', money(record?.estimated_cost_max)],
    ['Assigned contractor', record?.contractor_name || 'Not assigned'], ['Recorded start date', record?.start_date && String(record.start_date).slice(0, 10)],
    ['Recorded end date', record?.end_date && String(record.end_date).slice(0, 10)], ['Owner review notes', record?.notes],
  ];
  return <Modal title={title} onClose={close} footer={<>
    <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
    {!loading && record && (mode === 'detail' ? <><button type="button" className="btn btn-secondary" onClick={edit}>Edit</button><button type="button" className="btn btn-danger" onClick={() => { setError(''); setMode('delete'); }}>Delete</button></> : <button type="button" className={mode === 'delete' ? 'btn btn-danger' : 'btn btn-primary'} disabled={saving} onClick={save}>{saving ? 'Saving…' : mode === 'delete' ? 'Confirm delete' : 'Save changes'}</button>)}
  </>}>
    {loading ? <p role="status">Loading native {itemKey}…</p> : error && !record ? <section role="alert"><p>{error}</p><button type="button" className="btn btn-secondary" onClick={load}>Retry</button></section> : record && <>
      {error && <p role="alert">{error}</p>}
      {mode === 'delete' ? <p>Delete saved {itemKey} #{record.id}? {kind === 'assessment' ? 'Its related modifications, estimates, and quotes are also removed through the existing database relationships.' : 'Related cost estimates and contractor quote records are also removed through the existing database relationships.'} Review these records before confirming. This does not create any approval, payment, or completed work.</p> : mode === 'edit' ? <form onSubmit={event => { event.preventDefault(); save(); }}>
        {(kind === 'assessment' ? [['review_notes', 'Owner review notes', 'textarea']] : modificationFields).map(([key, label, type]) => <div key={key} className="ai-form-field"><label htmlFor={`native-record-${key}`}>{label}</label>{type === 'textarea' ? <textarea id={`native-record-${key}`} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /> : type === 'select' ? <select id={`native-record-${key}`} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })}>{['recommended', 'planned', 'in_progress', 'completed'].map(status => <option key={status}>{status}</option>)}</select> : <input id={`native-record-${key}`} type={type} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} />}</div>)}
        <p className="ai-muted">Owner notes and recorded planning changes preserve native source IDs, provider findings, scores, costs, contractor responses, consent, and approvals. Status and completion are owner-entered records; they do not certify work or make a payment.</p>
      </form> : <>
        <dl>{facts.map(([label, value]) => <React.Fragment key={label}><dt><strong>{label}</strong></dt><dd>{display(value)}</dd></React.Fragment>)}</dl>
        {kind === 'assessment' ? record.ai_result ? <AIReport response={record.ai_result} title="Saved assessment report" /> : <p>No provider answer has been generated. Clinical findings remain unassessed.</p> : <>
          {record.ai_reasoning && <AIReport response={record.ai_reasoning} title="Saved recommendation reasoning" />}
          {record.aging_benefit && <p>{record.aging_benefit}</p>}
          {record.cost_estimate && <AIReport response={record.cost_estimate} title="Saved cost estimate" />}
        </>}
        {onOpenAssessment && <button type="button" className="btn btn-primary" onClick={() => { const source = kind === 'assessment' ? record.id : record.assessment_id; close(); onOpenAssessment(source); }}>Open native assessment workspace</button>}
      </>}
    </>}
  </Modal>;
}
