import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

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
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState(null);
  const [modifications, setModifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [generatingMods, setGeneratingMods] = useState(false);
  const [estimating, setEstimating] = useState(null);
  const [costEstimates, setCostEstimates] = useState({});

  // Grants state
  const [grants, setGrants] = useState(null);
  const [loadingGrants, setLoadingGrants] = useState(false);
  const [grantForm, setGrantForm] = useState({ state: '', zip_code: '', income_level: '', is_veteran: false, is_disabled: false });

  // Compliance state
  const [compliance, setCompliance] = useState(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);

  // Budget optimizer state
  const [budget, setBudget] = useState('');
  const [budgetResult, setBudgetResult] = useState(null);
  const [loadingBudget, setLoadingBudget] = useState(false);

  // Mod progress state
  const [updatingMod, setUpdatingMod] = useState(null);

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      const res = await api.get(`/assessments/${id}`);
      setAssessment(res.data.assessment);
      const modRes = await api.get(`/modifications?assessmentId=${id}`);
      setModifications(modRes.data.data || []);
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateModifications = async () => {
    setGeneratingMods(true);
    try {
      await api.post('/ai/recommend-modifications', { assessment_id: parseInt(id) });
      const modRes = await api.get(`/modifications?assessmentId=${id}`);
      setModifications(modRes.data.data || []);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate modifications');
    } finally {
      setGeneratingMods(false);
    }
  };

  const estimateCost = async (modId) => {
    setEstimating(modId);
    try {
      const res = await api.post('/ai/estimate-costs', { modification_id: modId });
      setCostEstimates(prev => ({ ...prev, [modId]: res.data.details }));
    } catch (err) {
      alert('Failed to estimate cost');
    } finally {
      setEstimating(null);
    }
  };

  const updateModStatus = async (modId, status) => {
    setUpdatingMod(modId);
    try {
      await api.patch(`/modifications/${modId}`, { status });
      const modRes = await api.get(`/modifications?assessmentId=${id}`);
      setModifications(modRes.data.data || []);
    } catch (err) {
      console.error('Update mod error:', err);
    } finally {
      setUpdatingMod(null);
    }
  };

  const findGrants = async (e) => {
    e.preventDefault();
    setLoadingGrants(true);
    try {
      const res = await api.post('/ai/find-grants', {
        home_id: assessment.home_id,
        state: grantForm.state || undefined,
        zip_code: grantForm.zip_code || undefined,
        income_level: grantForm.income_level || undefined,
        is_veteran: grantForm.is_veteran,
        is_disabled: grantForm.is_disabled,
      });
      setGrants(res.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to find grants');
    } finally {
      setLoadingGrants(false);
    }
  };

  const runCompliance = async () => {
    setLoadingCompliance(true);
    try {
      const res = await api.post('/ai/compliance-report', { assessment_id: parseInt(id) });
      setCompliance(res.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate compliance report');
    } finally {
      setLoadingCompliance(false);
    }
  };

  const runBudgetOptimizer = async (e) => {
    e.preventDefault();
    if (!budget || parseInt(budget) < 100) return alert('Please enter a valid budget (min $100)');
    setLoadingBudget(true);
    try {
      const res = await api.post('/ai/budget-optimizer', {
        home_id: assessment.home_id,
        budget: parseInt(budget),
      });
      setBudgetResult(res.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to optimize budget');
    } finally {
      setLoadingBudget(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '80px', color: '#718096' }}>Loading assessment...</div>;
  if (!assessment) return <div style={{ textAlign: 'center', padding: '80px' }}>Assessment not found</div>;

  const aiResult = assessment.ai_result || {};
  const roomRisks = aiResult.room_risks || [];
  const topPriorities = aiResult.top_priorities || [];
  const immediateActions = aiResult.immediate_actions || [];
  const score = assessment.safety_score || aiResult.safety_score || 0;
  const urgency = assessment.urgency_level || aiResult.urgency_level || 'low';

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
      <div style={s.page}>
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
              <div style={{ fontSize: '56px', fontWeight: '800', lineHeight: 1 }}>{score}</div>
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
                {generatingMods ? 'Generating...' : 'Generate AI Modifications'}
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
                    <button style={{ ...s.btn, ...s.btnSecondary, padding: '5px 10px', fontSize: '12px' }} onClick={() => estimateCost(m.id)} disabled={estimating === m.id}>
                      {estimating === m.id ? '...' : 'Cost Est.'}
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
              <form onSubmit={findGrants}>
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
                      <option value="">Not specified</option>
                      <option value="very_low">Very Low (&lt; 50% AMI)</option>
                      <option value="low">Low (50–80% AMI)</option>
                      <option value="moderate">Moderate (80–120% AMI)</option>
                      <option value="above_moderate">Above Moderate (&gt; 120% AMI)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', paddingTop: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={grantForm.is_veteran} onChange={e => setGrantForm(p => ({ ...p, is_veteran: e.target.checked }))} />
                      Veteran
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={grantForm.is_disabled} onChange={e => setGrantForm(p => ({ ...p, is_disabled: e.target.checked }))} />
                      Disability
                    </label>
                  </div>
                </div>
                <button type="submit" style={{ ...s.btn, ...s.btnPrimary }} disabled={loadingGrants}>
                  {loadingGrants ? 'Searching AI...' : 'Find Funding Programs'}
                </button>
              </form>
            </div>

            {grants && (
              <>
                {grants.total_potential_funding > 0 && (
                  <div style={{ ...s.card, background: '#f0fff4', border: '1px solid #68d391' }}>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#22543d' }}>
                      Up to ${(grants.total_potential_funding || 0).toLocaleString()} available
                    </div>
                    <div style={{ fontSize: '13px', color: '#276749', marginTop: '4px' }}>Total potential funding from matched programs</div>
                    {grants.next_steps?.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', color: '#22543d' }}>Next Steps:</div>
                        {grants.next_steps.map((step, i) => <div key={i} style={{ fontSize: '13px', color: '#276749', marginBottom: '4px' }}>→ {step}</div>)}
                      </div>
                    )}
                  </div>
                )}
                {(grants.grants || []).map((g, i) => (
                  <div key={i} style={s.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                          <span style={{ fontWeight: '700', fontSize: '15px' }}>{g.program_name}</span>
                          <span style={{ ...s.badge, background: g.type === 'grant' ? '#c6f6d5' : '#bee3f8', color: g.type === 'grant' ? '#22543d' : '#2a69ac', fontSize: '11px', padding: '2px 8px' }}>
                            {g.type}
                          </span>
                          {g.match_score >= 80 && <span style={{ ...s.badge, background: '#fefcbf', color: '#744210', fontSize: '11px', padding: '2px 8px' }}>High Match</span>}
                        </div>
                        <div style={{ fontSize: '13px', color: '#4a5568', marginBottom: '4px' }}>{g.agency}</div>
                        {g.max_amount > 0 && <div style={{ fontSize: '14px', fontWeight: '600', color: '#22543d', marginBottom: '6px' }}>Up to ${g.max_amount.toLocaleString()}</div>}
                        <div style={{ fontSize: '13px', color: '#718096', marginBottom: '4px' }}>Eligibility: {g.eligibility}</div>
                        {g.covers?.length > 0 && <div style={{ fontSize: '12px', color: '#718096' }}>Covers: {g.covers.join(', ')}</div>}
                        {g.deadline && g.deadline !== 'Ongoing' && <div style={{ fontSize: '12px', color: '#c53030', marginTop: '4px' }}>Deadline: {g.deadline}</div>}
                        {g.notes && <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px', fontStyle: 'italic' }}>{g.notes}</div>}
                      </div>
                      <div style={{ flexShrink: 0, marginLeft: '16px', textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#667eea' }}>{g.match_score}%</div>
                        <div style={{ fontSize: '11px', color: '#718096' }}>match</div>
                        {g.application_url && (
                          <a href={g.application_url} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'block', marginTop: '8px', padding: '5px 10px', background: '#667eea', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
                            Apply →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
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
                  {loadingCompliance ? 'Analyzing...' : compliance ? 'Re-Run' : 'Run Compliance Check'}
                </button>
              </div>
            </div>

            {compliance && (
              <>
                <div style={{ ...s.card, display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: '48px', fontWeight: '800', color: compliance.overall_compliance_score >= 70 ? '#22543d' : compliance.overall_compliance_score >= 40 ? '#c05621' : '#c53030' }}>
                      {compliance.overall_compliance_score}%
                    </div>
                    <div style={{ fontSize: '13px', color: '#718096' }}>Compliance Score</div>
                    <div style={{ marginTop: '6px', ...s.badge, background: compliance.compliance_level === 'full' ? '#c6f6d5' : compliance.compliance_level === 'partial' ? '#fef3c7' : '#fed7d7',
                      color: compliance.compliance_level === 'full' ? '#22543d' : compliance.compliance_level === 'partial' ? '#92400e' : '#c53030', textTransform: 'capitalize' }}>
                      {compliance.compliance_level}
                    </div>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#2d3748' }}>{compliance.summary}</p>
                    {compliance.insurance_note && (
                      <p style={{ margin: 0, fontSize: '13px', color: '#2b6cb0', background: '#ebf8ff', padding: '8px 12px', borderRadius: '6px' }}>{compliance.insurance_note}</p>
                    )}
                  </div>
                </div>

                {compliance.critical_violations?.length > 0 && (
                  <div style={{ ...s.card, background: '#fff5f5', border: '1px solid #fc8181' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#c53030' }}>Critical Violations ({compliance.critical_violations.length})</h4>
                    {compliance.critical_violations.map((v, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '13px', color: '#c53030' }}>
                        <span>✗</span><span>{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {compliance.compliant_items?.length > 0 && (
                  <div style={{ ...s.card, background: '#f0fff4', border: '1px solid #68d391' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#22543d' }}>Compliant Items ({compliance.compliant_items.length})</h4>
                    {compliance.compliant_items.map((v, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '13px', color: '#22543d' }}>
                        <span>✓</span><span>{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {compliance.checklist?.length > 0 && (
                  <div style={s.card}>
                    <h4 style={{ margin: '0 0 12px' }}>Full Compliance Checklist</h4>
                    {compliance.checklist.map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', padding: '12px', borderBottom: '1px solid #f7fafc', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.status === 'pass' ? '✅' : '❌'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{item.requirement}</div>
                          <div style={{ fontSize: '12px', color: '#718096', marginBottom: '4px' }}>Standard: {item.standard}</div>
                          {item.current_state && <div style={{ fontSize: '13px', color: '#4a5568', marginBottom: '4px' }}>Current: {item.current_state}</div>}
                          {item.required_action && item.status !== 'pass' && (
                            <div style={{ fontSize: '13px', color: '#c53030' }}>Required: {item.required_action}</div>
                          )}
                          {item.estimated_cost > 0 && (
                            <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>Est. cost: ${item.estimated_cost.toLocaleString()}</div>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, fontSize: '12px', color: '#718096', fontWeight: '600' }}>P{item.priority}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
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
              <form onSubmit={runBudgetOptimizer} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <span style={{ padding: '10px 12px', background: '#f7fafc', borderRight: '1px solid #e2e8f0', fontWeight: '600', color: '#4a5568' }}>$</span>
                  <input type="number" min="100" step="100" style={{ padding: '10px 14px', border: 'none', outline: 'none', fontSize: '15px', width: '160px' }}
                    placeholder="10,000" value={budget} onChange={e => setBudget(e.target.value)} />
                </div>
                <button type="submit" style={{ ...s.btn, ...s.btnPrimary }} disabled={loadingBudget || modifications.length === 0}>
                  {loadingBudget ? 'Optimizing...' : 'Optimize Budget'}
                </button>
                {modifications.length === 0 && <span style={{ fontSize: '13px', color: '#c05621' }}>Generate modifications first</span>}
              </form>
            </div>

            {budgetResult && (
              <>
                <div style={{ ...s.card, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: '700' }}>${(budgetResult.budget || 0).toLocaleString()}</div>
                      <div style={{ fontSize: '12px', opacity: 0.8 }}>Your Budget</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: '700' }}>${(budgetResult.total_cost_estimate || 0).toLocaleString()}</div>
                      <div style={{ fontSize: '12px', opacity: 0.8 }}>Selected Modifications Cost</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: '700' }}>+{budgetResult.total_safety_improvement || 0} pts</div>
                      <div style={{ fontSize: '12px', opacity: 0.8 }}>Safety Score Improvement</div>
                    </div>
                  </div>
                  {budgetResult.optimization_explanation && (
                    <p style={{ margin: '16px 0 0', opacity: 0.9, fontSize: '14px', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '12px' }}>
                      {budgetResult.optimization_explanation}
                    </p>
                  )}
                </div>

                {budgetResult.recommendation && (
                  <div style={{ ...s.card, background: '#ebf8ff', border: '1px solid #90cdf4' }}>
                    <strong style={{ color: '#2b6cb0' }}>AI Recommendation: </strong>
                    <span style={{ color: '#2c5282', fontSize: '14px' }}>{budgetResult.recommendation}</span>
                  </div>
                )}

                {budgetResult.selected_modifications?.length > 0 && (
                  <div style={s.card}>
                    <h4 style={{ margin: '0 0 12px', color: '#22543d' }}>Selected for This Phase ({budgetResult.selected_modifications.length})</h4>
                    {budgetResult.selected_modifications.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f0fff4', borderRadius: '6px', marginBottom: '8px' }}>
                        <div>
                          <span style={{ fontWeight: '600', textTransform: 'capitalize' }}>{m.modification_type?.replace(/_/g, ' ')} — {m.room}</span>
                          <div style={{ fontSize: '12px', color: '#718096', marginTop: '2px' }}>{m.aging_benefit}</div>
                        </div>
                        <div style={{ fontWeight: '600', color: '#22543d', flexShrink: 0, marginLeft: '12px' }}>
                          ${Math.round(((m.estimated_cost_min || 0) + (m.estimated_cost_max || 0)) / 2).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {budgetResult.deferred_modifications?.length > 0 && (
                  <div style={s.card}>
                    <h4 style={{ margin: '0 0 8px', color: '#718096' }}>Deferred to Phase 2 ({budgetResult.deferred_modifications.length})</h4>
                    {budgetResult.phase_2_cost > 0 && (
                      <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#4a5568' }}>
                        Phase 2 estimated cost: <strong>${(budgetResult.phase_2_cost || 0).toLocaleString()}</strong>
                      </p>
                    )}
                    {budgetResult.deferred_modifications.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#f7fafc', borderRadius: '6px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13px', textTransform: 'capitalize', color: '#718096' }}>{m.modification_type?.replace(/_/g, ' ')} — {m.room}</span>
                        <span style={{ fontSize: '13px', color: '#718096' }}>${Math.round(((m.estimated_cost_min || 0) + (m.estimated_cost_max || 0)) / 2).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
