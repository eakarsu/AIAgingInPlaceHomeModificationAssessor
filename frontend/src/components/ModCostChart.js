import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import api from '../api/client';

const cardStyle = {
  background: '#fff',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
};

export default function ModCostChart() {
  const [data, setData] = useState([]);
  const [sample, setSample] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/custom-views/mod-cost-breakdown')
      .then(r => {
        if (!alive) return;
        setData(r.data.data || []);
        setSample(!!r.data.sampleData);
        setError('');
      })
      .catch(e => { if (alive) setError(e.response?.data?.message || 'Failed to load cost data'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div style={cardStyle}>Loading cost breakdown...</div>;
  if (error) return <div style={{ ...cardStyle, color: '#c53030' }}>{error}</div>;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#1a202c' }}>Modification Cost Breakdown</h3>
        {sample && <span style={{ fontSize: 11, color: '#a0aec0' }}>(sample data)</span>}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="category" tick={{ fontSize: 12, fill: '#4a5568' }} />
          <YAxis tick={{ fontSize: 12, fill: '#4a5568' }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
          <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="minCost" name="Min Cost" fill="#667eea" radius={[6, 6, 0, 0]} />
          <Bar dataKey="maxCost" name="Max Cost" fill="#dc2626" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <div style={{ fontSize: 12, color: '#718096', marginTop: 8 }}>
        Items per category:{' '}
        {data.map((d, i) => (
          <span key={d.category}>
            {d.category}: <strong>{d.items}</strong>{i < data.length - 1 ? ' | ' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
