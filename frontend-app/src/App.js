import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './index.css';

import Sidebar      from './components/Sidebar';
import Dashboard    from './pages/Dashboard';
import InventorPortal from './pages/InventorPortal';
import TxExplorer   from './pages/TxExplorer';
import MLPanel      from './pages/MLPanel';
import RoleManagement from './pages/RoleManagement';
import AuditLog     from './pages/AuditLog';
import DrugAuthorityAdmin from './pages/DrugAuthorityAdmin';
import { healthCheck } from './api';

const PAGE_TITLES = {
  '/':        'Dashboard',
  '/inventor':'Drug Inventor Portal',
  '/explorer':'TX & Block Explorer',
  '/ml':      'ML Verification Panel',
  '/roles':   'Role Management',
  '/audit':   'Audit Log',
  '/admin':   'Drug Authority Admin',
};

function TopBar({ apiOk }) {
  const path  = window.location.pathname;
  const title = PAGE_TITLES[path] || 'ChainTrial';
  return (
    <div className="topbar">
      <div className="topbar-title">{title}</div>
      <div className="topbar-actions">
        {apiOk === true  && <div className="network-badge">Private Network Online</div>}
        {apiOk === false && <div className="network-badge" style={{ color:'var(--accent-red)', background:'rgba(239,68,68,0.1)', borderColor:'rgba(239,68,68,0.3)' }}>API Offline</div>}
        {apiOk === null  && <div className="network-badge" style={{ color:'var(--text-muted)', background:'var(--bg-secondary)' }}>Connecting…</div>}
      </div>
    </div>
  );
}

export default function App() {
  const [apiOk, setApiOk] = useState(null);

  useEffect(() => {
    const check = async () => {
      try { await healthCheck(); setApiOk(true); }
      catch { setApiOk(false); }
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <Router>
      <div className="app-layout">
        <Sidebar />
        <div className="main-content">
          <TopBar apiOk={apiOk} />
          <Routes>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/inventor" element={<InventorPortal />} />
            <Route path="/explorer" element={<TxExplorer />} />
            <Route path="/ml"       element={<MLPanel />} />
            <Route path="/roles"    element={<RoleManagement />} />
            <Route path="/audit"    element={<AuditLog />} />
            <Route path="/admin"    element={<DrugAuthorityAdmin />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
