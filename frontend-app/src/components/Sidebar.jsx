import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FlaskConical, 
  Blocks, 
  BrainCircuit, 
  Users, 
  ScrollText, 
  ShieldCheck,
  Link as LinkIcon,
  CheckCircle2
} from 'lucide-react';

const NAV = [
  { section: 'Overview', items: [
    { path:'/',         icon: <LayoutDashboard size={18} />, label:'Dashboard' },
  ]},
  { section: 'Data Pipeline', items: [
    { path:'/inventor',  icon: <FlaskConical size={18} />, label:'Drug Inventor Portal' },
    { path:'/explorer',  icon: <Blocks size={18} />,  label:'TX & Block Explorer' },
  ]},
  { section: 'ML & Security', items: [
    { path:'/ml',        icon: <BrainCircuit size={18} />, label:'ML Verification Panel' },
  ]},
  { section: 'Governance', items: [
    { path:'/roles',     icon: <Users size={18} />, label:'Role Management' },
    { path:'/audit',     icon: <ScrollText size={18} />, label:'Audit Log' },
  ]},
  { section: 'Authority', items: [
    { path:'/admin',     icon: <ShieldCheck size={18} />, label:'Drug Authority Admin', highlight: true },
  ]},
];

export default function Sidebar() {
  const loc = useLocation();

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">
          <LinkIcon size={24} />
        </div>
        <div className="logo-text">
          <h2>ChainTrial</h2>
          <p>Private Blockchain</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(section => (
          <div key={section.section}>
            <div className="nav-section">
              <div className="nav-section-label">{section.section}</div>
            </div>
            {section.items.map(item => (
              <Link key={item.path}
                to={item.path}
                className={`nav-item ${loc.pathname === item.path ? 'active' : ''}`}
                style={item.highlight ? {
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  color: 'var(--accent-amber)',
                  marginTop: 4,
                  ...(loc.pathname === item.path ? {
                    background: 'rgba(245,158,11,0.15)',
                    borderColor: 'rgba(245,158,11,0.4)',
                    borderLeft: '3px solid var(--accent-amber)',
                  } : {}),
                } : {}}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Steps Implemented
        </div>
        {[
          '1. Data Ingestion', '2. SHA-256 Hashing',
          '3. Transactions',   '4. RBAC Nodes',
          '5. ML (8 models)',  '6. Smart Contracts',
          '7-8. Consensus',    '9. Blockchain',
          '10. IPFS',          '11. Compliance',
          '12. AI Governance'
        ].map(s => (
          <div key={s} style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:4, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={12} color="var(--accent-green)" /> {s}
          </div>
        ))}
      </div>
    </div>
  );
}
