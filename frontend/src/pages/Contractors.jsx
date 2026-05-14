import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

const s = {
  page: { maxWidth: '1000px', margin: '0 auto', padding: '24px' },
  btn: { padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px' },
  btnPrimary: { background: '#667eea', color: '#fff' },
  btnSecondary: { background: '#fff', color: '#4a5568', border: '1px solid #e2e8f0' },
  card: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', marginBottom: '12px' },
  searchBar: { display: 'flex', gap: '12px', marginBottom: '24px', background: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  input: { flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none' },
  badge: { display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' },
  stars: { color: '#f6ad55', fontSize: '15px' },
  navbar: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '12px', height: '60px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
};

const renderStars = (rating) => {
  const n = Math.round(parseFloat(rating) || 0);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
};

export default function Contractors() {
  const navigate = useNavigate();
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zip, setZip] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const LIMIT = 20;

  useEffect(() => { loadContractors(zip, specialty, page); }, [page]);

  const loadContractors = async (z, sp, p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (z || zip) params.set('zip', z || zip);
      if (sp || specialty) params.set('specialty', sp || specialty);
      params.set('page', p);
      params.set('limit', LIMIT);
      const res = await api.get(`/contractors?${params.toString()}`);
      setContractors(res.data.data || []);
      if (res.data.pagination) setPagination(res.data.pagination);
    } catch (err) {
      setError('Failed to load contractors');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadContractors(zip, specialty, 1);
  };

  return (
    <>
      <nav style={s.navbar}>
        <button style={{ ...s.btn, ...s.btnSecondary, padding: '6px 14px' }} onClick={() => navigate('/')}>← Dashboard</button>
        <span style={{ fontWeight: '700', fontSize: '16px' }}>Find Contractors</span>
      </nav>
      <div style={s.page}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: '26px' }}>Contractor Directory</h1>
          <p style={{ margin: 0, color: '#718096' }}>Find certified aging-in-place specialists near you</p>
        </div>

        <form onSubmit={handleSearch} style={s.searchBar}>
          <input style={s.input} placeholder="ZIP Code" value={zip} onChange={e => setZip(e.target.value)} maxLength={10} />
          <select style={{ ...s.input, flex: 0.8 }} value={specialty} onChange={e => setSpecialty(e.target.value)}>
            <option value="">All Specialties</option>
            <option value="bathroom">Bathroom Modifications</option>
            <option value="ramp">Ramp Installation</option>
            <option value="stair lift">Stair Lifts</option>
            <option value="lighting">Lighting Upgrades</option>
            <option value="smart home">Smart Home Controls</option>
            <option value="general">General Contractor</option>
          </select>
          <button type="submit" style={{ ...s.btn, ...s.btnPrimary }}>Search</button>
          <button type="button" style={{ ...s.btn, ...s.btnSecondary }} onClick={() => { setZip(''); setSpecialty(''); setPage(1); loadContractors('', '', 1); }}>Clear</button>
        </form>

        {error && <div style={{ color: '#c53030', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#718096' }}>Loading contractors...</div>
        ) : contractors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#718096', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
            <p>No contractors found. Try a different zip code or specialty.</p>
          </div>
        ) : contractors.map(c => (
          <div key={c.id} style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '700', fontSize: '16px' }}>{c.name}</span>
                  {c.is_certified_aging_specialist && (
                    <span style={{ ...s.badge, background: '#c6f6d5', color: '#22543d' }}>✓ Aging Specialist</span>
                  )}
                </div>
                {c.specialty && <div style={{ fontSize: '13px', color: '#4a5568', marginBottom: '4px', textTransform: 'capitalize' }}>Specialty: {c.specialty}</div>}
                {c.license_number && <div style={{ fontSize: '12px', color: '#718096' }}>License: {c.license_number}</div>}
                <div style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '13px' }}>
                  {c.phone && <a href={`tel:${c.phone}`} style={{ color: '#667eea', textDecoration: 'none' }}>📞 {c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} style={{ color: '#667eea', textDecoration: 'none' }}>✉ {c.email}</a>}
                  {c.zip_code && <span style={{ color: '#718096' }}>📍 {c.zip_code}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                {c.rating && (
                  <>
                    <div style={s.stars}>{renderStars(c.rating)}</div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#2d3748' }}>{parseFloat(c.rating).toFixed(1)}</div>
                    <div style={{ fontSize: '11px', color: '#718096' }}>{c.review_count || 0} reviews</div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {contractors.length > 0 && (
          <>
            <p style={{ textAlign: 'center', color: '#a0aec0', fontSize: '13px', marginTop: '24px' }}>
              Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, pagination.total)} of {pagination.total} contractor{pagination.total !== 1 ? 's' : ''}
            </p>
            {pagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
                <button style={{ ...s.btn, ...s.btnSecondary, padding: '6px 14px' }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span style={{ fontSize: '14px', color: '#718096', display: 'flex', alignItems: 'center' }}>Page {page} of {pagination.totalPages}</span>
                <button style={{ ...s.btn, ...s.btnSecondary, padding: '6px 14px' }} disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
