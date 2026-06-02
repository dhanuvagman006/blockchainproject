import React, { useState, useEffect } from 'react';
import { mlSummary, mlPredict } from '../api';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';
import { 
  BrainCircuit, AlertTriangle, Zap, Sparkles, CheckCircle2, 
  BarChart3, Hexagon, Users, Timer, Lock, Trophy, TrendingUp 
} from 'lucide-react';

const COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#06b6d4','#ef4444','#6366f1','#ec4899'];

const MetricBar = ({ val, max=100, color='var(--accent-blue)' }) => (
  <div style={{display:'flex',alignItems:'center',gap:8}}>
    <div style={{flex:1,height:6,borderRadius:3,background:'var(--border)'}}>
      <div style={{height:'100%',borderRadius:3,background:color,width:`${(val/max)*100}%`,transition:'width 0.5s'}} />
    </div>
    <span style={{fontSize:'0.75rem',fontWeight:600,minWidth:40,textAlign:'right'}}>{val}%</span>
  </div>
);

export default function MLPanel() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [predForm, setPredForm] = useState({ age_group_enc:2, dosage_level_mg:250,
    response_time_days:90, phase_enc:1, adverse_event_flag:0 });
  const [predResult, setPredResult] = useState(null);
  const [predLoading, setPredLoading] = useState(false);
  const [tab, setTab] = useState('comparison');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try { setSummary((await mlSummary()).data); } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handlePredict = async () => {
    setPredLoading(true);
    try {
      const r = await mlPredict({
        age_group_enc:      parseInt(predForm.age_group_enc),
        dosage_level_mg:    parseFloat(predForm.dosage_level_mg),
        response_time_days: parseInt(predForm.response_time_days),
        phase_enc:          parseInt(predForm.phase_enc),
        adverse_event_flag: parseInt(predForm.adverse_event_flag),
      });
      setPredResult(r.data);
    } catch(e) { setPredResult({ result:'Error — run ml/train_models.py first', confidence:0 }); }
    setPredLoading(false);
  };

  const models = summary?.models || [];
  const sorted = [...models].sort((a,b)=>b.f1-a.f1);
  const gateModel = models.find(m => m.is_gate_model);
  const bestByF1  = sorted[0];

  const radarData = sorted.slice(0,4).map(m => ({
    subject: m.name.split(' ')[0],
    Accuracy: m.accuracy, F1: m.f1,
    Precision: m.precision, Recall: m.recall
  }));

  const barData = sorted.map(m => ({
    name: m.name.split(' ')[0],
    Accuracy: m.accuracy, F1: m.f1, AUC: (m.auc_roc*100).toFixed(1)
  }));

  const ageGroups = ['<18','18-35','36-50','51-65','65+'];

  return (
    <div className="page-content fade-in">
      <div style={{marginBottom:32}}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BrainCircuit size={28} color="var(--accent-blue)" /> ML Verification Panel
        </h2>
        <p style={{ marginTop: 8 }}>All 8 models trained on clinical trials data for fraud/tamper detection</p>
      </div>

      {loading && <div className="spinner" />}

      {!loading && !summary && (
        <div className="alert alert-warning" style={{marginBottom: 24}}>
          <AlertTriangle size={18} /> ML models not trained yet. Run: <code>cd ml && python train_models.py</code>
        </div>
      )}

      {/* Live Prediction */}
      <div className="card" style={{marginBottom:32}}>
        <div className="card-title" style={{marginBottom:20}}>
          <Zap size={18} /> Live XGBoost Prediction (Pre-Chain Gate)
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:16,marginBottom:20}}>
          {[
            ['Age Enc (0-4)','age_group_enc'],
            ['Dosage (mg)', 'dosage_level_mg'],
            ['Response Days','response_time_days'],
            ['Phase Enc (0-3)','phase_enc'],
            ['Adverse Flag','adverse_event_flag'],
          ].map(([label,key]) => (
            <div key={key} className="form-group" style={{marginBottom:0}}>
              <label className="form-label">{label}</label>
              <input className="form-input" type="number" value={predForm[key]}
                onChange={e=>setPredForm(p=>({...p,[key]:e.target.value}))} />
            </div>
          ))}
        </div>
        <button className="btn btn-primary" onClick={handlePredict} disabled={predLoading}>
          {predLoading ? '⏳ Predicting…' : <><Sparkles size={16} /> Classify Transaction</>}
        </button>
        {predResult && (
          <div className={`alert ${predResult.result==='VALID'?'alert-success':'alert-error'}`} style={{marginTop:20}}>
            <div>
              <strong style={{fontSize:'1.1rem', display: 'flex', alignItems: 'center', gap: 8}}>
                {predResult.result==='VALID' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />} {predResult.result}
              </strong>
              <div style={{marginTop:8}}>
                Fraud probability: <strong>{(predResult.confidence*100).toFixed(2)}%</strong>
              </div>
              <div style={{marginTop:6,fontSize:'0.85rem',color:'var(--text-muted)'}}>
                Model: XGBoost · Features: age, dosage, response time, phase, adverse event
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="tabs">
        {[
          ['comparison',<><BarChart3 size={16} style={{marginRight: 6, display: 'inline-block'}}/> Comparison</>],
          ['radar',<><Hexagon size={16} style={{marginRight: 6, display: 'inline-block'}}/> Radar</>],
          ['age',<><Users size={16} style={{marginRight: 6, display: 'inline-block'}}/> Age Groups</>],
          ['timing',<><Timer size={16} style={{marginRight: 6, display: 'inline-block'}}/> Timing</>]
        ].map(([k,l])=>(
          <div key={k} className={`tab ${tab===k?'active':''}`} onClick={()=>setTab(k)} style={{ display: 'flex', alignItems: 'center' }}>{l}</div>
        ))}
      </div>

      {/* Model Comparison Table */}
      {tab==='comparison' && (
        <div className="card">
          <div className="card-title" style={{marginBottom:20}}>
            <BarChart3 size={18} /> All 8 Models — Performance Comparison
          </div>

          {/* Gate model callout */}
          {gateModel && (
            <div style={{
              display:'flex', alignItems:'center', gap:16, marginBottom:24,
              background:'#FFFBEB', border:'1px solid #FDE68A',
              borderRadius:'var(--radius-md)', padding:'16px 20px',
            }}>
              <div style={{
                width:48, height:48, borderRadius:'var(--radius-md)', flexShrink:0,
                background:'#FEF3C7', color: '#B45309',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}><Zap size={24} /></div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700, color:'#92400E', fontSize:'1.05rem'}}>
                  XGBoost — Active Pre-Chain Fraud Gate
                </div>
                <div style={{fontSize:'0.85rem', color:'#92400E', marginTop:4}}>
                  Every transaction submitted to the blockchain is screened through XGBoost in real time.
                  Acc&nbsp;<strong style={{color:'#B45309'}}>{gateModel.accuracy}%</strong>&nbsp;·
                  F1&nbsp;<strong style={{color:'#B45309'}}>{gateModel.f1}%</strong>&nbsp;·
                  AUC&nbsp;<strong style={{color:'#B45309'}}>{gateModel.auc_roc}</strong>&nbsp;·
                  Predict&nbsp;<strong style={{color:'#B45309'}}>{gateModel.predict_time_s}s</strong>
                </div>
              </div>
              <span style={{
                background:'#FEF3C7', color:'#92400E',
                border:'1px solid #FCD34D',
                borderRadius:20, padding:'6px 16px', fontWeight:700, fontSize:'0.85rem', whiteSpace:'nowrap',
                display: 'flex', alignItems: 'center', gap: 6
              }}><Lock size={14} /> ACTIVE GATE</span>
            </div>
          )}

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Model</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th><th>AUC-ROC</th><th>Train</th><th>Predict</th></tr>
              </thead>
              <tbody>
                {sorted.map((m,i)=>{
                  const isGate = m.is_gate_model;
                  const isBest = m.name === bestByF1?.name;
                  return (
                    <tr key={m.name} style={{
                      background: isGate
                        ? '#FFFBEB'
                        : isBest ? '#EFF6FF' : undefined,
                      borderTop: isGate ? '1px solid #FDE68A' : isBest ? '1px solid #BFDBFE' : undefined,
                      borderBottom: isGate ? '1px solid #FDE68A' : isBest ? '1px solid #BFDBFE' : undefined,
                    }}>
                      <td style={{fontWeight:700,color:COLORS[i]}}>#{i+1}</td>
                      <td style={{fontWeight:600}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          {m.name}
                          {isGate && (
                            <span style={{
                              background:'#FEF3C7', color:'#92400E',
                              border:'1px solid #FDE68A',
                              borderRadius:20, padding:'2px 10px', fontSize:'0.7rem', fontWeight:700,
                              display: 'flex', alignItems: 'center', gap: 4
                            }}><Zap size={10} /> ACTIVE GATE</span>
                          )}
                          {isBest && !isGate && (
                            <span style={{
                              background:'#DBEAFE', color:'#1E40AF',
                              border:'1px solid #BFDBFE',
                              borderRadius:20, padding:'2px 10px', fontSize:'0.7rem', fontWeight:700,
                              display: 'flex', alignItems: 'center', gap: 4
                            }}><Trophy size={10} /> Best F1</span>
                          )}
                          {isBest && isGate && <Trophy size={14} color="#B45309" />}
                        </div>
                      </td>
                      <td><MetricBar val={m.accuracy} color={isGate ? '#B45309' : COLORS[i]} /></td>
                      <td>{m.precision}%</td>
                      <td>{m.recall}%</td>
                      <td style={{fontWeight:700,color: isGate ? '#B45309' : COLORS[i]}}>{m.f1}%</td>
                      <td>{m.auc_roc}</td>
                      <td style={{fontSize:'0.85rem',color:'var(--text-muted)'}}>{m.train_time_s}s</td>
                      <td style={{fontSize:'0.85rem',color: isGate ? '#B45309' : 'var(--text-muted)'}}>
                        {m.predict_time_s}s{isGate && <Zap size={12} style={{display: 'inline', marginLeft: 4}}/>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bar chart */}
      {tab==='comparison' && barData.length>0 && (
        <div className="card" style={{marginTop:24}}>
          <div className="card-title" style={{marginBottom:20}}>
            <TrendingUp size={18} /> Accuracy / F1 / AUC Comparison
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={barData} margin={{top:5,right:20,bottom:5,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="name" tick={{fill:'var(--text-secondary)',fontSize:12}} />
              <YAxis domain={[0,100]} tick={{fill:'var(--text-secondary)',fontSize:12}} />
              <Tooltip contentStyle={{background:'white',border:'1px solid var(--border)', borderRadius: 'var(--radius-sm)'}} />
              <Legend />
              <Bar dataKey="Accuracy" fill="#0284C7" radius={[4,4,0,0]} />
              <Bar dataKey="F1"       fill="#7C3AED" radius={[4,4,0,0]} />
              <Bar dataKey="AUC"      fill="#059669" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Radar */}
      {tab==='radar' && radarData.length>0 && (
        <div className="card">
          <div className="card-title" style={{marginBottom:20}}>
            <Hexagon size={18} /> Top 4 Models — Radar Comparison
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="subject" tick={{fill:'var(--text-secondary)',fontSize:12, fontWeight: 600}} />
              <Radar name="Accuracy"  dataKey="Accuracy"  stroke="#0284C7" fill="#0284C7" fillOpacity={0.2} />
              <Radar name="F1"        dataKey="F1"        stroke="#7C3AED" fill="#7C3AED" fillOpacity={0.2} />
              <Radar name="Precision" dataKey="Precision" stroke="#059669" fill="#059669" fillOpacity={0.1} />
              <Legend />
              <Tooltip contentStyle={{background:'white',border:'1px solid var(--border)', borderRadius: 'var(--radius-sm)'}} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Age groups */}
      {tab==='age' && (
        <div className="card">
          <div className="card-title" style={{marginBottom:20}}>
            <Users size={18} /> Accuracy by Age Group
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Model</th>{ageGroups.map(a=><th key={a}>{a}</th>)}</tr>
              </thead>
              <tbody>
                {sorted.map(m=>(
                  <tr key={m.name}>
                    <td style={{fontWeight:600}}>{m.name}</td>
                    {ageGroups.map(ag=>{
                      const bd = summary?.age_breakdowns?.[m.name];
                      const v  = bd?.[ag];
                      return (
                        <td key={ag} style={{
                          background: v!=null ? `rgba(2,132,199,${(v-70)/120})` : undefined,
                          fontWeight: 600
                        }}>
                          {v!=null ? `${v}%` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Timing */}
      {tab==='timing' && (
        <div className="card">
          <div className="card-title" style={{marginBottom:20}}>
            <Timer size={18} /> Training vs Prediction Time
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Model</th><th>Train Time</th><th>Predict Time</th><th>Ratio</th></tr></thead>
              <tbody>
                {sorted.map(m=>(
                  <tr key={m.name}>
                    <td style={{fontWeight:600}}>{m.name}</td>
                    <td>{m.train_time_s}s
                      <div style={{width:80,height:4,borderRadius:2,background:'var(--border)',marginTop:6}}>
                        <div style={{height:'100%',borderRadius:2,background:'var(--accent-amber)',
                          width:`${Math.min(m.train_time_s/60*100,100)}%`}} />
                      </div>
                    </td>
                    <td>{m.predict_time_s}s</td>
                    <td style={{color:'var(--text-muted)', fontWeight: 500}}>
                      {m.train_time_s > 0 ? `${(m.train_time_s/m.predict_time_s).toFixed(0)}×` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
