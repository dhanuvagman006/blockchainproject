import React, { useState, useEffect } from 'react';
import { getNodes, registerNode, updateRep } from '../api';
import { 
  Server, Microscope, ScrollText, Landmark, Plus, X, 
  TrendingUp, Lock, CheckCircle2, AlertTriangle 
} from 'lucide-react';

const ROLES = ['PROTOCOL_VALIDATOR','CONSENT_VERIFIER','COMPLIANCE_AUDITOR'];
const ROLE_ICONS = { 
  PROTOCOL_VALIDATOR: <Microscope size={18} />, 
  CONSENT_VERIFIER: <ScrollText size={18} />, 
  COMPLIANCE_AUDITOR: <Landmark size={18} /> 
};
const ROLE_COLORS = { PROTOCOL_VALIDATOR:'blue', CONSENT_VERIFIER:'purple', COMPLIANCE_AUDITOR:'amber' };

const PERMS = {
  PROTOCOL_VALIDATOR:  ['read_transaction','validate_transaction','sign_block','vote_consensus'],
  CONSENT_VERIFIER:    ['read_transaction','verify_consent','validate_transaction','sign_block','vote_consensus'],
  COMPLIANCE_AUDITOR:  ['read_transaction','read_block','read_audit_log'],
};

export default function RoleManagement() {
  const [nodes, setNodes] = useState([]);
  const [regForm, setRegForm] = useState({ node_id:'', role:'PROTOCOL_VALIDATOR', organization:'' });
  const [regResult, setRegResult] = useState(null);
  const [repForm, setRepForm] = useState({ node_id:'', delta:5 });
  const [repResult, setRepResult] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [showReg, setShowReg] = useState(false);

  const load = async () => {
    try { setNodes((await getNodes()).data.nodes||[]); } catch {}
  };

  useEffect(() => { load(); }, []);

  const handleRegister = async () => {
    try {
      const r = await registerNode(regForm);
      setRegResult(r.data);
      setRegForm({ node_id:'', role:'PROTOCOL_VALIDATOR', organization:'' });
      setShowReg(false);
      await load();
    } catch(e) { setRegResult({ error: e.response?.data?.detail||e.message }); }
  };

  const handleRepUpdate = async () => {
    try {
      const r = await updateRep(repForm.node_id, parseFloat(repForm.delta));
      setRepResult(r.data);
      await load();
    } catch(e) { setRepResult({ error: e.response?.data?.detail||e.message }); }
  };

  const filtered = filter==='ALL' ? nodes : nodes.filter(n=>n.role===filter);

  const byRole = ROLES.reduce((acc,r)=>({ ...acc, [r]: nodes.filter(n=>n.role===r).length }), {});

  return (
    <div className="page-content fade-in">
      <div style={{marginBottom:32,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Server size={28} color="var(--accent-blue)" /> Role Management
          </h2>
          <p style={{ marginTop: 6 }}>Manage node roles, permissions, and trust scores (Step 4 — RBAC)</p>
        </div>
        <button className={showReg ? "btn btn-secondary" : "btn btn-primary"} onClick={()=>setShowReg(s=>!s)}>
          {showReg ? <><X size={18} /> Cancel</> : <><Plus size={18} /> Register Node</>}
        </button>
      </div>

      {/* Role stats */}
      <div className="stats-grid">
        {ROLES.map(r=>(
          <div key={r} className="stat-card" onClick={()=>setFilter(r)} style={{cursor:'pointer'}}>
            <div className={`stat-icon ${ROLE_COLORS[r]}`}>{ROLE_ICONS[r]}</div>
            <div className="stat-content">
              <div className="stat-value">{byRole[r]||0}</div>
              <div className="stat-label">{r.replace(/_/g,' ')}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Register form */}
      {showReg && (
        <div className="card fade-in">
          <div className="card-title" style={{marginBottom:24}}>
            <Plus size={18} /> Register New Node
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Node ID</label>
              <input className="form-input" placeholder="NODE-06" value={regForm.node_id}
                onChange={e=>setRegForm(p=>({...p,node_id:e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-select" value={regForm.role}
                onChange={e=>setRegForm(p=>({...p,role:e.target.value}))}>
                {ROLES.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Organization</label>
              <input className="form-input" placeholder="PharmaCorp" value={regForm.organization}
                onChange={e=>setRegForm(p=>({...p,organization:e.target.value}))} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleRegister}
            disabled={!regForm.node_id||!regForm.organization}>
            <CheckCircle2 size={16} /> Register
          </button>
          {regResult && (
            <div className={`alert ${regResult.error?'alert-error':'alert-success'}`} style={{marginTop:20}}>
              {regResult.error ? <><AlertTriangle size={16}/> {regResult.error}</> : <><CheckCircle2 size={16}/> Node {regResult.node_id} registered as {regResult.role}</>}
            </div>
          )}
        </div>
      )}

      {/* Reputation update */}
      <div className="card">
        <div className="card-title" style={{marginBottom:20}}>
          <TrendingUp size={18} /> Update Node Reputation (AI Governance Feedback)
        </div>
        <div style={{display:'flex',gap:16,alignItems:'flex-end'}}>
          <div className="form-group" style={{marginBottom:0,flex:1}}>
            <label className="form-label">Node ID</label>
            <select className="form-select" value={repForm.node_id}
              onChange={e=>setRepForm(p=>({...p,node_id:e.target.value}))}>
              <option value="">Select node…</option>
              {nodes.map(n=><option key={n.node_id}>{n.node_id}</option>)}
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0,width:140}}>
            <label className="form-label">Delta</label>
            <input className="form-input" type="number" value={repForm.delta}
              onChange={e=>setRepForm(p=>({...p,delta:e.target.value}))} />
          </div>
          <button className="btn btn-primary" onClick={handleRepUpdate} disabled={!repForm.node_id}>
            Update
          </button>
        </div>
        {repResult && (
          <div className={`alert ${repResult.error?'alert-error':'alert-success'}`} style={{marginTop:20}}>
            {repResult.error ? <><AlertTriangle size={16}/> {repResult.error}</> :
              <><CheckCircle2 size={16}/> {repResult.node_id} new reputation: {repResult.new_reputation}</>}
          </div>
        )}
      </div>

      {/* Node table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Server size={18} /> All Nodes</div>
          <div style={{display:'flex',gap:8}}>
            {['ALL',...ROLES].map(f=>(
              <button key={f} className={`btn btn-sm ${filter===f?'btn-primary':'btn-secondary'}`}
                onClick={()=>setFilter(f)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {f==='ALL' ? 'All' : ROLE_ICONS[f]} {f !== 'ALL' && <span style={{display: 'none'}}>{f}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Node ID</th><th>Role</th><th>Org</th><th>Reputation</th><th>Weight</th><th>Permissions</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filtered.map(n=>(
                <tr key={n.node_id}>
                  <td style={{fontWeight:600}}>{n.node_id}</td>
                  <td>
                    <span className={`badge badge-${ROLE_COLORS[n.role]||'blue'}`}>
                      {ROLE_ICONS[n.role]} {n.role.replace(/_/g,' ')}
                    </span>
                  </td>
                  <td>{n.organization}</td>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div className="progress-bar" style={{width:80}}>
                        <div className="progress-fill" style={{width:`${n.reputation_score}%`}} />
                      </div>
                      <span style={{fontSize:'0.85rem',fontWeight:600}}>{n.reputation_score}</span>
                    </div>
                  </td>
                  <td style={{fontWeight:600,color:'var(--accent-cyan)'}}>
                    {n.consensus_weight?.toFixed(2)}
                  </td>
                  <td>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {(n.permissions||PERMS[n.role]||[]).slice(0,3).map(p=>(
                        <span key={p} className="badge badge-blue" style={{fontSize:'0.7rem'}}>{p.replace(/_/g,' ')}</span>
                      ))}
                    </div>
                  </td>
                  <td><span className={`badge ${n.active?'badge-valid':'badge-tampered'}`}>
                    {n.active?'Active':'Inactive'}
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permission matrix */}
      <div className="card">
        <div className="card-title" style={{marginBottom:24}}>
          <Lock size={18} /> Role-Permission Matrix
        </div>
        <div className="grid-3">
          {ROLES.map(role=>(
            <div key={role} className="model-card">
              <div className="model-name">
                <span style={{ color: `var(--accent-${ROLE_COLORS[role]})` }}>{ROLE_ICONS[role]}</span>
                {role.replace(/_/g,' ')}
              </div>
              <div style={{marginTop:16}}>
                {PERMS[role].map(p=>(
                  <div key={p} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                    <CheckCircle2 size={14} color="var(--accent-green)" />
                    <span style={{fontSize:'0.85rem',color:'var(--text-primary)', fontWeight: 500}}>{p.replace(/_/g,' ')}</span>
                  </div>
                ))}
                {['read_transaction','validate_transaction','sign_block','vote_consensus','verify_consent']
                  .filter(p=>!PERMS[role].includes(p))
                  .map(p=>(
                    <div key={p} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                      <X size={14} color="var(--text-muted)" />
                      <span style={{fontSize:'0.85rem',color:'var(--text-muted)'}}>{p.replace(/_/g,' ')}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
