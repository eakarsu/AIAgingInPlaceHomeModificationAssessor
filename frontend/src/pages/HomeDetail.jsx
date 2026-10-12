import FullFieldPresets from '../components/FullFieldPresets';
import AIReport from '../components/AIReport';
import NativeAssessmentRecord from '../components/NativeAssessmentRecord';
import useNativeAI from '../services/useNativeAI';
import {clinicalExamples,ageValue} from '../services/nativeExamples';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { readRecordList } from '../services/nativeRecords';

const s = {
  page: { maxWidth: '1100px', margin: '0 auto', padding: '24px' },
  btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px' },
  btnPrimary: { background: '#667eea', color: '#fff' },
  btnSecondary: { background: '#fff', color: '#4a5568', border: '1px solid #e2e8f0' },
  btnDanger: { background: '#fc8181', color: '#fff' },
  btnGreen: { background: '#48bb78', color: '#fff' },
  card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', marginBottom: '20px' },
  label: { fontSize: '12px', color: '#718096', marginBottom: '2px' },
  value: { fontSize: '15px', fontWeight: '500', color: '#2d3748' },
  modRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px' },
  badge: { padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', display: 'inline-block' },
  navbar: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '60px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  input: { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' },
  tab: { padding: '8px 16px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', borderBottom: '2px solid transparent', background: 'transparent', color: '#718096' },
  tabActive: { color: '#667eea', borderBottom: '2px solid #667eea' },
};

const money = value => value === null || value === undefined ? 'Not estimated' : `$${Number(value).toLocaleString()}`;

const priorityColor = (p) => {
  if (p <= 2) return { bg: '#fff5f5', text: '#c53030' };
  if (p <= 5) return { bg: '#fffaf0', text: '#c05621' };
  return { bg: '#f0fff4', text: '#22543d' };
};

const statusBg = { recommended: '#ebf8ff', planned: '#faf089', in_progress: '#fef3c7', completed: '#f0fff4' };
const statusText = { recommended: '#2b6cb0', planned: '#744210', in_progress: '#92400e', completed: '#22543d' };

export default function HomeDetail() {
  const { id } = useParams();
  const {post:aiPost,cancel:cancelAI,busy:aiBusy}=useNativeAI(id);
  const [nativeReport,setNativeReport]=useState(null);
  const navigate = useNavigate();
  const [home, setHome] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [modifications, setModifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('assessments');
  const [runningAssessment, setRunningAssessment] = useState(false);
  const [streamMods, setStreamMods] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [assessForm, setAssessForm] = useState({ resident_age: '', mobility_issues: '', vision_issues: '', balance_issues: '', photos_description: '' });
  const [showAssessForm, setShowAssessForm] = useState(false);
  const [activeAssessmentId, setActiveAssessmentId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const streamRequest = useRef(null);
  const cancelStream = () => { streamRequest.current?.close(); streamRequest.current = null; setStreaming(false); };
  useEffect(() => () => { streamRequest.current?.close(); streamRequest.current = null; }, [id]);

  // Resident profile state
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ resident_name: '', age: '', mobility_issues: '', vision_issues: '', balance_issues: '', medical_notes: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Fall risk state
  const [fallRiskHistory, setFallRiskHistory] = useState([]);
  const [runningFallRisk, setRunningFallRisk] = useState(false);
  const [latestFallRisk, setLatestFallRisk] = useState(null);
  const [fallRiskForm, setFallRiskForm] = useState({ age: '', mobility_issues: '', vision_issues: '', balance_issues: '', medications: '', fall_history: '' });

  // Budget state
  const [budget, setBudget] = useState(null);

  const dataRequest=useRef(null);
  useEffect(()=>{cancelAI();cancelStream();setSelectedRecord(null);setNativeReport(null);setAssessForm({resident_age:'',mobility_issues:'',vision_issues:'',balance_issues:'',photos_description:''});setFallRiskForm({age:'',mobility_issues:'',vision_issues:'',balance_issues:'',medications:'',fall_history:''});loadData();return()=>{dataRequest.current?.abort();dataRequest.current=null;};},[id]);
  const loadData=async()=>{
    dataRequest.current?.abort();const controller=new AbortController();dataRequest.current=controller;const options={signal:controller.signal};setLoading(true);setLoadError('');
    try{
      const [homeRes,assessRes,profileRes,fallRes,budgetRes]=await Promise.all([api.get(`/homes/${id}`,options),api.get(`/assessments?home_id=${id}`,options),api.get(`/profiles/${id}`,options).catch(failure=>{if(failure.response?.status===404)return{data:{profile:null}};throw failure;}),api.get(`/fall-risk-history?home_id=${id}`,options),api.get(`/homes/${id}/budget`,options)]);
      if(!homeRes.data.home?.id||String(homeRes.data.home.id)!==String(id))throw Error('The home service returned an invalid source record.');
      const rows=readRecordList(assessRes.data),history=readRecordList(fallRes.data),source=rows.find(row=>row.status==='completed')||rows[0];
      const modifications=source?readRecordList((await api.get(`/modifications?assessmentId=${source.id}`,options)).data):[];
      if(dataRequest.current!==controller||controller.signal.aborted)return;
      const saved=profileRes.data.profile;setHome(homeRes.data.home);setAssessments(rows);setModifications(modifications);setActiveAssessmentId(source?.id||null);setProfile(saved);setProfileForm({resident_name:saved?.resident_name||'',age:saved?.age??'',mobility_issues:saved?.mobility_issues||'',vision_issues:saved?.vision_issues||'',balance_issues:saved?.balance_issues||'',medical_notes:saved?.medical_notes||''});setFallRiskHistory(history);setLatestFallRisk(history[0]||null);setBudget(budgetRes.data);
    }catch(failure){if(dataRequest.current===controller&&!controller.signal.aborted)setLoadError(failure.response?.data?.message||failure.message||'Home data could not be loaded.');}
    finally{if(dataRequest.current===controller&&!controller.signal.aborted){dataRequest.current=null;setLoading(false);}}
  };

  const runAssessment = async (e) => {
    e.preventDefault();
    setRunningAssessment(true);
    setErrorMsg('');
    try {
      const res = await aiPost('/ai/assess-home', {
        home_id: parseInt(id),
        resident_age: ageValue(assessForm.resident_age),
        mobility_issues: assessForm.mobility_issues || undefined,
        vision_issues: assessForm.vision_issues || undefined,
        balance_issues: assessForm.balance_issues || undefined,
        photos_description: assessForm.photos_description || undefined,
      });
      setShowAssessForm(false);
      await loadData();
      setNativeReport(res.data.assessment?.ai_result || res.data);
      if(res.data.assessment?.id)setActiveAssessmentId(res.data.assessment.id);
    } catch (err) {
      if(err.name==='AbortError'||err.code==='ERR_CANCELED')return;
      setErrorMsg(err.response?.data?.message || err.message || 'Assessment failed');
    } finally {
      setRunningAssessment(false);
    }
  };

  const streamModifications = async () => {
    if (!activeAssessmentId || streamRequest.current) return;
    setStreaming(true); setStreamMods([]); setErrorMsg('');
    try {
      const token = localStorage.getItem('token');
      const es = new EventSource(`/api/ai/modifications/stream?assessmentId=${activeAssessmentId}&token=${encodeURIComponent(token || '')}`);
      streamRequest.current = es;
      const fail = message => { if (streamRequest.current !== es) return; cancelStream(); setErrorMsg(message); };
      es.onmessage = event => {
        if (streamRequest.current !== es) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'modification') setStreamMods(previous => [...previous, data.modification]);
          else if (data.type === 'complete') { cancelStream(); loadData(); }
          else if (data.type === 'error' || data.error) fail(data.message || data.error || 'Modification generation failed. Try again.');
        } catch (_) { fail('The modification stream returned an invalid response. Try again.'); }
      };
      es.onerror = () => fail('The modification stream could not be loaded. Try again.');
    } catch (failure) { cancelStream(); setErrorMsg(failure.message || 'Modification generation failed. Try again.'); }
  };

  const updateModStatus = async (modId, status) => {
    try {
      await api.patch(`/modifications/${modId}`, { status });
      loadData();
    } catch (err) {
      setErrorMsg('Failed to update modification status');
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg('');
    try {
      await api.put(`/profiles/${id}`, {
        resident_name: profileForm.resident_name || undefined,
        age: profileForm.age ? parseInt(profileForm.age) : undefined,
        mobility_issues: profileForm.mobility_issues || undefined,
        vision_issues: profileForm.vision_issues || undefined,
        balance_issues: profileForm.balance_issues || undefined,
        medical_notes: profileForm.medical_notes || undefined,
      });
      setProfileMsg('Profile saved successfully');
      await loadData();
    } catch (err) {
      setProfileMsg(err.response?.data?.message || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const runFallRisk = async (e) => {
    e.preventDefault();
    setRunningFallRisk(true);
    try {
      const res = await aiPost('/ai/fall-risk-assessment', {
        home_id: parseInt(id),
        resident_profile: {
          age: ageValue(fallRiskForm.age),
          mobility_issues: fallRiskForm.mobility_issues || undefined,
          vision_issues: fallRiskForm.vision_issues || undefined,
          balance_issues: fallRiskForm.balance_issues || undefined,
          medications: fallRiskForm.medications || undefined,
          fall_history: fallRiskForm.fall_history || undefined,
        },
      });
      setLatestFallRisk(res.data);
      setNativeReport(res.data);
      await loadData();
    } catch (err) {
      if(err.name==='AbortError'||err.code==='ERR_CANCELED')return;
      setErrorMsg(err.response?.data?.message || err.message || 'Fall risk assessment failed');
    } finally {
      setRunningFallRisk(false);
    }
  };

  const setField = (k, v) => setAssessForm(p => ({ ...p, [k]: v }));
  const setPF = (k, v) => setProfileForm(p => ({ ...p, [k]: v }));
  const setFRF = (k, v) => setFallRiskForm(p => ({ ...p, [k]: v }));

  if (loading) return <div style={{ textAlign: 'center', padding: '80px', color: '#718096' }}>Loading...</div>;
  if (loadError) return <div role="alert" style={s.card}><h1>Home data could not be loaded</h1><p>{loadError}</p><button type="button" style={{ ...s.btn, ...s.btnSecondary }} onClick={loadData}>Retry</button></div>;
  if (!home) return <div style={{ textAlign: 'center', padding: '80px' }}>Home not found</div>;

  const latestAssessment = assessments[0];
  const riskColor = { low: '#22543d', medium: '#c05621', high: '#c53030', critical: '#9b2c2c' };
  const riskBg = { low: '#c6f6d5', medium: '#fef3c7', high: '#fed7aa', critical: '#fed7d7' };

  const tabs = [
    { key: 'assessments', label: 'Assessments' },
    { key: 'modifications', label: `Modifications (${modifications.length})` },
    { key: 'resident', label: 'Resident Profile' },
    { key: 'fallrisk', label: 'Fall Risk' },
    { key: 'budget', label: 'Budget' },
  ];

  return (
    <>
      <nav style={s.navbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button style={{ ...s.btn, ...s.btnSecondary, padding: '6px 14px' }} onClick={() => navigate('/')}>← Back</button>
          <span style={{ fontWeight: '700', fontSize: '16px' }}>Home Assessment</span>
        </div>
      </nav>

      {selectedRecord && <NativeAssessmentRecord kind={selectedRecord.kind} recordId={selectedRecord.id} onClose={() => setSelectedRecord(null)} onChanged={loadData} onOpenAssessment={source => navigate('/assessments/'+source)}/>}
      <div style={s.page}>
        {aiBusy&&<div role="status" className="ai-loading">Generating with OpenRouter… <button type="button" style={{...s.btn,...s.btnSecondary}} onClick={cancelAI}>Cancel AI request</button></div>}
        {nativeReport&&<AIReport response={nativeReport} title="Home planning AI response"/>}
        {/* Home Info */}
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: '0 0 4px' }}>🏠 {home.address}</h2>
              <p style={{ margin: 0, color: '#718096', fontSize: '14px' }}>
                {[home.year_built && `Built ${home.year_built}`, home.sq_footage && `${home.sq_footage} sq ft`, home.num_floors && `${home.num_floors} floor${home.num_floors > 1 ? 's' : ''}`].filter(Boolean).join(' • ')}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '36px', fontWeight: '700', color: '#667eea' }}>{home.current_accessibility_score == null ? 'Not assessed' : home.current_accessibility_score}</div>
              <div style={{ fontSize: '12px', color: '#718096' }}>Accessibility Score / 100</div>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div style={{ background: '#fff5f5', border: '1px solid #fc8181', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#c53030', fontSize: '14px', display: 'flex', justifyContent: 'space-between' }}>
            <span>{errorMsg}</span>
            <button style={{ background: 'none', border: 'none', color: '#c53030', cursor: 'pointer', fontWeight: '700' }} onClick={() => setErrorMsg('')}>×</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', marginBottom: '20px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 8px', overflowX: 'auto' }}>
            {tabs.map(t => (
              <button key={t.key} style={{ ...s.tab, ...(activeTab === t.key ? s.tabActive : {}), whiteSpace: 'nowrap' }} onClick={() => setActiveTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ASSESSMENTS TAB */}
        {activeTab === 'assessments' && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Assessments</h3>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => setShowAssessForm(!showAssessForm)}>
                Run AI Assessment
              </button>
            </div>

            {showAssessForm && (
              <form data-native-ai="assessment" onSubmit={runAssessment} style={{ marginBottom: '20px', background: '#f7fafc', padding: '16px', borderRadius: '8px' }}>
                <FullFieldPresets value={assessForm} onChange={setAssessForm} presets={clinicalExamples(profile,'assessment')} disabled={aiBusy}/><p className="ai-muted">Examples preserve saved clinical facts and fill unknown fields explicitly. Review before generating; no inspection or consent is implied.</p><h4 style={{ margin: '0 0 12px', fontSize: '14px' }}>Resident Profile (for this assessment)</h4>
                {profile && (
                  <div style={{ fontSize: '12px', color: '#2b6cb0', background: '#ebf8ff', padding: '6px 10px', borderRadius: '6px', marginBottom: '10px' }}>
                    Use a complete example to copy the saved resident facts, or enter verified observations.
                  </div>
                )}
                {[['resident_age', 'Resident Age (or Unknown)', 'text', profile?.age || '72'], ['mobility_issues', 'Mobility Issues', 'text', profile?.mobility_issues || 'Uses walker'], ['vision_issues', 'Vision Issues', 'text', profile?.vision_issues || 'Mild cataracts'], ['balance_issues', 'Balance Issues', 'text', profile?.balance_issues || 'Occasional dizziness']].map(([k, l, t, ph]) => (
                  <div key={k} style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5568', display: 'block', marginBottom: '4px' }}>{l}</label>
                    <input type={t} value={assessForm[k]} onChange={e => setField(k, e.target.value)} placeholder={ph}
                      style={s.input} />
                  </div>
                ))}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5568', display: 'block', marginBottom: '4px' }}>Home Description / Notes</label>
                  <textarea value={assessForm.photos_description} onChange={e => setField('photos_description', e.target.value)}
                    placeholder="Describe any known issues, room conditions, existing modifications..."
                    rows={3} style={{ ...s.input, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" style={{ ...s.btn, ...s.btnSecondary, padding: '8px 16px', fontSize: '13px' }} onClick={() => {cancelAI();setShowAssessForm(false);}}>Cancel</button>
                  <button type="submit" style={{ ...s.btn, ...s.btnPrimary, padding: '8px 16px', fontSize: '13px' }} disabled={aiBusy}>
                    {runningAssessment ? 'Assessing (may take ~30s)...' : 'Generate assessment with OpenRouter'}
                  </button>
                </div>
              </form>
            )}

            {assessments.length === 0 ? (
              <p style={{ color: '#718096', fontSize: '14px' }}>No assessments yet. Run your first AI assessment above.</p>
            ) : assessments.map(a => (
              <div key={a.id} role="button" tabIndex={0} aria-label={`Open assessment #${a.id}`} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelectedRecord({kind:'assessment',id:a.id});}}} onClick={() => setSelectedRecord({kind:"assessment",id:a.id})}
                style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f7fafc'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '600', fontSize: '14px', textTransform: 'capitalize' }}>{a.assessment_type} Assessment</span>
                  <span style={{ ...s.badge, background: a.status === 'completed' ? '#c6f6d5' : '#fef3c7', color: a.status === 'completed' ? '#22543d' : '#92400e' }}>{a.status}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#718096', marginTop: '4px' }}>
                  Safety Score: <strong>{a.safety_score ?? 'Not assessed'}</strong> • Urgency: <strong style={{ textTransform: 'capitalize' }}>{a.urgency_level || 'Not assessed'}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#a0aec0', marginTop: '2px' }}>{new Date(a.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}

        {/* MODIFICATIONS TAB */}
        {activeTab === 'modifications' && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Recommended Modifications</h3>
              {activeAssessmentId && (
                <button style={{ ...s.btn, ...s.btnSecondary, padding: '6px 12px', fontSize: '12px' }} onClick={streamModifications} disabled={streaming}>
                  {streaming ? 'Streaming...' : 'Generate modifications with OpenRouter'}
                </button>
              )}
            </div>

            {streaming && <button type="button" style={{...s.btn,...s.btnSecondary}} onClick={cancelStream}>Cancel modification generation</button>}
            {streaming && streamMods.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: '#667eea', fontWeight: '600', marginBottom: '8px' }}>Live modifications loading...</p>
                {streamMods.map((m, i) => <div key={i} style={{ padding: '8px', background: '#ebf8ff', borderRadius: '6px', fontSize: '13px', marginBottom: '4px' }}>✨ {m.modification_type} — {m.room}</div>)}
              </div>
            )}

            {modifications.length === 0 ? (
              <p style={{ color: '#718096', fontSize: '14px' }}>No modifications yet. Complete an assessment to get AI recommendations.</p>
            ) : modifications.map(m => {
              const pc = priorityColor(m.priority);
              return (
                <div key={m.id} style={s.modRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ ...s.badge, background: pc.bg, color: pc.text, fontSize: '11px' }}>P{m.priority}</span>
                      <span style={{ fontWeight: '600', fontSize: '14px', textTransform: 'capitalize' }}>{m.modification_type?.replace(/_/g, ' ')}</span>
                      <span style={{ ...s.badge, background: statusBg[m.status] || '#e2e8f0', color: statusText[m.status] || '#4a5568', fontSize: '11px' }}>{m.status}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#4a5568' }}>{m.room} — {m.description}</div>
                    {(m.estimated_cost_min || m.estimated_cost_max) && (
                      <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>
                        Est. {money(m.estimated_cost_min)} – {money(m.estimated_cost_max)}
                      </div>
                    )}
                    {m.completion_pct > 0 && (
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ background: '#e2e8f0', borderRadius: '4px', height: '4px' }}>
                          <div style={{ background: '#48bb78', height: '4px', borderRadius: '4px', width: `${m.completion_pct}%` }} />
                        </div>
                        <div style={{ fontSize: '11px', color: '#718096', marginTop: '2px' }}>{m.completion_pct}% complete</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '12px', flexShrink: 0 }}>
                    <button type="button" style={{...s.btn,...s.btnSecondary,padding:'4px 10px',fontSize:'12px'}} onClick={() => setSelectedRecord({kind:'modification',id:m.id})}>Open details</button>
                    {m.status === 'recommended' && <button style={{ ...s.btn, ...s.btnPrimary, padding: '4px 10px', fontSize: '12px' }} onClick={() => updateModStatus(m.id, 'planned')}>Plan</button>}
                    {m.status === 'planned' && <button style={{ ...s.btn, background: '#ed8936', color: '#fff', padding: '4px 10px', fontSize: '12px' }} onClick={() => updateModStatus(m.id, 'in_progress')}>Start</button>}
                    {m.status === 'in_progress' && <button style={{ ...s.btn, ...s.btnGreen, padding: '4px 10px', fontSize: '12px' }} onClick={() => updateModStatus(m.id, 'completed')}>Done</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* RESIDENT PROFILE TAB */}
        {activeTab === 'resident' && (
          <div style={s.card}>
            <h3 style={{ margin: '0 0 8px' }}>Resident Profile</h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#718096' }}>
              Save resident details here so AI assessments automatically use them — no need to re-enter every time.
            </p>
            {profileMsg && (
              <div style={{ background: profileMsg.includes('success') ? '#f0fff4' : '#fff5f5', border: `1px solid ${profileMsg.includes('success') ? '#68d391' : '#fc8181'}`, borderRadius: '6px', padding: '10px', marginBottom: '16px', fontSize: '13px', color: profileMsg.includes('success') ? '#22543d' : '#c53030' }}>
                {profileMsg}
              </div>
            )}
            <form onSubmit={saveProfile}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5568', display: 'block', marginBottom: '4px' }}>Resident Name</label>
                  <input style={s.input} value={profileForm.resident_name} onChange={e => setPF('resident_name', e.target.value)} placeholder="Jane Smith" />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5568', display: 'block', marginBottom: '4px' }}>Age</label>
                  <input type="number" style={s.input} value={profileForm.age} onChange={e => setPF('age', e.target.value)} placeholder="72" min="1" max="130" />
                </div>
              </div>
              {[['mobility_issues', 'Mobility Issues', 'e.g. Uses a walker, difficulty climbing stairs'],
                ['vision_issues', 'Vision Issues', 'e.g. Mild cataracts, wears glasses'],
                ['balance_issues', 'Balance Issues', 'e.g. Occasional dizziness, history of falls']].map(([k, label, ph]) => (
                <div key={k} style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5568', display: 'block', marginBottom: '4px' }}>{label}</label>
                  <input style={s.input} value={profileForm[k]} onChange={e => setPF(k, e.target.value)} placeholder={ph} />
                </div>
              ))}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5568', display: 'block', marginBottom: '4px' }}>Medical Notes</label>
                <textarea style={{ ...s.input, resize: 'vertical' }} rows={3} value={profileForm.medical_notes} onChange={e => setPF('medical_notes', e.target.value)} placeholder="Medications, conditions, doctor recommendations..." />
              </div>
              <button type="submit" style={{ ...s.btn, ...s.btnPrimary }} disabled={savingProfile}>
                {savingProfile ? 'Saving...' : profile ? 'Update Profile' : 'Save Profile'}
              </button>
              {profile && <div style={{ fontSize: '12px', color: '#718096', marginTop: '8px' }}>Last updated: {new Date(profile.updated_at).toLocaleDateString()}</div>}
            </form>
          </div>
        )}

        {/* FALL RISK TAB */}
        {activeTab === 'fallrisk' && (
          <div>
            <div style={s.card}>
              <h3 style={{ margin: '0 0 8px' }}>Fall Risk Assessment</h3>
              <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#718096' }}>
                AI analyzes home hazards and resident profile to predict fall risk and recommend interventions.
              </p>
              <form data-native-ai="fall-risk" onSubmit={runFallRisk}><FullFieldPresets value={fallRiskForm} onChange={setFallRiskForm} presets={clinicalExamples(profile,'fall-risk')} disabled={aiBusy}/><p className="ai-muted">Each choice fills every field from saved facts or an explicit unknown. Review before generating.</p>
                <div style={{ background: '#f7fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '13px', color: '#4a5568' }}>Resident Details (overrides saved profile)</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[['age', 'Age (or Unknown)', 'text', profile?.age || '72'],
                      ['medications', 'Medications', 'text', 'e.g. blood thinners, diuretics'],
                      ['mobility_issues', 'Mobility Issues', 'text', profile?.mobility_issues || 'Uses walker'],
                      ['fall_history', 'Fall History', 'text', 'e.g. 2 falls in past year'],
                      ['vision_issues', 'Vision Issues', 'text', profile?.vision_issues || 'Mild cataracts'],
                      ['balance_issues', 'Balance Issues', 'text', profile?.balance_issues || 'Dizziness']].map(([k, l, t, ph]) => (
                      <div key={k}>
                        <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5568', display: 'block', marginBottom: '3px' }}>{l}</label>
                        <input type={t} style={s.input} value={fallRiskForm[k]} onChange={e => setFRF(k, e.target.value)} placeholder={ph} />
                      </div>
                    ))}
                  </div>
                </div>
                <button type="submit" style={{ ...s.btn, ...s.btnPrimary }} disabled={aiBusy}>
                  {runningFallRisk ? 'Analyzing (may take ~30s)...' : 'Generate fall risk report with OpenRouter'}
                </button>
              </form>
            </div>

            {latestFallRisk && <>{latestFallRisk.ai_result?<AIReport response={latestFallRisk.ai_result} title="Saved fall risk report"/>:<p className="ai-muted">Saved planning draft · Not assessed. No provider answer or clinical risk score has been generated.</p>}{fallRiskHistory.length > 0 && (
                  <div style={s.card}>
                    <h4 style={{ margin: '0 0 12px' }}>Fall Risk History</h4>
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                      {fallRiskHistory.map((entry, i) => (
                        <div key={entry.id} style={{ flexShrink: 0, textAlign: 'center', padding: '10px 14px', background: riskBg[entry.risk_category] || '#f7fafc', borderRadius: '8px', minWidth: '80px' }}>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: riskColor[entry.risk_category] || '#2d3748' }}>{entry.fall_risk_score ?? 'Not assessed'}</div>
                          <div style={{ fontSize: '11px', color: '#718096', textTransform: 'capitalize', marginBottom: '2px' }}>{entry.risk_category || 'Planning draft · no generated answer'}</div>
                          {entry.planning_notes&&<p style={{maxWidth:220,fontSize:11}}>{entry.planning_notes}</p>}
                          <div style={{ fontSize: '10px', color: '#a0aec0' }}>{new Date(entry.created_at).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}</>}
          </div>
        )}

        {/* BUDGET TAB */}
        {activeTab === 'budget' && (
          <div>
            {budget ? (
              <>
                <div style={s.card}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: '#667eea' }}>{budget.total_modifications}</div>
                      <div style={{ fontSize: '13px', color: '#718096' }}>Pending Modifications</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: '#22543d' }}>{money(budget.estimated_total_min)}</div>
                      <div style={{ fontSize: '13px', color: '#718096' }}>Min Estimate</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: '#c05621' }}>{money(budget.estimated_total_max)}</div>
                      <div style={{ fontSize: '13px', color: '#718096' }}>Max Estimate</div>
                    </div>
                  </div>
                </div>

                <div style={s.card}>
                  <h3 style={{ margin: '0 0 16px' }}>Modifications by Priority</h3>
                  {(budget.modifications || []).map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ ...s.badge, background: '#ebf8ff', color: '#2b6cb0', fontSize: '11px', padding: '2px 8px' }}>P{m.priority}</span>
                          <span style={{ fontWeight: '600', fontSize: '14px', textTransform: 'capitalize' }}>{m.modification_type?.replace(/_/g, ' ')} — {m.room}</span>
                        </div>
                        {m.aging_benefit && <div style={{ fontSize: '12px', color: '#2b6cb0' }}>✓ {m.aging_benefit}</div>}
                        {m.roi_score && <div style={{ fontSize: '12px', color: '#718096', marginTop: '2px' }}>ROI Score: {m.roi_score}/100</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>
                          {money(m.estimated_cost_min)} – {money(m.estimated_cost_max)}
                        </div>
                        {m.timeline_days && <div style={{ fontSize: '12px', color: '#718096' }}>{m.timeline_days} days</div>}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ ...s.card, background: '#ebf8ff', border: '1px solid #90cdf4' }}>
                  <p style={{ margin: 0, fontSize: '14px', color: '#2c5282' }}>
                    Use the <strong>Assessment Results</strong> page to run the AI Budget Optimizer and get a personalized phase plan for your specific budget.
                  </p>
                  {assessments.length > 0 && (
                    <button style={{ ...s.btn, ...s.btnPrimary, marginTop: '12px', fontSize: '13px' }} onClick={() => navigate(`/assessments/${assessments[0].id}`)}>
                      Open Budget Optimizer →
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px' }}>
                <p style={{ color: '#718096', fontSize: '14px' }}>No modifications found. Complete an AI assessment to see budget planning.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
