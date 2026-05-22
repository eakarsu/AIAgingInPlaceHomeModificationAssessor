import React, { useState } from 'react';
import api from '../api/client';

const cardStyle = {
  background: '#fff',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
};
const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #cbd5e0',
  borderRadius: 8,
  fontSize: 14,
  boxSizing: 'border-box',
};
const labelStyle = { fontSize: 13, fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: 6 };
const btn = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 14,
};
const btnPrimary = { ...btn, background: '#667eea', color: '#fff' };
const btnSecondary = { ...btn, background: '#edf2f7', color: '#2d3748' };
const stepIndicator = (active, done) => ({
  width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 700, fontSize: 13,
  background: done ? '#48bb78' : active ? '#667eea' : '#e2e8f0',
  color: done || active ? '#fff' : '#718096',
});
const pill = (active) => ({
  padding: '6px 12px', borderRadius: 16, border: '1px solid',
  borderColor: active ? '#667eea' : '#cbd5e0',
  background: active ? '#ebf4ff' : '#fff',
  color: active ? '#4c51bf' : '#4a5568',
  cursor: 'pointer', fontSize: 13, fontWeight: 500,
});

const ALL_ROOMS = ['bathroom', 'entry', 'stairs', 'hallway', 'kitchen', 'bedroom'];

export default function ModRecWizard() {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState({ name: '', age: '' });
  const [mobility, setMobility] = useState('moderate');
  const [rooms, setRooms] = useState(['bathroom', 'entry', 'stairs']);
  const [recs, setRecs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleRoom = (r) => {
    setRooms(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const fetchRecs = async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        mobility,
        rooms: rooms.join(','),
        age: profile.age || '',
      }).toString();
      const res = await api.get(`/custom-views/wizard-recommend?${q}`);
      setRecs(res.data);
      setStep(4);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to compute recommendations');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1); setRecs(null); setError('');
    setProfile({ name: '', age: '' }); setMobility('moderate'); setRooms(['bathroom', 'entry', 'stairs']);
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#1a202c' }}>Modification Recommendation Wizard</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[1, 2, 3, 4].map(n => (
            <React.Fragment key={n}>
              <div style={stepIndicator(step === n, step > n)}>{n}</div>
              {n < 4 && <div style={{ width: 18, height: 2, background: step > n ? '#48bb78' : '#e2e8f0' }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {step === 1 && (
        <div>
          <div style={{ fontSize: 14, color: '#2d3748', marginBottom: 12, fontWeight: 600 }}>Step 1 — Client Profile</div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Client Name</label>
            <input style={inputStyle} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} placeholder="e.g., Margaret K." />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Age</label>
            <input style={inputStyle} type="number" value={profile.age} onChange={e => setProfile({ ...profile, age: e.target.value })} placeholder="78" />
          </div>
          <button style={btnPrimary} onClick={() => setStep(2)}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ fontSize: 14, color: '#2d3748', marginBottom: 12, fontWeight: 600 }}>Step 2 — Mobility Level</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            {[
              { v: 'low',      lab: 'Independent — minor support' },
              { v: 'moderate', lab: 'Walks with cane / walker' },
              { v: 'high',     lab: 'Wheelchair / post-op recovery' },
            ].map(m => (
              <button key={m.v} style={pill(mobility === m.v)} onClick={() => setMobility(m.v)}>{m.lab}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnSecondary} onClick={() => setStep(1)}>Back</button>
            <button style={btnPrimary} onClick={() => setStep(3)}>Continue</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={{ fontSize: 14, color: '#2d3748', marginBottom: 12, fontWeight: 600 }}>Step 3 — Room Priorities</div>
          <p style={{ fontSize: 13, color: '#718096', margin: '0 0 12px' }}>Select all rooms you want modifications for:</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {ALL_ROOMS.map(r => (
              <button key={r} style={pill(rooms.includes(r))} onClick={() => toggleRoom(r)}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnSecondary} onClick={() => setStep(2)}>Back</button>
            <button style={btnPrimary} onClick={fetchRecs} disabled={loading || rooms.length === 0}>
              {loading ? 'Computing...' : 'Get Recommendations'}
            </button>
          </div>
          {error && <div style={{ color: '#c53030', marginTop: 12, fontSize: 13 }}>{error}</div>}
        </div>
      )}

      {step === 4 && recs && (
        <div>
          <div style={{ fontSize: 14, color: '#2d3748', marginBottom: 12, fontWeight: 600 }}>
            Step 4 — Recommended Modifications ({recs.recommendations.length})
          </div>
          <div style={{ fontSize: 13, color: '#718096', marginBottom: 12 }}>
            Profile: <strong>{profile.name || 'client'}</strong>
            {profile.age ? `, age ${profile.age}` : ''} - mobility: <strong>{mobility}</strong>
          </div>

          {recs.recommendations.length === 0 ? (
            <div style={{ padding: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 13 }}>
              No modifications matched the selected rooms/mobility combo. Try widening room selection.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              {recs.recommendations.map(r => (
                <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 600, color: '#2d3748' }}>{r.title}</div>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: r.priority === 'High' ? '#c53030' : '#92400e',
                      background: r.priority === 'High' ? '#fff5f5' : '#fffbeb',
                      padding: '3px 8px', borderRadius: 10,
                    }}>{r.priority}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#4a5568', marginTop: 4 }}>
                    Room: <strong>{r.room}</strong> | Est. cost: <strong>{r.cost}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: '#718096', marginTop: 4 }}>
                    Vendors: {r.vendors.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: '#f7fafc', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#2d3748', marginBottom: 6 }}>Next Steps</div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#4a5568' }}>
              {recs.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>

          <button style={btnSecondary} onClick={reset}>Start Over</button>
        </div>
      )}
    </div>
  );
}
