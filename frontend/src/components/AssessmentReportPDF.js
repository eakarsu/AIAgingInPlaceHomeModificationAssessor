import React, { useEffect, useState } from 'react';
import api from '../api/client';

const cardStyle = {
  background: '#fff',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
};
const btn = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 14,
  background: '#667eea',
  color: '#fff',
};
const select = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e0',
  fontSize: 14,
  marginRight: 10,
  minWidth: 240,
};

export default function AssessmentReportPDF() {
  const [clients, setClients] = useState([]);
  const [picked, setPicked] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [sample, setSample] = useState(false);

  useEffect(() => {
    api.get('/custom-views/clients')
      .then(r => {
        setClients(r.data.clients || []);
        setSample(!!r.data.sampleData);
        if (r.data.clients?.length) setPicked(String(r.data.clients[0].id));
      })
      .catch(e => setError(e.response?.data?.message || 'Failed to load clients'));
  }, []);

  const download = async () => {
    if (!picked) return;
    setDownloading(true);
    setError('');
    try {
      const res = await api.get(`/custom-views/assessment-report?client_id=${encodeURIComponent(picked)}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const c = clients.find(x => String(x.id) === String(picked));
      const name = c?.resident_name || 'client';
      a.href = url;
      a.download = `assessment-${name.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'PDF download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#1a202c' }}>Assessment Report (PDF)</h3>
        {sample && <span style={{ fontSize: 11, color: '#a0aec0' }}>(sample clients)</span>}
      </div>

      <p style={{ fontSize: 13, color: '#4a5568', marginTop: 0 }}>
        Pick a client to generate a printable assessment report with risk scores, recommended modifications,
        and cost estimates.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <select
          style={select}
          value={picked}
          onChange={e => setPicked(e.target.value)}
          disabled={!clients.length}
        >
          {clients.length === 0 && <option value="">No clients available</option>}
          {clients.map(c => (
            <option key={c.id} value={c.id}>
              {c.resident_name || 'Unnamed'}{c.age ? ` (${c.age})` : ''}{c.address ? ` - ${c.address}` : ''}
            </option>
          ))}
        </select>
        <button style={btn} onClick={download} disabled={!picked || downloading}>
          {downloading ? 'Generating...' : 'Download PDF'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', color: '#c53030', padding: 8, borderRadius: 6, marginTop: 12, fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}
