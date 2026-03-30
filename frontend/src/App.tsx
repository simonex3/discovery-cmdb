import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Layout from './components/layout/Layout';
import Setup from './pages/Setup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Topology from './pages/Topology';
import Inventory from './pages/Inventory';
import CIDetail from './pages/CIDetail';
import Discovery from './pages/Discovery';
import ServiceNow from './pages/ServiceNow';
import FritzBox from './pages/FritzBox';
import AuditLog from './pages/AuditLog';
import Settings from './pages/Settings';
import Users from './pages/Users';

type AppState = 'loading' | 'setup' | 'login' | 'app';

export default function App() {
  const [state, setState] = useState<AppState>('loading');

  useEffect(() => {
    const init = async () => {
      try {
        const res = await axios.get('/api/v1/setup/status');
        if (!res.data.completed || !res.data.admin_exists) {
          setState('setup');
          return;
        }
        const token = localStorage.getItem('cmdb_token');
        if (!token) {
          setState('login');
          return;
        }
        // Verify token
        try {
          await axios.get('/api/v1/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          setState('app');
        } catch {
          localStorage.removeItem('cmdb_token');
          setState('login');
        }
      } catch {
        setState('login');
      }
    };
    init();
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🖧</div>
          <div className="text-slate-400 animate-pulse">Loading Discovery CMDB...</div>
        </div>
      </div>
    );
  }

  if (state === 'setup') {
    return <Setup onComplete={() => setState('app')} />;
  }

  if (state === 'login') {
    return <Login onLogin={() => setState('app')} />;
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/topology" element={<Topology />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/inventory/:id" element={<CIDetail />} />
          <Route path="/discovery" element={<Discovery />} />
          <Route path="/servicenow" element={<ServiceNow />} />
          <Route path="/fritz" element={<FritzBox />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
