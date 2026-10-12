import NativeHomeInsights from '../components/NativeHomeInsights';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { readRecordList } from '../services/nativeRecords';

const s = {
  page: { maxWidth: '1100px', margin: '0 auto', padding: '24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  title: { margin: 0, fontSize: '28px', fontWeight: '700' },
  subtitle: { margin: '4px 0 0', color: '#718096', fontSize: '14px' },
  btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px' },
  btnPrimary: { background: '#667eea', color: '#fff' },
  btnSecondary: { background: '#fff', color: '#4a5568', border: '1px solid #e2e8f0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' },
  card: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' },
  stat: { background: '#fff', borderRadius: '12px', padding: '20px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  statVal: { fontSize: '32px', fontWeight: '700', color: '#667eea' },
  statLabel: { fontSize: '13px', color: '#718096', marginTop: '4px' },
  address: { fontWeight: '600', marginBottom: '8px', fontSize: '15px' },
  badge: { display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' },
  meta: { fontSize: '13px', color: '#718096', marginTop: '8px' },
  score: { fontSize: '24px', fontWeight: '700', marginBottom: '4px' },
  emptyState: { textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalCard: { background: '#fff', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '480px' },
  input: { width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', marginTop: '6px', boxSizing: 'border-box' },
  formGroup: { marginBottom: '16px' },
  label: { fontSize: '13px', fontWeight: '600', color: '#4a5568' },
  navbar: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '60px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
};

const statusColor = (s) => s === 'completed' ? '#c6f6d5' : '#fef3c7';
const statusTextColor = (s) => s === 'completed' ? '#22543d' : '#92400e';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [homes, setHomes] = useState([]);
  const [selectedSource,setSelectedSource]=useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ address: '', year_built: '', sq_footage: '', num_floors: '1' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const LIMIT = 20;
  const activeLoad=useRef(null);

  useEffect(() => { loadHomes(page);return()=>{activeLoad.current?.abort();activeLoad.current=null;}; }, [page]);

  const loadHomes = async (p = 1) => {
    activeLoad.current?.abort();const controller=new AbortController();activeLoad.current=controller;
    setLoading(true); setLoadError('');
    try {
      const res = await api.get(`/homes?page=${p}&limit=${LIMIT}`,{signal:controller.signal});
      const rows=readRecordList(res.data);if(activeLoad.current!==controller||controller.signal.aborted)return;
      setHomes(rows);
      if (res.data.pagination) setPagination(res.data.pagination);else setPagination({total:readRecordList(res.data).length,totalPages:1});
    } catch (err) {
      if(activeLoad.current===controller&&!controller.signal.aborted)setLoadError(err.response?.data?.message || err.message || 'Homes could not be loaded.');
    } finally {
      if(activeLoad.current===controller&&!controller.signal.aborted){activeLoad.current=null;setLoading(false);}
    }
  };

  const addHome = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/homes', { ...form, year_built: parseInt(form.year_built) || null, sq_footage: parseInt(form.sq_footage) || null, num_floors: parseInt(form.num_floors) || 1 });
      setShowAdd(false);
      setForm({ address: '', year_built: '', sq_footage: '', num_floors: '1' });
      setPage(1);
      loadHomes(1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add home');
    } finally {
      setSaving(false);
    }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const totalAssessments = homes.reduce((s, h) => s + parseInt(h.assessment_count || 0), 0);
  const assessedHomes = homes.filter(home => home.latest_assessment_status === 'completed' && home.current_accessibility_score !== null && home.current_accessibility_score !== undefined);
  const avgScore = assessedHomes.length ? Math.round(assessedHomes.reduce((sum, home) => sum + Number(home.current_accessibility_score), 0) / assessedHomes.length) : null;

  return (
    <>
      <nav style={s.navbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>🏡</span>
          <span style={{ fontWeight: '700', fontSize: '18px' }}>Aging-in-Place Assessor</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <a href="/contractors" onClick={e => { e.preventDefault(); navigate('/contractors'); }} style={{ color: '#667eea', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>Find Contractors</a>
          <a href="/custom-views" onClick={e => { e.preventDefault(); navigate('/custom-views'); }} style={{ color: '#667eea', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>Aging Views</a>
          <a href="/evacuation-readiness" onClick={e => { e.preventDefault(); navigate('/evacuation-readiness'); }} style={{ color: '#667eea', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>Evacuation</a>
          <a href="/codex/operations" onClick={event => { event.preventDefault(); navigate('/codex/operations'); }} style={{ color: '#667eea', textDecoration: 'none', fontSize: '14px' }}>Care Operations</a>
          <a href="/codex/custom-viz" onClick={event => { event.preventDefault(); navigate('/codex/custom-viz'); }} style={{ color: '#667eea', textDecoration: 'none', fontSize: '14px' }}>Record Insights</a>
          <span style={{ color: '#718096', fontSize: '14px' }}>Hello, {user?.name}</span>
          <button style={{ ...s.btn, ...s.btnSecondary, padding: '6px 14px' }} onClick={() => { logout(); navigate('/login'); }}>Sign Out</button>
        </div>
      </nav>

      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>My Homes</h1>
            <p style={s.subtitle}>Manage and assess your homes for aging-in-place modifications</p>
          </div>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => setShowAdd(true)}>+ Add Home</button>
        </div>

        <div style={s.statsGrid}>
          <div style={s.stat}><div style={s.statVal}>{loading?'Loading…':loadError?'Unavailable':pagination.total}</div><div style={s.statLabel}>Homes Registered</div></div>
          <div style={s.stat}><div style={s.statVal}>{loading?'Loading…':loadError?'Unavailable':totalAssessments}</div><div style={s.statLabel}>Assessments on this page</div></div>
          <div style={s.stat}><div style={s.statVal}>{loading?'Loading…':loadError?'Unavailable':avgScore === null ? 'Not assessed' : `${avgScore}/100`}</div><div style={s.statLabel}>Avg Accessibility Score</div></div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#718096' }}>Loading homes...</div>
        ) : loadError ? (
          <div role="alert" style={s.emptyState}><strong>Homes could not be loaded.</strong><p>{loadError}</p><button type="button" style={{ ...s.btn, ...s.btnSecondary }} onClick={() => loadHomes(page)}>Retry</button></div>
        ) : homes.length === 0 ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏠</div>
            <h3 style={{ margin: '0 0 8px', color: '#4a5568' }}>No homes yet</h3>
            <p style={{ color: '#718096', margin: '0 0 20px' }}>Add your first home to start an aging-in-place assessment</p>
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => setShowAdd(true)}>Add Your First Home</button>
          </div>
        ) : (
          <>
          <div style={s.grid}>
            {homes.map(home => (
              <div key={home.id} style={s.card} role="button" tabIndex={0} aria-label={'Open native home '+home.address} onClick={() => setSelectedSource(home.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelectedSource(home.id);}}}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.1)'; }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🏠</div>
                <div style={s.address}>{home.address}</div>
                <div style={s.score}>{home.latest_assessment_status === 'completed' && home.current_accessibility_score != null ? `${home.current_accessibility_score}/100` : 'Not assessed'}</div>
                <div style={{ fontSize: '12px', color: '#718096', marginBottom: '12px' }}>Accessibility Score</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ ...s.badge, background: statusColor(home.latest_assessment_status), color: statusTextColor(home.latest_assessment_status) }}>
                    {home.latest_assessment_status ? home.latest_assessment_status : 'Not Assessed'}
                  </span>
                  <span style={s.meta}>{home.assessment_count || 0} assessment{home.assessment_count !== 1 ? 's' : ''}</span>
                </div>
                {home.year_built && <div style={{ ...s.meta, marginTop: '8px' }}>Built {home.year_built} {home.sq_footage ? `• ${home.sq_footage} sq ft` : ''} {home.num_floors ? `• ${home.num_floors} floor${home.num_floors > 1 ? 's' : ''}` : ''}</div>}
              </div>
            ))}
          </div>
          {pagination.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '28px' }}>
              <button style={{ ...s.btn, ...s.btnSecondary, padding: '6px 14px' }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ fontSize: '14px', color: '#718096' }}>Page {page} of {pagination.totalPages} ({pagination.total} homes)</span>
              <button style={{ ...s.btn, ...s.btnSecondary, padding: '6px 14px' }} disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
          </>
        )}
      </div>

      {selectedSource&&<NativeHomeInsights key={selectedSource} initialSourceId={selectedSource} onlyDialog onClose={()=>setSelectedSource(null)} onChanged={()=>loadHomes(page)}/>}
      {showAdd && (
        <div style={s.modal} onClick={() => setShowAdd(false)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 24px', fontSize: '20px' }}>Add New Home</h2>
            {error && <div style={{ background: '#fff5f5', border: '1px solid #fc8181', borderRadius: '8px', padding: '10px', marginBottom: '16px', color: '#c53030', fontSize: '13px' }}>{error}</div>}
            <form onSubmit={addHome}>
              <div style={s.formGroup}><label style={s.label}>Address *</label><input style={s.input} value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St, Springfield, IL 62701" required /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={s.formGroup}><label style={s.label}>Year Built</label><input style={s.input} type="number" value={form.year_built} onChange={e => set('year_built', e.target.value)} placeholder="1975" /></div>
                <div style={s.formGroup}><label style={s.label}>Sq Footage</label><input style={s.input} type="number" value={form.sq_footage} onChange={e => set('sq_footage', e.target.value)} placeholder="1800" /></div>
                <div style={s.formGroup}><label style={s.label}>Number of Floors</label><select style={s.input} value={form.num_floors} onChange={e => set('num_floors', e.target.value)}>{[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" style={{ ...s.btn, ...s.btnSecondary }} onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" style={{ ...s.btn, ...s.btnPrimary }} disabled={saving}>{saving ? 'Saving...' : 'Add Home'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
