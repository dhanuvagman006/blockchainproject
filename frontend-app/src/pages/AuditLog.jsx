import React, { useState, useEffect } from 'react';
import { govHealth, govActions, getMetrics } from '../api';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { 
  Landmark, AlertTriangle, Activity, Timer, BrainCircuit, 
  Settings, BarChart3, ClipboardList, TrendingUp, RefreshCw,
  Lock, Server, Info, ShieldAlert, Zap
} from 'lucide-react';

const ACTION_ICONS = { 
  REPUTATION_ADJUST: <TrendingUp size={16} />, 
  THRESHOLD_CHANGE: <Settings size={16} />, 
  ALERT: <ShieldAlert size={16} /> 
};
const ACTION_COLORS = { REPUTATION_ADJUST:'badge-blue', THRESHOLD_CHANGE:'badge-purple', ALERT:'badge-tampered' };

export default function AuditLog() {
  const [health,  setHealth]  = useState(null);
  const [actions, setActions] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [tab,     setTab]     = useState('audit');

  // Simulated TPS trend (would come from live metrics in production)
  const [tpsTrend] = useState(() =>
    Array.from({length:12},(_,i)=>({
      t: `${i*5}s`,
      tps: 8 + Math.sin(i*0.8)*3 + Math.random(),
      latency: 120 + Math.cos(i*0.5)*40 + Math.random()*20
    }))
  );

  const load = async () => {
    const [h,a,m] = await Promise.allSettled([govHealth(), govActions(50), getMetrics()]);
    if (h.status==='fulfilled') setHealth(h.value.data);
    if (a.status==='fulfilled') setActions(a.value.data.actions||[]);
    if (m.status==='fulfilled') setMetrics(m.value.data);
  };

  useEffect(() => { load(); const id=setInterval(load,8000); return()=>clearInterval(id); }, []);

  const nodeReps = health?.node_reputations || {};

  return (
    <div className="page-content fade-in">
      <div style={{marginBottom:32}}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Landmark size={28} color="var(--accent-blue)" /> Audit Log &amp; Performance
        </h2>
        <p style={{ marginTop: 8 }}>Compliance audit trail (read-only) · AI Governance actions · System performance (Steps 11–12)</p>
      </div>

      {health?.retrain_flag && (
        <div className="alert alert-warning" style={{marginBottom:24}}>
          <AlertTriangle size={18} /> <strong>ML Retraining Flag Active</strong> — AI governance detected accuracy drift. Run <code>python ml/train_models.py</code>
        </div>
      )}

      {/* Governance health cards */}
      {health && (
        <div className="stats-grid" style={{marginBottom:32}}>
          {[
            [<Activity size={24}/>, 'TPS', health.latest_tps?.toFixed(2)??'—', 'blue'],
            [<Timer size={24}/>, 'Avg Latency', `${health.latest_approval_ms?.toFixed(0)??'—'} ms`, 'amber'],
            [<BrainCircuit size={24}/>, 'ML Accuracy', `${health.latest_ml_accuracy??'—'}%`, 'green'],
            [<Settings size={24}/>, 'Consensus Threshold', health.consensus_threshold != null ? `${(health.consensus_threshold*100).toFixed(0)}%` : '67%', 'purple'],
            [<BarChart3 size={24}/>, 'Total Actions', health.total_actions??0, 'cyan'],
            [<ClipboardList size={24}/>, 'Pending TXs', health.pending_txs??0, 'red'],
          ].map(([icon,label,val,color])=>(
            <div key={label} className="stat-card">
              <div className={`stat-icon ${color}`}>{icon}</div>
              <div className="stat-content">
                <div className="stat-value">{val}</div>
                <div className="stat-label">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="tabs">
        {[
          ['audit', <><ClipboardList size={16} style={{marginRight:6, display:'inline'}}/> Audit Log</>],
          ['perf', <><BarChart3 size={16} style={{marginRight:6, display:'inline'}}/> Performance</>],
          ['nodes', <><Server size={16} style={{marginRight:6, display:'inline'}}/> Node Trust</>]
        ].map(([k,l])=>(
          <div key={k} className={`tab ${tab===k?'active':''}`} onClick={()=>setTab(k)} style={{ display: 'flex', alignItems: 'center' }}>{l}</div>
        ))}
      </div>

      {/* Audit Log */}
      {tab==='audit' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><ClipboardList size={18} /> Governance Action Log</div>
              <div className="card-subtitle">HIPAA · GDPR · GCP compliance — read-only for Compliance Auditor role</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
          </div>
          {actions.length === 0
            ? <p style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No governance actions yet — submit transactions to generate data</p>
            : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr><th>Time</th><th>Action</th><th>Node</th><th>Delta</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {[...actions].reverse().map((a,i)=>(
                      <tr key={i}>
                        <td style={{fontSize:'0.85rem',color:'var(--text-muted)', fontWeight: 500}}>
                          {new Date(a.timestamp*1000).toLocaleTimeString()}
                        </td>
                        <td>
                          <span className={`badge ${ACTION_COLORS[a.action_type]||'badge-blue'}`}>
                            {ACTION_ICONS[a.action_type]} {a.action_type.replace(/_/g,' ')}
                          </span>
                        </td>
                        <td style={{fontWeight: 600}}>{a.target_node || <span style={{color:'var(--text-muted)'}}>Network</span>}</td>
                        <td style={{color:a.delta>0?'var(--accent-green)':'var(--accent-red)',fontWeight:700}}>
                          {a.delta>0?'+':''}{a.delta?.toFixed(1)}
                        </td>
                        <td style={{fontSize:'0.9rem',color:'var(--text-secondary)',maxWidth:300}}>{a.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }

          {/* Compliance labels */}
          <div style={{marginTop:24,padding:'20px 24px',background:'var(--bg-primary)',
                        borderRadius:'var(--radius-md)',border:'1px solid var(--border)'}}>
            <div style={{fontWeight:600,marginBottom:12, display: 'flex', alignItems: 'center', gap: 8}}>
              <Lock size={18} color="var(--accent-blue)" /> Compliance Labels Active
            </div>
            <div style={{display:'flex',gap:12, flexWrap: 'wrap'}}>
              {['HIPAA','GDPR','GCP','ICH E6','21 CFR Part 11'].map(l=>(
                <span key={l} className="badge badge-valid"><Lock size={12} /> {l}</span>
              ))}
            </div>
            <div style={{marginTop:12,fontSize:'0.85rem',color:'var(--text-muted)'}}>
              All audit trails are privacy-preserving — no raw PII is exposed.
              Only hashed identifiers and IPFS CIDs are stored on-chain.
            </div>
          </div>
        </div>
      )}

      {/* Performance */}
      {tab==='perf' && (
        <div>
          <div className="card" style={{marginBottom:24}}>
            <div className="card-title" style={{marginBottom:20}}>
              <TrendingUp size={18} /> TPS &amp; Latency Trend
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={tpsTrend} margin={{top:5,right:20,bottom:5,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="t" tick={{fill:'var(--text-secondary)',fontSize:12}} />
                <YAxis yAxisId="tps"     orientation="left"  tick={{fill:'var(--text-secondary)',fontSize:12}} domain={[0,15]} />
                <YAxis yAxisId="latency" orientation="right" tick={{fill:'var(--text-secondary)',fontSize:12}} />
                <Tooltip contentStyle={{background:'white',border:'1px solid var(--border)', borderRadius: 'var(--radius-sm)'}} />
                <Legend />
                <Area yAxisId="tps"     type="monotone" dataKey="tps"     stroke="#0284C7" fill="rgba(2,132,199,0.1)" name="TPS" />
                <Area yAxisId="latency" type="monotone" dataKey="latency" stroke="#D97706" fill="rgba(217,119,6,0.1)" name="Latency (ms)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {metrics && (
            <div className="card">
              <div className="card-title" style={{marginBottom:20}}>
                <Zap size={18} /> API Metrics (Last 100 Requests)
              </div>
              <div className="grid-3">
                {[
                  ['Total Requests', metrics.total_requests],
                  ['Avg Latency', `${metrics.last_100_avg_ms} ms`],
                  ['Max Latency', `${metrics.last_100_max_ms} ms`],
                ].map(([k,v])=>(
                  <div key={k} style={{background:'var(--bg-primary)',borderRadius:'var(--radius-md)',
                                        padding:'20px 24px',border:'1px solid var(--border)'}}>
                    <div style={{fontSize:'0.85rem',color:'var(--text-muted)', fontWeight: 600}}>{k}</div>
                    <div style={{fontSize:'1.6rem',fontWeight:700,marginTop:6, color: 'var(--text-primary)'}}>{v}</div>
                  </div>
                ))}
              </div>
              {metrics.recent && (
                <div style={{marginTop:24}}>
                  <div style={{fontSize:'0.9rem',color:'var(--text-primary)', fontWeight: 600, marginBottom:10}}>Recent requests:</div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    {metrics.recent.slice(-5).reverse().map((r,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                                            padding:'10px 16px',borderBottom: i < 4 ? '1px solid var(--border)' : 'none',fontSize:'0.85rem'}}>
                        <span className="mono" style={{fontWeight: 500}}>{r.path}</span>
                        <span style={{color: r.ms<500 ? 'var(--accent-green)' : r.ms<2000 ? 'var(--accent-amber)' : 'var(--accent-red)',
                                      fontWeight:700}}>{r.ms} ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Node trust scores */}
      {tab==='nodes' && (
        <div className="card">
          <div className="card-title" style={{marginBottom:24}}>
            <Server size={18} /> Node Trust Scores (Live)
          </div>
          {Object.entries(nodeReps).map(([id,score])=>(
            <div key={id} style={{display:'flex',alignItems:'center',gap:20,marginBottom:16}}>
              <div style={{width:80,fontWeight:700,fontSize:'0.95rem'}}>{id}</div>
              <div style={{flex:1}}>
                <div className="progress-bar">
                  <div className="progress-fill" style={{
                    width:`${score}%`,
                    background: score>=90 ? 'var(--accent-green)' : score>=70 ? 'var(--accent-blue)' : 'var(--accent-red)'
                  }} />
                </div>
              </div>
              <div style={{
                fontWeight:700, fontSize:'1rem', minWidth:50, textAlign:'right',
                color: score>=90 ? 'var(--accent-green)' : score>=70 ? 'var(--accent-blue)' : 'var(--accent-red)'
              }}>
                {score}
              </div>
              <span className={`badge ${score>=90?'badge-valid':score>=70?'badge-blue':'badge-tampered'}`}>
                {score>=90?'High Trust':score>=70?'Trusted':'Low Trust'}
              </span>
            </div>
          ))}
          <div className="alert alert-info" style={{marginTop:24}}>
            <Info size={18} /> Trust scores are automatically updated by the AI Governance Engine based on validation accuracy and error rates.
          </div>
        </div>
      )}
    </div>
  );
}
