import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import HomeDetail from './pages/HomeDetail';
import AssessmentResults from './pages/AssessmentResults';
import Contractors from './pages/Contractors';
import CustomViewsPage from './pages/CustomViewsPage';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/homes/:id" element={<ProtectedRoute><HomeDetail /></ProtectedRoute>} />
      <Route path="/assessments/:id" element={<ProtectedRoute><AssessmentResults /></ProtectedRoute>} />
      <Route path="/contractors" element={<ProtectedRoute><Contractors /></ProtectedRoute>} />
      <Route path="/custom-views" element={<ProtectedRoute><CustomViewsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
