import React, { useState, useEffect } from 'react';
import { getPending, getChain, getBlock, verifyChain, mineBlock } from '../api';
import { 
  Blocks, Search, Pickaxe, Clock, CheckCircle2, 
  XCircle, AlertTriangle, Check 
} from 'lucide-react';

const StatusBadge = ({ status }) => {
  const map = {
    PENDING:   'badge-pending', CONFIRMED: 'badge-valid',
    REJECTED:  'badge-tampered', VALID: 'badge-valid', MANIPULATED: 'badge-tampered'
  };
  return <span className={`badge ${map[status]||'badge-blue'}`}>{status}</span>;
};

export default function TxExplorer() {
  const [tab,    setTab]    = useState('pending');
  const [pending, setPending] = useState([]);
  const [chain,  setChain]  = useState([]);
  const [selBlock, setSelBlock] = useState(null);
  const [blockDetail, setBlockDetail] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [mining, setMining] = useState(false);
  const [mineResult, setMineResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const [p, c] = await Promise.allSettled([getPending(), getChain()]);
    if (p.status==='fulfilled') setPending(p.value.data.pending||[]);
    if (c.status==='fulfilled') setChain(c.value.data.chain||[]);
  };

  useEffect(() => { load(); const id=setInterval(load,5000); return()=>clearInterval(id); }, []);

  const handleViewBlock = async (idx) => {
    setSelBlock(idx);
    try {
      const r = await getBlock(idx);
      setBlockDetail(r.data);
    } catch {}
  };

  const handleVerify = async () => {
    setLoading(true);
    const r = await verifyChain();
    setVerifyResult(r.data);
    setLoading(false);
  };

  const handleMine = async () => {
    setMining(true);
    try {
      const r = await mineBlock('NODE-01');
      setMineResult(r.data);
      await load();
    } catch(e) {
      setMineResult({ error: e.response?.data?.detail || e.message });
    }
    setMining(false);
  };

  return (
    <div className="page-content fade-in">
      <div style={{ marginBottom:32, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Blocks size={28} color="var(--accent-blue)" /> Transaction &amp; Block Explorer
          </h2>
          <p style={{ marginTop: 8 }}>View pending transactions, confirmed blocks, and chain integrity</p>
        </div>
        <div style={{ display:'flex', gap:12 }}>
          <button className="btn btn-secondary" onClick={handleVerify} disabled={loading}>
            <Search size={18} /> Verify Chain
          </button>
          <button className="btn btn-primary" onClick={handleMine} disabled={mining}>
            {mining ? '⏳ Mining…' : <><Pickaxe size={18} /> Mine Block</>}
          </button>
        </div>
      </div>

      {verifyResult && (
        <div className={`alert ${verifyResult.valid ? 'alert-success' : 'alert-error'}`} style={{marginBottom:24}}>
          {verifyResult.valid
            ? <><CheckCircle2 size={18} /> Chain is VALID — {verifyResult.chain_length} blocks, no tampering detected</>
            : <><XCircle size={18} /> Chain INVALID — {verifyResult.errors?.length} error(s) found</>}
        </div>
      )}

      {mineResult && (
        <div className={`alert ${mineResult.error ? 'alert-error' : 'alert-success'}`} style={{marginBottom:24}}>
          {mineResult.error
            ? <><AlertTriangle size={18} /> {mineResult.error}</>
            : <><CheckCircle2 size={18} /> Block #{mineResult.block_index} mined with {mineResult.tx_count} transactions</>}
        </div>
      )}

      <div className="tabs">
        {[
          ['pending',<><Clock size={16} style={{marginRight:6, display:'inline'}}/> Pending</>], 
          ['chain',<><Blocks size={16} style={{marginRight:6, display:'inline'}}/> Blockchain</>]
        ].map(([k,l]) => (
          <div key={k} className={`tab ${tab===k?'active':''}`} onClick={()=>setTab(k)} style={{ display: 'flex', alignItems: 'center' }}>{l}</div>
        ))}
      </div>

      {tab === 'pending' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Clock size={18} /> Pending Transactions ({pending.length})</div>
          </div>
          {pending.length === 0
            ? <p style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No pending transactions</p>
            : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr><th>TX ID</th><th>Trial ID</th><th>Node</th><th>Data Hash</th><th>Status</th><th>Time</th></tr>
                  </thead>
                  <tbody>
                    {pending.map(tx => (
                      <tr key={tx.tx_id}>
                        <td className="mono" style={{fontWeight:600}}>{tx.tx_id.slice(0,12)}…</td>
                        <td style={{fontWeight:500}}>{tx.trial_id}</td>
                        <td><span className="badge badge-blue">{tx.node_id}</span></td>
                        <td className="mono">{tx.data_hash.slice(0,16)}…</td>
                        <td><StatusBadge status={tx.status} /></td>
                        <td style={{fontSize:'0.85rem',color:'var(--text-muted)'}}>
                          {new Date(tx.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {tab === 'chain' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div className="card-title"><Blocks size={18} /> Chain ({chain.length} blocks)</div>
            </div>
            <div className="block-chain">
              {chain.map((b, i) => (
                <React.Fragment key={b.index}>
                  {i > 0 && <div className="block-connector" />}
                  <div className={`block-item ${selBlock===b.index?'':''}` }
                       onClick={() => handleViewBlock(b.index)}
                       style={{ border: selBlock===b.index ? '1px solid var(--accent-blue)' : undefined, background: selBlock===b.index ? '#F0F9FF' : 'white' }}>
                    <div className="block-index">{b.index}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:'0.9rem', color: 'var(--text-primary)'}}>Block #{b.index}</div>
                      <div className="hash-display" style={{ marginTop: 4 }}>{b.block_hash}</div>
                      <div style={{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:6, fontWeight: 500}}>
                        {b.tx_count} TX · {b.validator_id}
                      </div>
                    </div>
                    <span className="badge badge-valid"><Check size={14} /></span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="card" style={{ position: 'sticky', top: 96, height: 'max-content' }}>
            <div className="card-title" style={{marginBottom:20}}>
              <Search size={18} /> Block Detail
            </div>
            {blockDetail
              ? (
                <div style={{fontSize:'0.9rem'}}>
                  {[
                    ['Index',       blockDetail.index],
                    ['Hash',        blockDetail.block_hash],
                    ['Prev Hash',   blockDetail.previous_hash],
                    ['Merkle Root', blockDetail.merkle_root],
                    ['Validator',   blockDetail.validator_id],
                    ['TX Count',    blockDetail.transactions?.length ?? 0],
                  ].map(([k,v]) => (
                    <div key={k} style={{marginBottom:14}}>
                      <div style={{fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:4, fontWeight: 600}}>{k}</div>
                      <div className="hash-display">{String(v)}</div>
                    </div>
                  ))}
                  {blockDetail.transactions?.slice(0,3).map((tx,i) => (
                    <div key={i} style={{background:'var(--bg-primary)',borderRadius:'var(--radius-sm)',
                                         padding:'12px 16px',marginBottom:8, border:'1px solid var(--border)'}}>
                      <div style={{fontSize:'0.8rem',color:'var(--text-muted)', fontWeight: 600, marginBottom: 4}}>TX {i+1}</div>
                      <div className="mono">{tx.tx_id?.slice(0,30)}…</div>
                    </div>
                  ))}
                </div>
              )
              : <p style={{color:'var(--text-muted)', padding: 20, textAlign: 'center'}}>Select a block to view details</p>
            }
          </div>
        </div>
      )}
    </div>
  );
}
