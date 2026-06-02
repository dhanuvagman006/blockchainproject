import React, { useState, useEffect, useCallback } from 'react';
import {
  getRejectedDatasets,
  getRejectedDataset,
  approveRejectedDataset,
  dismissRejectedDataset,
} from '../api';
import PharmaBalanceReport from '../components/PharmaBalanceReport';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, Link as LinkIcon, Flag, 
  Clock, Trash2, Dna, PartyPopper, Inbox, Activity, CheckCircle, RefreshCw
} from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const ConfidenceBar = ({ val }) => {
  const pct = Math.round(val * 100);
  const col = pct >= 70 ? 'var(--accent-red)' : pct >= 40 ? 'var(--accent-amber)' : 'var(--accent-green)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: col, minWidth: 36 }}>{pct}%</span>
    </div>
  );
};

// ── ApproveModal ─────────────────────────────────────────────
function ApproveModal({ ds, onClose, onApproved }) {
  const [adminId, setAdminId] = useState('DRUG-AUTHORITY-001');
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [err, setErr]         = useState('');

  const handleApprove = async () => {
    if (!adminId.trim()) return setErr('Admin ID is required');
    setLoading(true); setErr('');
    try {
      const r = await approveRejectedDataset(ds.id, {
        approved_by:   adminId.trim(),
        approval_note: note.trim(),
        push_to_chain: true,
      });
      setResult(r.data);
      onApproved(ds.id);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)', padding: 36, width: 560, maxHeight: '85vh',
        overflowY: 'auto', boxShadow: 'var(--shadow-lg)',
        animation: 'fadeIn 0.2s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h3 style={{ color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldCheck size={24} /> Authority Override — Push to Blockchain
            </h3>
            <p style={{ marginTop: 6, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              You are overriding the ML gate for <strong style={{ color: 'var(--text-primary)' }}>{ds.filename}</strong>
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
        </div>

        {/* Risk summary */}
        <div style={{
          background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: 24,
        }}>
          <div style={{ fontWeight: 600, color: 'var(--accent-red)', marginBottom: 10, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} /> ML Fraud Screening Summary
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: '0.9rem' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>TOTAL ROWS</div>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--text-primary)' }}>{ds.total_rows}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>FLAGGED</div>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent-red)' }}>{ds.flagged_rows}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>FLAG RATE</div>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent-amber)' }}>{ds.flagged_rate_pct}%</div>
            </div>
          </div>
        </div>

        {!result ? (
          <>
            <div className="form-group">
              <label className="form-label">Drug Authority Admin ID *</label>
              <input className="form-input" value={adminId}
                onChange={e => setAdminId(e.target.value)}
                placeholder="e.g. DRUG-AUTHORITY-001" />
            </div>
            <div className="form-group">
              <label className="form-label">Approval Justification</label>
              <textarea className="form-textarea" rows={3} value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Reason for override — e.g. 'Pediatric dosing flagged in error, clinically verified by Dr. Sharma'" />
            </div>

            <div style={{
              background: '#FEF3C7', border: '1px solid #FDE68A',
              borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 24, fontSize: '0.85rem',
              color: '#92400E', display: 'flex', alignItems: 'flex-start', gap: 8
            }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                This action will submit all <strong>{ds.total_rows}</strong> records to the mempool, bypassing the ML gate. The approval will be recorded on-chain in the transaction metadata.
              </div>
            </div>

            {err && <div className="alert alert-error" style={{ marginBottom: 20 }}><AlertTriangle size={16} /> {err}</div>}

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-danger" onClick={handleApprove} disabled={loading} style={{ flex: 1 }}>
                {loading ? '⏳ Pushing to blockchain…' : <><CheckCircle2 size={18} /> Approve & Push to Blockchain</>}
              </button>
              <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            </div>
          </>
        ) : (
          <div>
            <div className="alert alert-success" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={20} /> Dataset Approved & Pushed
              </div>
              <div style={{ fontSize: '0.9rem' }}>
                <strong>{result.pushed_tx}</strong> transactions submitted to the mempool.
                {result.errors?.length > 0 && (
                  <span style={{ color: 'var(--accent-amber)', marginLeft: 4 }}>
                    ({result.errors.length} rows failed)
                  </span>
                )}
              </div>
            </div>
            {result.tx_ids?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Transaction IDs (first {result.tx_ids.length})
                </div>
                <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.tx_ids.map((id, i) => (
                    <div key={i} className="hash-display" style={{ fontSize: '0.75rem' }}>{id}</div>
                  ))}
                </div>
              </div>
            )}
            {result.errors?.length > 0 && (
              <div className="alert alert-warning" style={{ marginBottom: 20 }}>
                <AlertTriangle size={18} /> {result.errors.length} rows failed to submit.
              </div>
            )}
            <button className="btn btn-secondary" onClick={onClose} style={{ width: '100%' }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FlaggedRowsTable ─────────────────────────────────────────
function FlaggedRowsTable({ details }) {
  if (!details?.length) return <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No flagged rows detail available.</div>;
  return (
    <div className="table-container" style={{ maxHeight: 320, overflowY: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Row</th><th>Trial ID</th><th>Patient</th><th>Age Group</th>
            <th>Phase</th><th>Dosage (mg)</th><th>Resp. Days</th>
            <th>Adverse Event</th><th>Fraud Probability</th>
          </tr>
        </thead>
        <tbody>
          {details.map((r, i) => (
            <tr key={i}>
              <td style={{ color: 'var(--accent-red)', fontWeight: 600 }}>#{r.row_index}</td>
              <td><span className="mono" style={{ fontSize: '0.8rem' }}>{r.trial_id}</span></td>
              <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{r.patient_id || '—'}</td>
              <td><span className="badge badge-tampered">{r.age_group}</span></td>
              <td>{r.phase}</td>
              <td style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>{r.dosage}</td>
              <td>{r.response_days}</td>
              <td><span className="badge badge-tampered">{r.adverse_event}</span></td>
              <td style={{ minWidth: 140 }}><ConfidenceBar val={r.confidence} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── DatasetCard ──────────────────────────────────────────────
function DatasetCard({ ds, onApprove, onDismiss, onExpand, expanded }) {
  const isPending  = ds.status === 'PENDING_REVIEW';
  const isApproved = ds.status === 'APPROVED';
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${isPending ? 'rgba(239,68,68,0.3)' : isApproved ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)', marginBottom: 20, overflow: 'hidden',
      boxShadow: isPending ? '0 0 0 1px rgba(239,68,68,0.1)' : 'var(--shadow)',
      transition: 'all 0.3s ease',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, padding: '20px 28px',
        background: isPending ? 'rgba(239,68,68,0.02)' : isApproved ? 'rgba(16,185,129,0.02)' : 'transparent',
        borderBottom: expanded ? '1px solid var(--border)' : 'none',
        cursor: 'pointer',
      }} onClick={() => onExpand(ds.id)}>
        {/* Status icon */}
        <div style={{
          width: 48, height: 48, borderRadius: 'var(--radius-md)', flexShrink: 0,
          background: isPending ? '#FEE2E2' : '#D1FAE5', color: isPending ? 'var(--accent-red)' : 'var(--accent-green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isPending ? <Clock size={24} /> : <CheckCircle size={24} />}
        </div>

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
              {ds.filename}
            </span>
            <span className={`badge ${isPending ? 'badge-tampered' : 'badge-valid'}`}>
              {isPending ? <><Clock size={12}/> Pending Review</> : <><CheckCircle2 size={12}/> Approved</>}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: 20, flexWrap: 'wrap', fontWeight: 500 }}>
            <span>Submitted: {fmtDate(ds.submitted_at)}</span>
            <span>{ds.total_rows} rows</span>
            <span style={{ color: 'var(--accent-red)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Flag size={14} /> {ds.flagged_rows} flagged ({ds.flagged_rate_pct}%)
            </span>
            {isApproved && (
              <span style={{ color: 'var(--accent-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <LinkIcon size={14} /> {ds.tx_count} tx pushed
              </span>
            )}
          </div>
          {isApproved && (
            <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', color: 'var(--accent-green)', marginRight: 4 }} />
              Approved by <strong style={{ color: 'var(--text-primary)' }}>{ds.approved_by}</strong>
              {' '}on {fmtDate(ds.approved_at)}
              {ds.approval_note && <span> — "{ds.approval_note}"</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, flexShrink: 0, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          {isPending && (
            <>
              <button className="btn btn-success btn-sm" id={`approve-btn-${ds.id}`}
                onClick={() => { setConfirmDismiss(false); onApprove(ds); }}>
                <ShieldCheck size={16} /> Approve & Push
              </button>

              {/* Inline dismiss confirmation */}
              {!confirmDismiss ? (
                <button
                  className="btn btn-sm"
                  style={{ background: 'white', color: 'var(--accent-red)', border: '1px solid var(--border)' }}
                  id={`dismiss-btn-${ds.id}`}
                  onClick={() => setConfirmDismiss(true)}>
                  <Trash2 size={16} /> Dismiss
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: 'var(--radius-md)', padding: '6px 12px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--accent-red)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Remove from queue?
                  </span>
                  <button
                    className="btn btn-danger btn-sm"
                    id={`dismiss-confirm-btn-${ds.id}`}
                    onClick={() => { setConfirmDismiss(false); onDismiss(ds.id); }}>
                    Yes
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    id={`dismiss-cancel-btn-${ds.id}`}
                    onClick={() => setConfirmDismiss(false)}>
                    No
                  </button>
                </div>
              )}
            </>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => { setConfirmDismiss(false); onExpand(ds.id); }}>
            {expanded ? '▲ Collapse' : '▼ Details'}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '24px 28px', borderTop: '1px solid var(--border)' }} className="fade-in">
          {/* Stats strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Rows', val: ds.total_rows, col: 'var(--accent-blue)' },
              { label: 'Flagged Rows', val: ds.flagged_rows, col: 'var(--accent-red)' },
              { label: 'Valid Rows', val: ds.total_rows - ds.flagged_rows, col: 'var(--accent-green)' },
              { label: 'Flag Rate', val: ds.flagged_rate_pct + '%', col: 'var(--accent-amber)' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)',
                padding: '16px', textAlign: 'center', border: '1px solid var(--border)'
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.col }}>{s.val}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Flagged rows table */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-red)', marginBottom: 12, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flag size={16} /> Flagged Records
            </div>
            <FlaggedRowsTable details={ds.screening?.flagged_details} />
          </div>

          {/* Pharma age-balance report */}
          {ds.balance_report && (
            <div style={{ marginTop: 28 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                fontWeight: 600, fontSize: '1rem', marginBottom: 16,
                color: ds.balance_report.drugs_with_flags > 0 ? 'var(--accent-amber)' : 'var(--accent-green)',
              }}>
                <Dna size={18} /> Pharma Age-Group Balance Report
                {ds.balance_report.drugs_with_flags > 0 && (
                  <span className="badge badge-tampered" style={{ marginLeft: 8 }}>
                    {ds.balance_report.drugs_with_flags} drug(s) with age bias
                  </span>
                )}
              </div>
              <PharmaBalanceReport report={ds.balance_report} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function DrugAuthorityAdmin() {
  const [datasets,    setDatasets]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState('');
  const [expanded,    setExpanded]    = useState({});
  const [approveDs,   setApproveDs]   = useState(null);   // ds being approved in modal
  const [filter,      setFilter]      = useState('ALL');   // ALL | PENDING | APPROVED
  const [dismissing,  setDismissing]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await getRejectedDatasets();
      setDatasets(r.data.rejected_datasets || []);
    } catch (e) {
      setErr('Failed to load rejected datasets. Make sure the backend is running.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const handleApproved = (id) => {
    load();
  };

  const handleDismiss = async (id) => {
    setDismissing(id);
    try {
      await dismissRejectedDataset(id);
      setDatasets(p => p.filter(d => d.id !== id));
    } catch (e) {
      setErr(e.response?.data?.detail || e.message);
    }
    setDismissing(null);
  };

  const filtered = datasets.filter(d =>
    filter === 'ALL' ? true :
    filter === 'PENDING' ? d.status === 'PENDING_REVIEW' :
    d.status === 'APPROVED'
  );

  const pendingCount  = datasets.filter(d => d.status === 'PENDING_REVIEW').length;
  const approvedCount = datasets.filter(d => d.status === 'APPROVED').length;
  const totalFlagged  = datasets.reduce((s, d) => s + (d.flagged_rows || 0), 0);
  const totalRows     = datasets.reduce((s, d) => s + (d.total_rows || 0), 0);

  return (
    <div className="page-content fade-in">

      {/* Page header */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                width: 44, height: 44, borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                color: 'white',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}><ShieldCheck size={24} /></span>
              Drug Authority Admin
            </h2>
            <p style={{ marginTop: 8 }}>
              Review ML-rejected datasets, verify legitimacy, and override-push to the blockchain.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={load} disabled={loading} id="refresh-rejected-btn">
            {loading ? '⏳ Loading…' : <><RefreshCw size={16} /> Refresh</>}
          </button>
        </div>
      </div>

      {err && <div className="alert alert-error" style={{ marginBottom: 24 }}><AlertTriangle size={18} /> {err}</div>}

      {/* Stats grid */}
      <div className="stats-grid" style={{ marginBottom: 32 }}>
        <div className="stat-card">
          <div className="stat-icon amber"><Flag size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>{pendingCount}</div>
            <div className="stat-label">Awaiting Review</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--accent-green)' }}>{approvedCount}</div>
            <div className="stat-label">Approved & Pushed</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red"><AlertTriangle size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--accent-red)' }}>{totalFlagged}</div>
            <div className="stat-label">Total Flagged Rows</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><Activity size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{totalRows}</div>
            <div className="stat-label">Total Rows Reviewed</div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        {[
          { key: 'ALL',      label: `All (${datasets.length})`, icon: <Inbox size={16} /> },
          { key: 'PENDING',  label: `Pending Review (${pendingCount})`, icon: <Clock size={16} /> },
          { key: 'APPROVED', label: `Approved (${approvedCount})`, icon: <CheckCircle2 size={16} /> },
        ].map(t => (
          <div key={t.key} className={`tab ${filter === t.key ? 'active' : ''}`}
            onClick={() => setFilter(t.key)} id={`filter-tab-${t.key.toLowerCase()}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {t.icon} {t.label}
          </div>
        ))}
      </div>

      {/* Dataset list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <div className="spinner" />
          <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>Loading rejected datasets…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '80px 24px', background: 'var(--bg-primary)' }}>
          <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
            {filter === 'PENDING' ? <PartyPopper size={48} /> : <Inbox size={48} />}
          </div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 10, fontSize: '1.25rem' }}>
            {filter === 'PENDING' ? 'No datasets awaiting review!' : 'No datasets in this category'}
          </h3>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
            {filter === 'PENDING'
              ? 'The ML gate has not blocked any datasets yet. Upload a biased/manipulated dataset from the Drug Inventor Portal to see it here.'
              : 'Try a different filter above.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(ds => (
            <DatasetCard
              key={ds.id}
              ds={ds}
              onApprove={setApproveDs}
              onDismiss={handleDismiss}
              onExpand={toggleExpand}
              expanded={!!expanded[ds.id]}
            />
          ))}
        </div>
      )}

      {/* Approval modal */}
      {approveDs && (
        <ApproveModal
          ds={approveDs}
          onClose={() => setApproveDs(null)}
          onApproved={(id) => { setApproveDs(null); handleApproved(id); }}
        />
      )}
    </div>
  );
}
