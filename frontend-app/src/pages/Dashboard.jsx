import React, { useState, useEffect } from 'react';
import { getChain, getMetrics, getNodes, getTxStats, mlSummary, govHealth } from '../api';
import { 
  Blocks, ClipboardList, CheckCircle, XCircle, Server, Zap, 
  AlertTriangle, BrainCircuit, Activity, CheckCircle2 
} from 'lucide-react';

// ── Stat Card ─────────────────────────────────────────────────
const Stat = ({ icon, label, value, delta, color = 'blue' }) => (
  <div className="stat-card">
    <div className={`stat-icon ${color}`}>{icon}</div>
    <div className="stat-content">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {delta && <div className="stat-delta">{delta}</div>}
    </div>
  </div>
);

// ── Mini Block ────────────────────────────────────────────────
const MiniBlock = ({ block, onClick }) => (
  <div className="block-item fade-in" onClick={() => onClick(block)}>
    <div className="block-index">{block.index}</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
        Block #{block.index}
      </div>
      <div className="hash-display" style={{ marginTop: '4px' }}>{block.block_hash}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6, fontWeight: 500 }}>
        {block.tx_count} transactions · {block.validator_id}
      </div>
    </div>
    <span className="badge badge-valid"><CheckCircle2 size={14} /> Valid</span>
  </div>
);

export default function Dashboard() {
  const [stats, setStats]   = useState(null);
  const [chain, setChain]   = useState([]);
  const [nodes, setNodes]   = useState([]);
  const [ml, setMl]         = useState(null);
  const [gov, setGov]       = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [apiOk, setApiOk]   = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setApiOk(true);
        const [chainR, txR, nodeR, govR, metrR] = await Promise.allSettled([
          getChain(), getTxStats(), getNodes(), govHealth(), getMetrics()
        ]);
        if (chainR.status === 'fulfilled') setChain(chainR.value.data.chain || []);
        if (txR.status   === 'fulfilled') setStats(txR.value.data);
        if (nodeR.status === 'fulfilled') setNodes(nodeR.value.data.nodes || []);
        if (govR.status  === 'fulfilled') setGov(govR.value.data);
        if (metrR.status === 'fulfilled') setMetrics(metrR.value.data);

        try { const mlR = await mlSummary(); setMl(mlR.data); } catch {}
      } catch { setApiOk(false); }
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);



  return (
    <div className="page-content fade-in">
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ background: 'var(--grad-accent)', WebkitBackgroundClip: 'text',
                     WebkitTextFillColor: 'transparent', marginBottom: 8 }}>
          Clinical Trial Blockchain
        </h1>
        <p>ML-Integrated Private Blockchain for Securing Clinical Trials Data</p>
      </div>

      {apiOk === false && (
        <div className="alert alert-error">
          <AlertTriangle size={18} /> Cannot reach backend API at localhost:8000. Start the FastAPI server first.
        </div>
      )}

      {/* Stats Row */}
      <div className="stats-grid">
        <Stat icon={<Blocks size={24} />} label="Blocks"           value={chain.length || 0}    color="blue"   />
        <Stat icon={<ClipboardList size={24} />} label="Pending TXs"       value={stats?.pending || 0}  color="amber"  />
        <Stat icon={<CheckCircle size={24} />} label="Confirmed TXs"     value={stats?.confirmed || 0} color="green" />
        <Stat icon={<XCircle size={24} />} label="Rejected TXs"      value={stats?.rejected || 0} color="red"   />
        <Stat icon={<Server size={24} />} label="Active Nodes"      value={nodes.filter(n=>n.active).length} color="purple" />
        <Stat icon={<Zap size={24} />} label="Active Gate Model"
              value={ml ? 'XGBoost' : 'N/A'}
              delta={(() => { const xgb = ml?.models?.find(m => m.is_gate_model); return xgb ? `F1 ${xgb.f1}% · AUC ${xgb.auc_roc}` : null; })()}
              color="amber" />
      </div>

      <div className="grid-2">
        {/* Block Explorer */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Blocks size={18} /> Recent Blocks</div>
              <div className="card-subtitle">Last {Math.min(chain.length,5)} blocks appended</div>
            </div>
          </div>
          <div className="block-chain">
            {chain.length === 0
              ? <p style={{ textAlign:'center', padding:20 }}>No blocks yet</p>
              : chain.slice(-5).reverse().map(b => (
                <MiniBlock key={b.index} block={b} onClick={setSelected} />
              ))
            }
          </div>
        </div>

        {/* Node Overview */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Server size={18} /> Network Nodes</div>
              <div className="card-subtitle">Trust scores &amp; roles</div>
            </div>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Node</th><th>Role</th><th>Reputation</th><th>Status</th></tr>
              </thead>
              <tbody>
                {nodes.map(n => (
                  <tr key={n.node_id}>
                    <td className="mono" style={{fontWeight: 600}}>{n.node_id}</td>
                    <td><span className="badge badge-blue">{n.role.replace(/_/g,' ')}</span></td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div className="progress-bar" style={{ width:80 }}>
                          <div className="progress-fill" style={{ width:`${n.reputation_score}%` }} />
                        </div>
                        <span style={{fontSize:'0.8rem', fontWeight:600}}>{n.reputation_score}</span>
                      </div>
                    </td>
                    <td><span className={`badge ${n.active ? 'badge-valid' : 'badge-tampered'}`}>
                      {n.active ? 'Active' : 'Inactive'}
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Governance + Metrics */}
      <div className="grid-2">
        {gov && (
          <div className="card">
            <div className="card-header">
              <div className="card-title"><BrainCircuit size={18} /> AI Governance</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {[
                ['TPS',         gov.latest_tps?.toFixed(2) ?? '—'],
                ['Approval ms', gov.latest_approval_ms?.toFixed(0) ?? '—'],
                ['Gate Model',  ml ? 'XGBoost' : (gov.latest_ml_accuracy ? `${gov.latest_ml_accuracy}%` : '—')],
                ['Threshold',   gov.consensus_threshold != null ? `${(gov.consensus_threshold*100).toFixed(0)}%` : '67%'],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'var(--bg-primary)', borderRadius:'var(--radius-md)',
                                      padding:'16px', border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', fontWeight: 600 }}>{k}</div>
                  <div style={{ fontSize:'1.2rem', fontWeight:700, marginTop: 4, color: 'var(--text-primary)' }}>{v}</div>
                </div>
              ))}
            </div>
            {gov.retrain_flag && (
              <div className="alert alert-warning" style={{ marginTop:20 }}>
                <AlertTriangle size={18} /> ML model retraining recommended due to accuracy drift
              </div>
            )}
          </div>
        )}

        {metrics && (
          <div className="card">
            <div className="card-header">
              <div className="card-title"><Activity size={18} /> API Performance</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {[
                ['Total Requests', metrics.total_requests ?? '—'],
                ['Avg Latency',    `${metrics.last_100_avg_ms ?? '—'} ms`],
                ['Max Latency',    `${metrics.last_100_max_ms ?? '—'} ms`],
                ['Min Latency',    `${metrics.last_100_min_ms ?? '—'} ms`],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'var(--bg-primary)', borderRadius:'var(--radius-md)',
                                      padding:'16px', border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', fontWeight: 600 }}>{k}</div>
                  <div style={{ fontSize:'1.2rem', fontWeight:700, marginTop: 4, color: 'var(--text-primary)' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Block detail modal */}
      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                      display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}
             onClick={() => setSelected(null)}>
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)',
                        borderRadius:'var(--radius-xl)', padding:32, maxWidth:560, width:'90%',
                        maxHeight:'80vh', overflow:'auto', boxShadow: 'var(--shadow-lg)' }}
               onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20, alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem' }}>Block #{selected.index}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}><XCircle size={16} /></button>
            </div>
            {[['Hash',          selected.block_hash],
              ['Previous Hash', selected.previous_hash],
              ['Validator',     selected.validator_id],
              ['Transactions',  selected.tx_count],
            ].map(([k,v]) => (
              <div key={k} style={{ marginBottom:16 }}>
                <div style={{ fontSize:'0.8rem', fontWeight: 600, color:'var(--text-secondary)', marginBottom:6 }}>{k}</div>
                <div className="hash-display">{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
