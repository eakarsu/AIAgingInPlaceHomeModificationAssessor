import React, { useEffect, useState } from 'react';
import api from '../api/client';

const cardStyle = {
  background: '#fff',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
};

export default function HomeRiskMap({ homeId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const q = homeId ? `?home_id=${homeId}` : '';
    api.get(`/custom-views/home-risk-map${q}`)
      .then(r => { if (alive) { setData(r.data); setError(''); } })
      .catch(e => { if (alive) setError(e.response?.data?.message || 'Failed to load risk map'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [homeId]);

  if (loading) return <div style={cardStyle}>Loading home risk map...</div>;
  if (error) return <div style={{ ...cardStyle, color: '#c53030' }}>{error}</div>;
  if (!data) return null;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#1a202c' }}>Home Risk Map</h3>
        <span style={{ fontSize: 12, color: '#718096' }}>{data.home?.label}</span>
      </div>

      <svg viewBox={data.viewBox} style={{ width: '100%', height: 420, background: '#f7fafc', borderRadius: 8 }}>
        {data.rooms.map(r => (
          <g key={r.room}>
            <rect
              x={r.x} y={r.y} width={r.w} height={r.h}
              fill={r.color} fillOpacity="0.85"
              stroke="#1a202c" strokeWidth="1.5"
            />
            <text
              x={r.x + r.w / 2} y={r.y + r.h / 2 - 4}
              textAnchor="middle" fontSize="12" fontWeight="700" fill="#1a202c"
            >
              {r.room}
            </text>
            <text
              x={r.x + r.w / 2} y={r.y + r.h / 2 + 12}
              textAnchor="middle" fontSize="11" fill="#1a202c"
            >
              risk: {r.riskScore}
            </text>
          </g>
        ))}
      </svg>

      <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        {data.legend.map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4a5568' }}>
            <span style={{ width: 14, height: 14, background: l.color, borderRadius: 3, display: 'inline-block' }} />
            <span>{l.label} ({l.range})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
