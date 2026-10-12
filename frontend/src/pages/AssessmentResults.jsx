import FullFieldPresets from '../components/FullFieldPresets';
import AIReport from '../components/AIReport';
import NativeAssessmentRecord from '../components/NativeAssessmentRecord';
import useNativeAI from '../services/useNativeAI';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { readRecordList } from '../services/nativeRecords';

const s = {
  page: { maxWidth: '1000px', margin: '0 auto', padding: '24px' },
  btn: { padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px' },
  btnPrimary: { background: '#667eea', color: '#fff' },
  btnSecondary: { background: '#fff', color: '#4a5568', border: '1px solid #e2e8f0' },
  btnGreen: { background: '#48bb78', color: '#fff' },
  card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', marginBottom: '20px' },
  badge: { display: 'inline-block', padding: '4px 12px', borderRadius: '12px', fontSize: '13px', fontWeight: '600' },
  navbar: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '12px', height: '60px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  tab: { padding: '8px 16px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', borderBottom: '2px solid transparent', background: 'transparent', color: '#718096' },
  tabActive: { color: '#667eea', borderBottom: '2px solid #667eea' },
};

const riskColor = { low: '#c6f6d5', medium: '#fef3c7', high: '#fed7aa', critical: '#fed7d7' };
const riskText = { low: '#22543d', medium: '#92400e', high: '#9c4221', critical: '#c53030' };
const urgencyGradient = { low: '#48bb78', medium: '#ecc94b', high: '#ed8936', critical: '#fc5c7d' };
const statusBg = { recommended: '#ebf8ff', planned: '#faf089', in_progress: '#fef3c7', completed: '#f0fff4' };
const statusText = { recommended: '#2b6cb0', planned: '#744210', in_progress: '#92400e', completed: '#22543d' };

export default function AssessmentResults() {
  const { id } = useParams();
  const {post:aiPost,cancel:cancelAI,busy:aiBusy}=useNativeAI(id);
  const [aiError,setAIError]=useState('');
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState(null);
  const [modifications, setModifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [generatingMods, setGeneratingMods] = useState(false);
  const [estimating, setEstimating] = useState(null);
  const [costEstimates, setCostEstimates] = useState({});

  // Grants state
  const [grants, setGrants] = useState(null);
  const [loadingGrants, setLoadingGrants] = useState(false);
  const [grantForm, setGrantForm] = useState({ state: '', zip_code: '', income_level: '', is_veteran: '', is_disabled: '', funding_goal: '' });

  // Compliance state
  const [compliance, setCompliance] = useState(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);

  // Budget optimizer state
  const [budget, setBudget] = useState('');
  const [budgetResult, setBudgetResult] = useState(null);
  const [loadingBudget, setLoadingBudget] = useState(false);

  // Mod progress state
  const [updatingMod, setUpdatingMod] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const dataRequest = useRef(null);

  useEffect(() => {
    cancelAI(); setSelectedRecord(null); setGrants(null); setCompliance(null); setBudgetResult(null); setCostEstimates({}); setAIError('');
    loadData();
    return () => { dataRequest.current?.abort(); dataRequest.current = null; };
  }, [id]);

  const loadData = async () => {
    dataRequest.current?.abort(); const controller = new AbortController(); dataRequest.current = controller;
    setLoading(true); setLoadError('');
    try {
      const [res, modRes] = await Promise.all([api.get(`/assessments/${id}`, {signal:controller.signal}), api.get(`/modifications?assessmentId=${id}`, {signal:controller.signal})]);
      if (String(res.data.assessment?.id) !== String(id)) throw new Error('The assessment service returned an invalid source record.');
      const rows = readRecordList(modRes.data);
      if (dataRequest.current !== controller || controller.signal.aborted) return;
      setAssessment(res.data.assessment); setModifications(rows);
    } catch (failure) {
      if (dataRequest.current === controller && !controller.signal.aborted) setLoadError(failure.response?.data?.message || failure.message || 'Assessment data could not be loaded.');
    } finally {
      if (dataRequest.current === controller && !controller.signal.aborted) { dataRequest.current = null; setLoading(false); }
    }
  };

  const generateModifications = async () => {
    setGeneratingMods(true);
    try {
      await aiPost('/ai/recommend-modifications', { assessment_id: parseInt(id) });
      const modRes = await api.get(`/modifications?assessmentId=${id}`);
      setModifications(readRecordList(modRes.data));
    } catch (err) {
      if(err.name==='AbortError'||err.code==='ERR_CANCELED')return;
      setAIError(err.response?.data?.message || 'Failed to generate modifications');
    } finally {
      setGeneratingMods(false);
    }
  };

  const estimateCost = async (modId) => {
    setEstimating(modId);
    try {
      const res = await aiPost('/ai/estimate-costs', { modification_id: modId });
      setCostEstimates(prev => ({ ...prev, [modId]: res.data.details }));
    } catch (err) {
      if(err.name==='AbortError'||err.code==='ERR_CANCELED')return;
      setAIError('Failed to estimate cost');
    } finally {
      setEstimating(null);
    }
  };

  const updateModStatus = async (modId, status) => {
    setUpdatingMod(modId);
    try {
      await api.patch(`/modifications/${modId}`, { status });
      const modRes = await api.get(`/modifications?assessmentId=${id}`);
      setModifications(readRecordList(modRes.data));
    } catch (err) {
      setAIError(err.response?.data?.message || err.message || 'The modification status could not be saved.');
    } finally {
      setUpdatingMod(null);
    }
  };

  const findGrants = async (e) => {
    e.preventDefault();
    setLoadingGrants(true);setAIError('');
    try {
      const res = await aiPost('/ai/find-grants', {
        home_id: assessment.home_id,
        state: grantForm.state === 'Unknown' ? undefined : grantForm.state || undefined,
        zip_code: grantForm.zip_code === 'Unknown' ? undefined : grantForm.zip_code || undefined,
        income_level: grantForm.income_level === 'unknown' ? undefined : grantForm.income_level || undefined,
        is_veteran: grantForm.is_veteran === 'unknown' || !grantForm.is_veteran ? undefined : grantForm.is_veteran === 'yes',
        is_disabled: grantForm.is_disabled === 'unknown' || !grantForm.is_disabled ? undefined : grantForm.is_disabled === 'yes',
        funding_goal: grantForm.funding_goal || undefined,
      });
      setGrants(res.data);
    } catch (err) {
      if(err.name==='AbortError'||err.code==='ERR_CANCELED')return;
      setAIError(err.response?.data?.message || 'Failed to find grants');
    } finally {
      setLoadingGrants(false);
    }
  };

  const runCompliance = async () => {
    setLoadingCompliance(true);
    try {
      const res = await aiPost('/ai/compliance-report', { assessment_id: parseInt(id) });
      setCompliance(res.data);
    } catch (err) {
      if(err.name==='AbortError'||err.code==='ERR_CANCELED')return;
      setAIError(err.response?.data?.message || 'Failed to generate compliance report');
    } finally {
      setLoadingCompliance(false);
    }
  };

  const runBudgetOptimizer = async (e) => {
    e.preventDefault();
    if (!budget || parseInt(budget) < 100) return setAIError('Please enter a valid budget (min $100)');
    setLoadingBudget(true);setAIError('');
    try {
      const res = await aiPost('/ai/budget-optimizer', {
        home_id: assessment.home_id,
        budget: parseInt(budget),
      });
      setBudgetResult(res.data);
    } catch (err) {
      if(err.name==='AbortError'||err.code==='ERR_CANCELED')return;
      setAIError(err.response?.data?.message || 'Failed to optimize budget');
    } finally {
      setLoadingBudget(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '80px', color: '#718096' }}>Loading assessment...</div>;
  if (loadError) return <section role="alert" style={s.card}><h1>Assessment data could not be loaded</h1><p>{loadError}</p><button type="button" style={{ ...s.btn, ...s.btnSecondary }} onClick={loadData}>Retry</button></section>;
  if (!assessment) return <div style={{ textAlign: 'center', padding: '80px' }}>Assessment not found</div>;

  const aiResult = assessment.ai_result || {};
  const roomRisks = aiResult.room_risks || [];
  const topPriorities = aiResult.top_priorities || [];
  const immediateActions = aiResult.immediate_actions || [];
  const score = assessment.safety_score ?? aiResult.safety_score ?? null;
  const urgency = assessment.urgency_level || aiResult.urgency_level || 'Not assessed';

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'modifications', label: `Modifications (${modifications.length})` },
    { key: 'grants', label: 'Funding & Grants' },
    { key: 'compliance', label: 'ADA Compliance' },
    { key: 'budget', label: 'Budget Planner' },
  ];

  return (
    <>
      <nav style={s.navbar}>
        <button style={{ ...s.btn, ...s.btnSecondary, padding: '6px 14px' }} onClick={() => navigate(-1)}>← Back</button>
        <span style={{ fontWeight: '700', fontSize: '16px' }}>Assessment Results</span>
      </nav>
      {selectedRecord && <NativeAssessmentRecord kind={selectedRecord.kind} recordId={selectedRecord.id} onClose={() => setSelectedRecord(null)} onChanged={change => {if(change.kind==='assessment'&&change.deleted)navigate('/homes/'+assessment.home_id);else loadData();}}/>}
      <div style={s.page}>
        {aiError&&<section role="alert" className="ai-alert">{aiError}</section>}
        {aiBusy&&<div role="status" className="ai-loading">Generating with OpenRouter… <button type="button" style={{...s.btn,...s.btnSecondary}} onClick={cancelAI}>Cancel AI request</button></div>}
        <button type="button" style={{...s.btn,...s.btnSecondary,marginBottom:16}} onClick={() => setSelectedRecord({kind:'assessment',id:assessment.id})}>Open assessment details</button>
        {/* Score Hero */}
        <div style={{ ...s.card, background: `linear-gradient(135deg, ${urgencyGradient[urgency] || '#667eea'} 0%, #764ba2 100%)`, color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: '22px' }}>{assessment.address || 'Home Assessment'}</h2>
              <p style={{ margin: 0, opacity: 0.85, fontSize: '14px', textTransform: 'capitalize' }}>
                {assessment.assessment_type} Assessment • {new Date(assessment.created_at).toLocaleDateString()}
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '56px', fontWeight: '800', lineHeight: 1 }}>{score === null ? 'Not assessed' : score}</div>
              <div style={{ fontSize: '13px', opacity: 0.85 }}>Safety Score / 100</div>
              <div style={{ marginTop: '8px', background: 'rgba(255,255,255,0.2)', padding: '4px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', textTransform: 'capitalize' }}>
                {urgency} Urgency
              </div>
            </div>
          </div>
          {aiResult.overall_assessment && (
            <p style={{ margin: '20px 0 0', opacity: 0.9, fontSize: '14px', lineHeight: 1.6, borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '16px' }}>
              {aiResult.overall_assessment}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', marginBottom: '20px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 8px' }}>
            {tabs.map(t => (
              <button key={t.key} style={{ ...s.tab, ...(activeTab === t.key ? s.tabActive : {}) }} onClick={() => setActiveTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <>
            {/* Room Risks */}
            {roomRisks.length > 0 && (
              <div style={s.card}>
                <h3 style={{ margin: '0 0 16px' }}>Room Risk Assessment</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                  {roomRisks.map((room, i) => (
                    <div key={i} style={{ padding: '14px', background: riskColor[room.risk_level] || '#f7fafc', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: '700', textTransform: 'capitalize', color: '#2d3748' }}>{room.room}</span>
                        <span style={{ color: riskText[room.risk_level] || '#4a5568', fontSize: '12px', fontWeight: '600' }}>{room.risk_level} risk</span>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', color: riskText[room.risk_level] || '#4a5568' }}>
                        {(room.issues || []).map((issue, j) => <li key={j}>{issue}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Priorities */}
            {topPriorities.length > 0 && (
              <div style={s.card}>
                <h3 style={{ margin: '0 0 16px' }}>Top Priorities</h3>
                {topPriorities.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                    <div style={{ width: '24px', height: '24px', background: '#667eea', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '12px', flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: '14px', color: '#2d3748', lineHeight: 1.5 }}>{p}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Immediate Actions */}
            {immediateActions.length > 0 && (
              <div style={{ ...s.card, background: '#fff5f5', border: '1px solid #fc8181' }}>
                <h3 style={{ margin: '0 0 12px', color: '#c53030' }}>Immediate Actions Required</h3>
                {immediateActions.map((action, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ color: '#c53030', fontWeight: '700', flexShrink: 0 }}>!</span>
                    <span style={{ fontSize: '14px', color: '#c53030' }}>{action}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Cost Range */}
            {aiResult.estimated_total_cost_range && (
              <div style={s.card}>
                <h3 style={{ margin: '0 0 12px' }}>Estimated Total Cost Range</h3>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#667eea' }}>
                  ${(aiResult.estimated_total_cost_range.min || 0).toLocaleString()} – ${(aiResult.estimated_total_cost_range.max || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '13px', color: '#718096', marginTop: '4px' }}>
                  For approximately {aiResult.estimated_modification_count || '?'} recommended modifications
                </div>
              </div>
            )}
          </>
        )}

        {/* MODIFICATIONS TAB */}
        {activeTab === 'modifications' && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Recommended Modifications ({modifications.length})</h3>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={generateModifications} disabled={generatingMods}>
                {generatingMods ? 'Generating...' : 'Generate modifications with OpenRouter'}
              </button>
            </div>

            {modifications.length === 0 ? (
              <p style={{ color: '#718096', fontSize: '14px' }}>No modifications generated yet. Click the button above.</p>
            ) : modifications.map(m => (
              <div key={m.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '700', fontSize: '15px', textTransform: 'capitalize' }}>
                        {m.modification_type?.replace(/_/g, ' ')} — {m.room}
                      </span>
                      <span style={{ ...s.badge, background: statusBg[m.status] || '#e2e8f0', color: statusText[m.status] || '#4a5568', fontSize: '11px', padding: '2px 8px' }}>{m.status}</span>
                    </div>
                    <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#4a5568' }}>{m.description}</p>
                    {m.aging_benefit && (
                      <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#2b6cb0', background: '#ebf8ff', padding: '6px 10px', borderRadius: '6px' }}>
                        ✓ {m.aging_benefit}
                      </p>
                    )}
                    {m.ai_reasoning && (
                      <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#718096', fontStyle: 'italic' }}>{m.ai_reasoning}</p>
                    )}
                    {(m.estimated_cost_min || m.estimated_cost_max) && (
                      <div style={{ fontSize: '13px', color: '#718096' }}>
                        Estimated: <strong>${(m.estimated_cost_min || 0).toLocaleString()} – ${(m.estimated_cost_max || 0).toLocaleString()}</strong>
                      </div>
                    )}
                    {m.completion_pct > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '12px', color: '#718096', marginBottom: '4px' }}>Progress: {m.completion_pct}%</div>
                        <div style={{ background: '#e2e8f0', borderRadius: '4px', height: '6px' }}>
                          <div style={{ background: '#48bb78', height: '6px', borderRadius: '4px', width: `${m.completion_pct}%` }} />
                        </div>
                      </div>
                    )}
                    {/* Show cost estimate if generated */}
                    {costEstimates[m.id] && (
                      <div style={{ marginTop: '10px', background: '#f7fafc', padding: '12px', borderRadius: '6px', fontSize: '13px' }}>
                        <strong>Detailed Cost Estimate:</strong>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' }}>
                          <div><div style={{ color: '#718096' }}>Labor</div><strong>${(costEstimates[m.id].labor_cost || 0).toLocaleString()}</strong></div>
                          <div><div style={{ color: '#718096' }}>Materials</div><strong>${(costEstimates[m.id].materials_cost || 0).toLocaleString()}</strong></div>
                          <div><div style={{ color: '#718096' }}>Timeline</div><strong>{costEstimates[m.id].timeline_days || 'N/A'} days</strong></div>
                        </div>
                        {costEstimates[m.id].permits_cost > 0 && (
                          <div style={{ marginTop: '6px', fontSize: '12px', color: '#718096' }}>Permits: ${costEstimates[m.id].permits_cost.toLocaleString()}</div>
                        )}
                        {costEstimates[m.id].total_estimated_cost > 0 && (
                          <div style={{ marginTop: '4px', fontWeight: '600' }}>Total: ${costEstimates[m.id].total_estimated_cost.toLocaleString()}</div>
                        )}
                        {costEstimates[m.id].avoided_costs_explanation && (
                          <p style={{ margin: '8px 0 0', color: '#22543d', fontSize: '12px' }}>ROI: {costEstimates[m.id].avoided_costs_explanation}</p>
                        )}
                        {costEstimates[m.id].contractor_tips && (
                          <p style={{ margin: '6px 0 0', color: '#2b6cb0', fontSize: '12px' }}>Tip: {costEstimates[m.id].contractor_tips}</p>
                        )}
                        {costEstimates[m.id].notes && <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: '12px' }}>{costEstimates[m.id].notes}</p>}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginLeft: '16px', flexShrink: 0, alignItems: 'flex-end' }}>
                    <span style={{ ...s.badge, background: '#ebf8ff', color: '#2b6cb0', fontSize: '11px', padding: '2px 8px' }}>P{m.priority}</span>
                    <button type="button" style={{...s.btn,...s.btnSecondary,padding:'5px 10px',fontSize:'12px'}} onClick={() => setSelectedRecord({kind:'modification',id:m.id})}>Open details</button>
                    <button style={{ ...s.btn, ...s.btnSecondary, padding: '5px 10px', fontSize: '12px' }} onClick={() => estimateCost(m.id)} disabled={estimating === m.id}>
                      {estimating === m.id ? '...' : 'Generate cost estimate with OpenRouter'}
                    </button>
                    {m.status === 'recommended' && (
                      <button style={{ ...s.btn, ...s.btnPrimary, padding: '5px 10px', fontSize: '12px' }} disabled={updatingMod === m.id} onClick={() => updateModStatus(m.id, 'planned')}>Plan</button>
                    )}
                    {m.status === 'planned' && (
                      <button style={{ ...s.btn, background: '#ed8936', color: '#fff', padding: '5px 10px', fontSize: '12px' }} disabled={updatingMod === m.id} onClick={() => updateModStatus(m.id, 'in_progress')}>Start</button>
                    )}
                    {m.status === 'in_progress' && (
                      <button style={{ ...s.btn, ...s.btnGreen, padding: '5px 10px', fontSize: '12px' }} disabled={updatingMod === m.id} onClick={() => updateModStatus(m.id, 'completed')}>Done</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* GRANTS TAB */}
        {activeTab === 'grants' && (
          <div>
            <div style={s.card}>
              <h3 style={{ margin: '0 0 16px' }}>Find Funding & Grants</h3>
              <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#718096' }}>
                Discover federal, state, and local programs that may fund your home modifications.
              </p>
              <form data-native-ai="grants" onSubmit={findGrants}>
                <FullFieldPresets value={grantForm} onChange={setGrantForm} disabled={aiBusy} presets={['Find source requirements','Compare program routes','Review eligibility gaps'].map((label,index)=>({label,values:{state:'Unknown',zip_code:'Unknown',income_level:'unknown',is_veteran:'unknown',is_disabled:'unknown',funding_goal:['Identify missing verified location and eligibility data before ranking possible programs.','Compare potential public and nonprofit program types, marking all eligibility unverified.','Prepare a checklist of authorized documents and review questions; do not claim any eligibility or approved funding.'][index]}}))}/>
                <p className="ai-muted">Each choice fills every field. Unknown eligibility stays unknown; no application, approval, or payment is created.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5568', display: 'block', marginBottom: '4px' }}>State</label>
                    <input style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                      placeholder="e.g. California" value={grantForm.state} onChange={e => setGrantForm(p => ({ ...p, state: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5568', display: 'block', marginBottom: '4px' }}>ZIP Code</label>
                    <input style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                      placeholder="e.g. 90210" value={grantForm.zip_code} onChange={e => setGrantForm(p => ({ ...p, zip_code: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5568', display: 'block', marginBottom: '4px' }}>Income Level</label>
                    <select style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                      value={grantForm.income_level} onChange={e => setGrantForm(p => ({ ...p, income_level: e.target.value }))}>
                      <option value="">Choose income information</option><option value="unknown">Unknown — not supplied</option>
                      <option value="very_low">Very Low (&lt; 50% AMI)</option>
                      <option value="low">Low (50–80% AMI)</option>
                      <option value="moderate">Moderate (80–120% AMI)</option>
                      <option value="above_moderate">Above Moderate (&gt; 120% AMI)</option>
                    </select>
                  </div>
                  <div>{[['is_veteran','Veteran status'],['is_disabled','Disability status']].map(([key,label])=><label key={key} style={{display:'block',marginBottom:12}}>{label}<select value={grantForm[key]} onChange={e=>setGrantForm(p=>({...p,[key]:e.target.value}))}><option value="">Choose verified status</option><option value="unknown">Unknown — not supplied</option><option value="yes">Yes — verified</option><option value="no">No — verified</option></select></label>)}</div>
                  <label>Funding review goal<textarea value={grantForm.funding_goal} onChange={e=>setGrantForm(p=>({...p,funding_goal:e.target.value}))}/></label>
                </div>
                <button type="submit" style={{ ...s.btn, ...s.btnPrimary }} disabled={aiBusy}>
                  {loadingGrants ? 'Searching AI...' : 'Generate funding report with OpenRouter'}
                </button>
              </form>
            </div>

            {grants && <AIReport response={grants} title="Funding options review"/>}
          </div>
        )}

        {/* COMPLIANCE TAB */}
        {activeTab === 'compliance' && (
          <div>
            <div style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px' }}>ADA / Fair Housing Compliance Report</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>Evaluate this home against ADA Title III and Fair Housing Amendment Act standards.</p>
                </div>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={runCompliance} disabled={loadingCompliance}>
                  {loadingCompliance ? 'Analyzing...' : 'Generate compliance report with OpenRouter'}
                </button>
              </div>
            </div>

            {compliance && <AIReport response={compliance} title="Accessibility compliance review"/>}
          </div>
        )}

        {/* BUDGET PLANNER TAB */}
        {activeTab === 'budget' && (
          <div>
            <div style={s.card}>
              <h3 style={{ margin: '0 0 8px' }}>Budget Planner</h3>
              <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#718096' }}>
                Enter your available budget and AI will select the optimal modifications for maximum safety improvement.
              </p>
              <FullFieldPresets value={{budget}} onChange={next=>setBudget(next.budget)} disabled={aiBusy} presets={[5000,10000,20000].map(value=>({label:`Plan a $${value.toLocaleString()} budget`,values:{budget:String(value)}}))}/><p className="ai-muted">Illustrative planning amounts only. Review your available budget before generating.</p>
              <form data-native-ai="budget" onSubmit={runBudgetOptimizer} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <span style={{ padding: '10px 12px', background: '#f7fafc', borderRight: '1px solid #e2e8f0', fontWeight: '600', color: '#4a5568' }}>$</span>
                  <input type="number" min="100" step="100" style={{ padding: '10px 14px', border: 'none', outline: 'none', fontSize: '15px', width: '160px' }}
                    placeholder="10,000" value={budget} onChange={e => setBudget(e.target.value)} />
                </div>
                <button type="submit" style={{ ...s.btn, ...s.btnPrimary }} disabled={aiBusy || modifications.length === 0}>
                  {loadingBudget ? 'Optimizing...' : 'Generate budget plan with OpenRouter'}
                </button>
                {modifications.length === 0 && <span style={{ fontSize: '13px', color: '#c05621' }}>Generate modifications first</span>}
              </form>
            </div>

            {budgetResult && <AIReport response={budgetResult} title="Budget planning report"/>}
          </div>
        )}
      </div>
    </>
  );
}
