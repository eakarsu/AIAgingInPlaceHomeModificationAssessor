import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  card: { background: '#fff', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  title: { textAlign: 'center', marginBottom: '8px', fontSize: '24px', fontWeight: '700', color: '#1a202c' },
  subtitle: { textAlign: 'center', marginBottom: '32px', color: '#718096', fontSize: '14px' },
  tabs: { display: 'flex', gap: '4px', background: '#f7fafc', borderRadius: '8px', padding: '4px', marginBottom: '24px' },
  tab: { flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', background: 'transparent', color: '#718096' },
  tabActive: { background: '#fff', color: '#667eea', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  group: { marginBottom: '16px' },
  label: { display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#4a5568' },
  input: { width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', transition: 'border 0.2s' },
  btn: { width: '100%', padding: '12px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' },
  error: { background: '#fff5f5', border: '1px solid #fc8181', borderRadius: '8px', padding: '10px', marginBottom: '16px', color: '#c53030', fontSize: '13px' },
  icon: { textAlign: 'center', fontSize: '40px', marginBottom: '12px' },
};

export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login' ? { email: form.email, password: form.password } : form;
      const res = await api.post(endpoint, payload);
      login(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>🏡</div>
        <h1 style={styles.title}>Aging-in-Place Assessor</h1>
        <p style={styles.subtitle}>Home Modification Assessment Platform</p>

        <div style={styles.tabs}>
          {['login', 'register'].map(m => (
            <button key={m} style={{ ...styles.tab, ...(mode === m ? styles.tabActive : {}) }} onClick={() => { setMode(m); setError(''); }}>
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div style={styles.group}>
              <label style={styles.label}>Full Name</label>
              <input style={styles.input} type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" required />
            </div>
          )}
          <div style={styles.group}>
            <label style={styles.label}>Email Address</label>
            <input style={styles.input} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" required />
          </div>
          <div style={styles.group}>
            <label style={styles.label}>Password</label>
            <input style={styles.input} type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 6 characters" required />
          </div>
          {mode === 'register' && (
            <div style={styles.group}>
              <label style={styles.label}>Phone (optional)</label>
              <input style={styles.input} type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
            </div>
          )}
          <button
            type="button"
            onClick={() => { setForm((current) => ({ ...current, email: import.meta.env.VITE_DEMO_EMAIL || '', password: import.meta.env.VITE_DEMO_PASSWORD || '' })); }}
            disabled={!import.meta.env.VITE_DEMO_EMAIL || !import.meta.env.VITE_DEMO_PASSWORD}
            aria-label="Auto Fill Demo Credentials"
            style={{ width: '100%', marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid currentColor', background: 'transparent', cursor: 'pointer' }}
          >
            Auto Fill Demo Credentials
          </button>
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
