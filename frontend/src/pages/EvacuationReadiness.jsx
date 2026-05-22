import React, { useEffect, useState } from 'react';
import api from '../api/client';

const card = { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' };

export default function EvacuationReadiness() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/evacuation-readiness')
      .then((res) => setData(res.data))
      .catch(() => setData({ error: 'Unable to load evacuation readiness.' }));
  }, []);

  if (!data) return <div style={{ padding: 24 }}>Loading...</div>;

  return (
    <>
      <nav style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px' }}>
        <strong>Aging-in-Place Assessor</strong>
      </nav>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <h1>Evacuation Readiness</h1>
        <p style={{ color: '#718096' }}>Exit clearance, lighting, caregiver access, and emergency egress preparation.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, margin: '24px 0' }}>
          <Metric label="Readiness" value={data.summary?.readinessScore} />
          <Metric label="Blocked Exits" value={data.summary?.blockedExits} />
          <Metric label="Caregiver Gaps" value={data.summary?.caregiverGaps} />
          <Metric label="Urgent Fixes" value={data.summary?.urgentFixes} />
        </div>
        <div style={card}>
          {data.zones?.map((zone) => (
            <div key={zone.area} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12, padding: '12px 0', borderBottom: '1px solid #edf2f7' }}>
              <strong>{zone.area}</strong><span>{zone.issue}</span><span>{zone.priority}</span>
            </div>
          ))}
        </div>
        <div style={{ ...card, marginTop: 16 }}><h2>Actions</h2><ul>{data.actions?.map((action) => <li key={action}>{action}</li>)}</ul></div>
      </div>
    </>
  );
}

function Metric({ label, value }) {
  return <div style={card}><div style={{ color: '#718096', fontSize: 13 }}>{label}</div><div style={{ color: '#667eea', fontSize: 28, fontWeight: 700 }}>{value}</div></div>;
}
