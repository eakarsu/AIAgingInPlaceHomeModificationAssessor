import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import HomeRiskMap from '../components/HomeRiskMap';
import ModCostChart from '../components/ModCostChart';
import AssessmentReportPDF from '../components/AssessmentReportPDF';
import ModRecWizard from '../components/ModRecWizard';

const s = {
  layout: { display: 'flex', minHeight: '100vh', background: '#f7fafc' },
  sidebar: {
    width: 220, background: '#1a202c', color: '#cbd5e0',
    padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 6,
  },
  sidebarTitle: {
    fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: '#a0aec0',
    margin: '0 0 12px',
  },
  sideLink: {
    background: 'transparent', border: 'none', color: '#cbd5e0',
    textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
    fontSize: 14,
  },
  sideLinkActive: {
    background: '#2d3748', color: '#fff',
  },
  main: { flex: 1, padding: 24, maxWidth: 1400, margin: '0 auto' },
  navbar: {
    background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 24px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    height: 60, marginBottom: 24, borderRadius: 0,
  },
  grid: {
    display: 'grid', gap: 20,
    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
  },
  title: { margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: '#1a202c' },
  subtitle: { margin: '0 0 20px', color: '#718096', fontSize: 14 },
};

export default function CustomViewsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div style={s.layout}>
      <aside style={s.sidebar} data-testid="aging-sidebar">
        <h4 style={s.sidebarTitle}>Aging Views</h4>
        <button style={s.sideLink} onClick={() => navigate('/')}>Dashboard</button>
        <button style={s.sideLink} onClick={() => navigate('/contractors')}>Contractors</button>
        <button style={{ ...s.sideLink, ...s.sidebarLinkActive, background: '#2d3748', color: '#fff' }}>
          Custom Views
        </button>
        <div style={{ marginTop: 'auto', fontSize: 12, color: '#718096' }}>
          Signed in as<br /><strong style={{ color: '#cbd5e0' }}>{user?.name || 'User'}</strong>
        </div>
      </aside>

      <div style={{ flex: 1 }}>
        <nav style={s.navbar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22 }}>🏡</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Aging-in-Place Assessor — Custom Views</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}
            >
              Sign Out
            </button>
          </div>
        </nav>

        <div style={s.main}>
          <h1 style={s.title}>Aging-in-Place Custom Views</h1>
          <p style={s.subtitle}>
            Specialized dashboards for ADA compliance, fall-risk profiling, and modification planning.
          </p>

          <div style={s.grid}>
            <HomeRiskMap />
            <ModCostChart />
            <AssessmentReportPDF />
            <ModRecWizard />
          </div>
        </div>
      </div>
    </div>
  );
}
