import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadDataset, hashRecord, avalancheDemo, verifyHash, mlPredict, ipfsUpload, submitTx } from '../api';
import PharmaBalanceReport from '../components/PharmaBalanceReport';
import { 
  Check, FlaskConical, ClipboardList, FileText, FileUp, Search, 
  AlertTriangle, XCircle, Dna, Lock, Waves, BrainCircuit, 
  Send, CheckCircle2, PartyPopper, CloudUpload
} from 'lucide-react';

// ── Step indicator ─────────────────────────────────────────
const Step = ({ n, label, done, active }) => (
  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
    <div style={{
      width:32, height:32, borderRadius:'50%',
      background: done ? '#D1FAE5' : active ? '#E0F2FE' : 'var(--bg-secondary)',
      border: `2px solid ${done ? 'var(--accent-green)' : active ? 'var(--accent-blue)' : 'var(--border)'}`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:'0.85rem', fontWeight:700, flexShrink:0,
      color: done ? 'var(--accent-green)' : active ? 'var(--accent-blue)' : 'var(--text-muted)'
    }}>
      {done ? <Check size={16} strokeWidth={3} /> : n}
    </div>
    <span style={{ fontSize:'0.9rem', fontWeight: active||done ? 600 : 500, color: active||done ? 'var(--text-primary)' : 'var(--text-muted)' }}>
      {label}
    </span>
  </div>
);

export default function InventorPortal() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [fraudReport,  setFraudReport]  = useState(null);
  const [balanceReport,setBalanceReport]= useState(null);  // pharma age-balance
  const [hashResult,   setHashResult]   = useState(null);
  const [avalanche,    setAvalanche]    = useState(null);
  const [mlResult,     setMlResult]     = useState(null);
  const [ipfsResult,   setIpfsResult]   = useState(null);
  const [txResult,     setTxResult]     = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [balanceTab,   setBalanceTab]   = useState('balance'); // 'balance' | 'screening'

  const [form, setForm] = useState({
    trial_id: 'NCT03000001', patient_id: 'PAT-010001',
    age_group: '36-50', drug_name: 'Metformin',
    dosage_level_mg: 250, phase: 'II',
    response_time_days: 90, adverse_event: 'Mild',
    adverse_event_flag: 1, consent_hash: 'auto',
    timestamp: new Date().toISOString().replace('ms','Z'),
    node_id: 'NODE-01', manipulated: 0
  });

  const err = (msg) => { setError(msg); setLoading(false); };

  // ── Step 1: CSV Upload ──────────────────────────────────
  const onDrop = useCallback(files => setFile(files[0]), []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'text/csv': ['.csv'] } });

  const handleUpload = async () => {
    if (!file) return err('Please select a CSV file');
    setLoading(true); setError(''); setFraudReport(null); setUploadResult(null); setBalanceReport(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await uploadDataset(fd);
      setUploadResult(r.data);
      setBalanceReport(r.data.balance_report || null);
      setStep(2);
    } catch(e) {
      const detail = e.response?.data;
      if (detail?.error === 'DATASET_FRAUD_DETECTED') {
        setFraudReport(detail);
        setBalanceReport(detail.balance_report || null);
      } else {
        err(detail?.detail || detail?.message || e.message);
      }
    }
    setLoading(false);
  };

  // ── Step 2: Hash ────────────────────────────────────────
  const handleHash = async () => {
    setLoading(true); setError('');
    try {
      const rec = { ...form, consent_hash: form.consent_hash === 'auto'
        ? 'SHA256:' + Math.random().toString(36).slice(2) : form.consent_hash };
      const r = await hashRecord(rec);
      setHashResult(r.data);

      const av = await avalancheDemo(
        `${form.drug_name}:${form.dosage_level_mg}mg`,
        `${form.drug_name}:${parseFloat(form.dosage_level_mg)+1}mg`
      );
      setAvalanche(av.data);
      setStep(3);
    } catch(e) { err(e.response?.data?.detail || e.message); }
    setLoading(false);
  };

  // ── Step 3: ML Gate ─────────────────────────────────────
  const ageEnc  = {'<18':0,'18-35':1,'36-50':2,'51-65':3,'65+':4};
  const phEnc   = {I:0,II:1,III:2,IV:3};

  const handleML = async () => {
    setLoading(true); setError('');
    try {
      const r = await mlPredict({
        age_group_enc:      ageEnc[form.age_group] ?? 2,
        dosage_level_mg:    parseFloat(form.dosage_level_mg),
        response_time_days: parseInt(form.response_time_days),
        phase_enc:          phEnc[form.phase] ?? 1,
        adverse_event_flag: parseInt(form.adverse_event_flag),
      });
      setMlResult(r.data);
      // Hard-block: MANIPULATED records must NOT proceed to IPFS or blockchain
      if (r.data.result === 'MANIPULATED') {
        setLoading(false);
        return; // stay on step 3 — user sees rejection banner
      }
      setStep(4);
    } catch(e) {
      // Models not trained — warn but allow through (no gate active)
      setMlResult({ result:'N/A (models not trained — gate inactive)', confidence:0 });
      setStep(4);
    }
    setLoading(false);
  };

  // ── Step 4: IPFS Upload ─────────────────────────────────
  const handleIPFS = async () => {
    setLoading(true); setError('');
    try {
      const r = await ipfsUpload(form.trial_id, form.node_id, form);
      setIpfsResult(r.data);
      setStep(5);
    } catch(e) { err(e.response?.data?.detail || e.message); }
    setLoading(false);
  };

  // ── Step 5: Submit TX ───────────────────────────────────
  const handleSubmit = async () => {
    if (!hashResult?.data_hash) return err('Hash not computed yet');
    setLoading(true); setError('');
    try {
      const r = await submitTx({
        trial_id: form.trial_id,
        node_id:  form.node_id,
        data_hash: hashResult.data_hash,
        ipfs_cid:  ipfsResult?.ipfs?.cid || '',
        metadata: {
            phase:              form.phase,
            drug:               form.drug_name,
            age_group:          form.age_group,
            dosage_level_mg:    parseFloat(form.dosage_level_mg),
            response_time_days: parseInt(form.response_time_days),
            adverse_event:      form.adverse_event,
            adverse_event_flag: parseInt(form.adverse_event_flag),
          },
      });
      setTxResult(r.data);
      setStep(6);
    } catch(e) { err(e.response?.data?.detail || e.message); }
    setLoading(false);
  };

  return (
    <div className="page-content fade-in">
      <div style={{ marginBottom:36 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FlaskConical size={28} color="var(--accent-blue)" /> Drug Inventor Portal
        </h2>
        <p style={{ marginTop: 8 }}>Submit clinical trial data securely to the blockchain — Steps 1–5</p>
      </div>

      {error && <div className="alert alert-error" style={{marginBottom:24}}><AlertTriangle size={18}/> {error}</div>}

      <div className="grid-2">
        {/* Progress steps */}
        <div className="card">
          <div className="card-title" style={{marginBottom:24}}>
            <ClipboardList size={18} /> Submission Pipeline
          </div>
          <Step n={1} label="Upload Clinical Trial CSV"   done={step>1} active={step===1} />
          <Step n={2} label="SHA-256 Hash + Avalanche Demo" done={step>2} active={step===2} />
          <Step n={3} label="ML Fraud Gate (XGBoost)"    done={step>3} active={step===3} />
          <Step n={4} label="Upload to IPFS (off-chain)" done={step>4} active={step===4} />
          <Step n={5} label="Submit Transaction to Mempool" done={step>5} active={step===5} />
        </div>

        {/* Form */}
        <div className="card">
          <div className="card-title" style={{marginBottom:20}}>
            <FileText size={18} /> Trial Data
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              ['Trial ID','trial_id','text'],
              ['Patient ID','patient_id','text'],
              ['Drug Name','drug_name','text'],
              ['Dosage (mg)','dosage_level_mg','number'],
              ['Response Days','response_time_days','number'],
            ].map(([label,key,type]) => (
              <div className="form-group" key={key} style={{marginBottom:10}}>
                <label className="form-label">{label}</label>
                <input className="form-input" type={type} value={form[key]}
                  onChange={e => setForm(p=>({...p,[key]:e.target.value}))} />
              </div>
            ))}
            {[
              ['Age Group','age_group',['<18','18-35','36-50','51-65','65+']],
              ['Phase','phase',['I','II','III','IV']],
              ['Adverse Event','adverse_event',['None','Mild','Moderate','Severe','Life-threatening']],
            ].map(([label,key,opts]) => (
              <div className="form-group" key={key} style={{marginBottom:10}}>
                <label className="form-label">{label}</label>
                <select className="form-select" value={form[key]}
                  onChange={e => setForm(p=>({...p,[key]:e.target.value}))}>
                  {opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="card" style={{marginTop:24}}>
          <div className="card-title" style={{marginBottom:20}}>
            <FileUp size={18} /> Step 1: CSV Upload &amp; ML Screening
          </div>
          <div {...getRootProps()} className={`dropzone ${isDragActive?'active':''}`}>
            <input {...getInputProps()} />
            <div className="dropzone-icon"><FileUp size={48} /></div>
            <p><strong>Drop clinical_trials.csv here</strong> or click to browse</p>
            <p style={{fontSize:'0.85rem',marginTop:8}}>Every row is screened by the XGBoost fraud gate before ingestion</p>
          </div>
          {file && <div className="alert alert-info" style={{marginTop:16}}>
            <FileText size={16} /> {file.name} ({(file.size/1024).toFixed(1)} KB)
          </div>}
          <button className="btn btn-primary" style={{marginTop:20}} onClick={handleUpload} disabled={loading||!file}>
            {loading ? '⏳ Screening all rows…' : <><Search size={18} /> Validate, Screen & Hash</>}
          </button>

          {/* ── Fraud Report (dataset rejected) ── */}
          {fraudReport && (
            <div style={{marginTop:24}}>
              <div className="alert alert-error">
                <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{fontWeight:700,fontSize:'1.05rem',marginBottom:8}}>
                    Dataset BLOCKED — ML Fraud Gate Triggered
                  </div>
                  <div style={{fontSize:'0.9rem'}}>
                    <strong>{fraudReport.screening?.flagged_rows}</strong> of{' '}
                    <strong>{fraudReport.screening?.total_rows}</strong> records failed fraud screening.
                    Fix or remove the flagged rows before uploading.
                  </div>
                </div>
              </div>

              {/* Flagged rows table */}
              <div style={{marginTop:20}}>
                <div style={{fontWeight:600,marginBottom:12,color:'var(--accent-red)', display: 'flex', alignItems: 'center', gap: 8}}>
                  <AlertTriangle size={16} /> Flagged Records ({fraudReport.screening?.flagged_details?.length})
                </div>
                <div className="table-container" style={{maxHeight:360,overflowY:'auto'}}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Row</th><th>Trial ID</th><th>Age Group</th>
                        <th>Phase</th><th>Dosage (mg)</th><th>Resp. Days</th>
                        <th>Adverse Event</th><th>Fraud %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fraudReport.screening?.flagged_details?.map((r,i) => (
                        <tr key={i} style={{background:'#FEF2F2'}}>
                          <td style={{color:'var(--accent-red)',fontWeight:600}}>#{r.row_index}</td>
                          <td className="mono" style={{fontSize:'0.8rem'}}>{r.trial_id}</td>
                          <td><span className="badge badge-tampered">{r.age_group}</span></td>
                          <td>{r.phase}</td>
                          <td style={{color:'var(--accent-amber)', fontWeight: 600}}>{r.dosage}</td>
                          <td>{r.response_days}</td>
                          <td><span className="badge badge-tampered">{r.adverse_event}</span></td>
                          <td>
                            <span style={{
                              fontWeight:700,
                              color: r.confidence > 0.7 ? 'var(--accent-red)' : 'var(--accent-amber)'
                            }}>
                              {(r.confidence*100).toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{marginTop:12,fontSize:'0.85rem',color:'var(--text-muted)'}}>
                  Threshold: {((fraudReport.screening?.flagged_details?.[0]?.threshold ?? 0.35)*100).toFixed(0)}% fraud probability triggers rejection
                </div>
              </div>

              {/* Pharma age-balance report for rejected dataset */}
              {balanceReport && (
                <div style={{marginTop:24}}>
                  <div style={{fontWeight:600, fontSize:'1rem', marginBottom:16,
                    color: balanceReport.drugs_with_flags > 0 ? 'var(--accent-amber)' : 'var(--accent-green)',
                    display:'flex', alignItems:'center', gap:10}}>
                    <Dna size={18} /> Pharma Age-Group Balance Report
                    {balanceReport.drugs_with_flags > 0 && (
                      <span style={{
                        background:'#FFFBEB', color:'#92400E',
                        border:'1px solid #FDE68A',
                        borderRadius:20, padding:'4px 12px', fontSize:'0.8rem', fontWeight:600,
                        display: 'flex', alignItems: 'center', gap: 6
                      }}>
                        <AlertTriangle size={14} /> {balanceReport.drugs_with_flags} drug(s) with age bias
                      </span>
                    )}
                  </div>
                  <PharmaBalanceReport report={balanceReport} compact />
                </div>
              )}
            </div>
          )}

          {/* ── Success ── */}
          {uploadResult && (
            <div style={{marginTop:20}}>
              <div className="alert alert-success" style={{ fontWeight: 500 }}>
                <CheckCircle2 size={18} /> {uploadResult.total_rows} records loaded · all rows passed ML screening
              </div>
              {balanceReport && (
                <div className="card" style={{marginTop:20}}>
                  <div className="card-header">
                    <div className="card-title"><Dna size={18} /> Pharma Age-Group Balance Report</div>
                    <span style={{fontSize:'0.85rem',color:'var(--text-muted)'}}>
                      Are age proportions consistent across phases per drug?
                    </span>
                  </div>
                  <PharmaBalanceReport report={balanceReport} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="card" style={{marginTop:24}}>
          <div className="card-title" style={{marginBottom:20}}>
            <Lock size={18} /> Step 2: SHA-256 Hashing
          </div>
          <button className="btn btn-primary" onClick={handleHash} disabled={loading}>
            {loading ? '⏳ Hashing…' : <><Lock size={18} /> Hash Record + Show Avalanche Effect</>}
          </button>
          {hashResult && (
            <div style={{marginTop:20}}>
              <div className="card-subtitle" style={{marginBottom:10, fontWeight: 600}}>Hashed Record (on-chain safe):</div>
              {Object.entries(hashResult).map(([k,v]) => (
                <div key={k} style={{marginBottom:8}}>
                  <span style={{fontSize:'0.85rem',color:'var(--text-muted)', fontWeight: 500}}>{k}: </span>
                  <span className="hash-display">{String(v).slice(0,80)}</span>
                </div>
              ))}
            </div>
          )}
          {avalanche && (
            <div className="alert alert-info" style={{marginTop:20}}>
              <Waves size={20} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ fontSize: '1rem' }}>Avalanche Effect</strong>
                <div style={{marginTop:10, fontSize:'0.9rem'}}>
                  <div style={{ marginBottom: 4 }}>Original: <code style={{ background: 'white', padding: '2px 6px', borderRadius: 4 }}>{avalanche.original_input}</code></div>
                  <div style={{ marginBottom: 4 }}>Modified: <code style={{ background: 'white', padding: '2px 6px', borderRadius: 4 }}>{avalanche.modified_input}</code></div>
                  <div style={{marginTop:8, fontWeight: 500}}>
                    <strong style={{color:'var(--accent-blue)'}}>
                      {avalanche.differing_bits} / 256 bits changed ({avalanche.bit_diff_pct}%)
                    </strong>
                    {' — '}
                    {avalanche.avalanche_ok ? <span style={{color: 'var(--accent-green)'}}><CheckCircle2 size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Strong avalanche confirmed</span> : <span style={{color: 'var(--accent-amber)'}}><AlertTriangle size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Weak avalanche</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="card" style={{marginTop:24}}>
          <div className="card-title" style={{marginBottom:20}}>
            <BrainCircuit size={18} /> Step 3: ML Fraud Gate (XGBoost)
          </div>
          <button className="btn btn-primary" onClick={handleML} disabled={loading}>
            {loading ? '⏳ Classifying…' : <><BrainCircuit size={18} /> Run XGBoost Gate</>}
          </button>
          {mlResult && (
            <div style={{marginTop:20}}>
              <div className={`alert ${mlResult.result==='VALID'?'alert-success': mlResult.result.startsWith('N/A')?'alert-warning':'alert-error'}`}>
                {mlResult.result==='VALID' ? <CheckCircle2 size={20} /> : mlResult.result.startsWith('N/A') ? <AlertTriangle size={20} /> : <XCircle size={20} />}
                <div>
                  <strong style={{fontSize:'1.05rem'}}>
                    {mlResult.result==='VALID' ? 'VALID' :
                     mlResult.result.startsWith('N/A') ? mlResult.result :
                     'MANIPULATED — REJECTED'}
                  </strong>
                  {mlResult.confidence > 0 && (
                    <div style={{fontSize:'0.9rem',marginTop:6}}>
                      Fraud probability: <strong>{(mlResult.confidence*100).toFixed(2)}%</strong>
                    </div>
                  )}
                </div>
              </div>
              {mlResult.result==='MANIPULATED' && (
                <div className="alert alert-error" style={{marginTop:16}}>
                  <Lock size={20} style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{fontWeight:700,marginBottom:6, fontSize: '1rem'}}>Blockchain Submission Blocked</div>
                    <div style={{fontSize:'0.9rem'}}>
                      This record has been flagged as fraudulent/manipulated by the XGBoost pre-chain gate.
                      It will <strong>not</strong> be submitted to IPFS or the blockchain.
                      Review the trial data and resubmit a corrected record.
                    </div>
                  </div>
                </div>
              )}
              {mlResult.result==='VALID' && (
                <div style={{marginTop:12,fontSize:'0.9rem',color:'var(--text-muted)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={16} color="var(--accent-green)" /> Record cleared by ML gate. Proceed to IPFS upload →
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 4 */}
      {step === 4 && (
        <div className="card" style={{marginTop:24}}>
          <div className="card-title" style={{marginBottom:20}}>
            <CloudUpload size={18} /> Step 4: IPFS Upload (Off-chain)
          </div>
          <button className="btn btn-primary" onClick={handleIPFS} disabled={loading}>
            {loading ? '⏳ Uploading…' : <><CloudUpload size={18} /> Upload to IPFS</>}
          </button>
          {ipfsResult && (
            <div style={{marginTop:20}}>
              <div className="alert alert-success" style={{ fontWeight: 500 }}><CheckCircle2 size={18}/> Uploaded to IPFS</div>
              <div style={{marginTop:12}}>
                <div style={{fontSize:'0.85rem',color:'var(--text-muted)', fontWeight: 600, marginBottom: 4}}>CID</div>
                <div className="hash-display">{ipfsResult.ipfs?.cid}</div>
                <div style={{marginTop:12,fontSize:'0.85rem',color:'var(--text-muted)', fontWeight: 600, marginBottom: 4}}>SHA-256</div>
                <div className="hash-display">{ipfsResult.ipfs?.sha256}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 5 */}
      {step === 5 && (
        <div className="card" style={{marginTop:24}}>
          <div className="card-title" style={{marginBottom:20}}>
            <Send size={18} /> Step 5: Submit to Mempool
          </div>
          <button className="btn btn-success" onClick={handleSubmit} disabled={loading}>
            {loading ? '⏳ Submitting…' : <><Send size={18} /> Submit Transaction</>}
          </button>
          {txResult && (
            <div className="alert alert-success" style={{marginTop:20}}>
              <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
              <div style={{ width: '100%' }}>
                <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 8 }}>Transaction submitted to mempool!</div>
                <div className="hash-display" style={{ background: 'white' }}>{txResult.tx_id}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 6 && (
        <div className="alert alert-success" style={{marginTop:24, padding: '24px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PartyPopper size={32} color="var(--accent-green)" />
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>Pipeline complete!</div>
              <div style={{ fontSize: '0.95rem' }}>The transaction is in the mempool awaiting consensus and block inclusion.</div>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => { setStep(1); setUploadResult(null); setHashResult(null); setMlResult(null); setIpfsResult(null); setTxResult(null); }}>
            Submit Another
          </button>
        </div>
      )}
    </div>
  );
}
