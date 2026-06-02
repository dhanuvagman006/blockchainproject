import React, { useState } from 'react';

const ALL_AGES   = ['<18', '18-35', '36-50', '51-65', '65+'];
const AGE_COLORS = {
  '<18':   '#818cf8',   // indigo
  '18-35': '#34d399',   // green
  '36-50': '#60a5fa',   // blue
  '51-65': '#fbbf24',   // amber
  '65+':   '#f87171',   // red
};

// Mini stacked bar showing age-group proportions
function AgeBar({ proportions }) {
  return (
    <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', width: '100%' }}>
      {ALL_AGES.map(ag => {
        const pct = (proportions?.[ag] ?? 0);   // already 0–1 float
        return pct > 0 ? (
          <div key={ag} title={`${ag}: ${(pct * 100).toFixed(1)}%`}
            style={{ width: `${pct * 100}%`, background: AGE_COLORS[ag], transition: 'width 0.5s ease' }} />
        ) : null;
      })}
    </div>
  );
}

// Deviation badge
function DevBadge({ dev }) {
  const col = dev >= 25 ? 'var(--accent-red)' : dev >= 15 ? 'var(--accent-amber)' : 'var(--accent-green)';
  return (
    <span style={{
      fontWeight: 700, fontSize: '0.75rem', color: col,
      background: `${col}22`, border: `1px solid ${col}44`,
      borderRadius: 20, padding: '2px 8px',
    }}>{dev > 0 ? `+${dev}pp` : `${dev}pp`}</span>
  );
}

// Single drug card
function DrugCard({ drug, data }) {
  const [open, setOpen] = useState(false);
  if (data.skipped_reason) return null;     // not enough data — skip

  const isFlagged = data.flagged;
  const borderCol = isFlagged ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.3)';
  const bgCol     = isFlagged ? 'rgba(239,68,68,0.04)' : 'rgba(16,185,129,0.03)';

  return (
    <div style={{
      border: `1px solid ${borderCol}`, borderRadius: 'var(--radius-md)',
      background: bgCol, marginBottom: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        cursor: 'pointer',
      }} onClick={() => setOpen(o => !o)}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: isFlagged ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
        }}>
          {isFlagged ? '⚠️' : '✅'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{drug}</span>
            <span className={`badge ${isFlagged ? 'badge-tampered' : 'badge-valid'}`}>
              {isFlagged ? `⚠️ Age bias detected` : '✅ Balanced'}
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 12 }}>
            <span>📊 {data.total_rows} rows</span>
            <span>🔬 {data.phase_count} phases: {data.phases?.join(', ')}</span>
            <span>📈 Max deviation: <strong style={{ color: isFlagged ? 'var(--accent-red)' : 'var(--accent-green)' }}>{data.max_deviation_pct}pp</strong></span>
            {isFlagged && <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>🚩 {data.flags?.length} flag(s)</span>}
          </div>
        </div>

        {/* Overall age bar */}
        <div style={{ width: 140, flexShrink: 0 }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 3 }}>Overall age mix</div>
          <AgeBar proportions={
            Object.fromEntries(ALL_AGES.map(ag => [ag, (data.overall_proportions?.[ag] ?? 0) / 100]))
          } />
        </div>

        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: '0 16px 16px' }} className="fade-in">

          {/* Per-phase rows */}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ marginBottom: 12 }}>
              <thead>
                <tr>
                  <th>Phase</th>
                  <th>Rows</th>
                  {ALL_AGES.map(ag => (
                    <th key={ag} style={{ color: AGE_COLORS[ag] }}>{ag}</th>
                  ))}
                  <th>Distribution</th>
                </tr>
              </thead>
              <tbody>
                {/* Overall row */}
                <tr style={{ background: 'rgba(59,130,246,0.06)', fontWeight: 600 }}>
                  <td>Overall</td>
                  <td>{data.total_rows}</td>
                  {ALL_AGES.map(ag => (
                    <td key={ag} style={{ color: AGE_COLORS[ag], fontWeight: 700 }}>
                      {data.overall_proportions?.[ag] ?? 0}%
                    </td>
                  ))}
                  <td style={{ minWidth: 120 }}>
                    <AgeBar proportions={
                      Object.fromEntries(ALL_AGES.map(ag => [ag, (data.overall_proportions?.[ag] ?? 0) / 100]))
                    } />
                  </td>
                </tr>
                {/* Per-phase rows */}
                {Object.entries(data.phase_distributions ?? {})
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([phase, dist]) => {
                    const hasFlag = data.flags?.some(f => f.phase === phase);
                    return (
                      <tr key={phase} style={hasFlag ? { background: 'rgba(239,68,68,0.06)' } : {}}>
                        <td style={{ fontWeight: 600 }}>
                          {hasFlag && <span style={{ color: 'var(--accent-red)', marginRight: 4 }}>⚠️</span>}
                          {phase}
                        </td>
                        <td>{dist.total}</td>
                        {ALL_AGES.map(ag => {
                          const pct  = ((dist.proportions?.[ag] ?? 0) * 100).toFixed(1);
                          const over = (data.overall_proportions?.[ag] ?? 0);
                          const dev  = Math.abs(parseFloat(pct) - over);
                          const flagged = dev > 15;
                          return (
                            <td key={ag} style={{
                              color: flagged ? 'var(--accent-red)' : AGE_COLORS[ag],
                              fontWeight: flagged ? 700 : 400,
                            }}>
                              {pct}%{flagged && <span style={{ fontSize: '0.65rem', marginLeft: 2 }}>⚠️</span>}
                            </td>
                          );
                        })}
                        <td style={{ minWidth: 120 }}>
                          <AgeBar proportions={dist.proportions ?? {}} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Flag detail table */}
          {isFlagged && data.flags?.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--accent-red)', fontSize: '0.8rem', marginBottom: 8 }}>
                🚩 Flagged Deviations (&gt;{15}pp from overall)
              </div>
              <table className="data-table">
                <thead>
                  <tr><th>Phase</th><th>Age Group</th><th>This Phase</th><th>Overall</th><th>Deviation</th></tr>
                </thead>
                <tbody>
                  {data.flags.map((f, i) => (
                    <tr key={i} style={{ background: 'rgba(239,68,68,0.06)' }}>
                      <td style={{ fontWeight: 600 }}>{f.phase}</td>
                      <td><span style={{ color: AGE_COLORS[f.age_group], fontWeight: 600 }}>{f.age_group}</span></td>
                      <td style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>{f.phase_pct}%</td>
                      <td style={{ color: 'var(--text-muted)' }}>{f.overall_pct}%</td>
                      <td><DevBadge dev={f.deviation_pct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main exported component ───────────────────────────────────
export default function PharmaBalanceReport({ report, compact = false }) {
  if (!report) return null;

  const { drug_analysis, flagged_drugs, total_drugs, drugs_with_flags, deviation_threshold_pct } = report;
  const analyzedDrugs = Object.entries(drug_analysis ?? {}).filter(([, d]) => !d.skipped_reason);
  if (analyzedDrugs.length === 0) return (
    <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
      ℹ️ Not enough phase data per drug to compute age-balance (need ≥2 phases with ≥3 rows each).
    </div>
  );

  return (
    <div>
      {/* Summary strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${compact ? 2 : 4}, 1fr)`,
        gap: 12, marginBottom: 16,
      }}>
        {[
          { label: 'Drugs Analysed', val: total_drugs, col: 'var(--accent-blue)' },
          { label: 'Age-Biased Drugs', val: drugs_with_flags,
            col: drugs_with_flags > 0 ? 'var(--accent-red)' : 'var(--accent-green)' },
          { label: 'Flag Threshold', val: `${deviation_threshold_pct}pp`, col: 'var(--accent-amber)' },
          { label: 'Clean Drugs', val: total_drugs - drugs_with_flags, col: 'var(--accent-green)' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
            padding: '10px 14px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: s.col }}>{s.val}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Age-group legend */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {ALL_AGES.map(ag => (
          <div key={ag} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: AGE_COLORS[ag] }} />
            <span style={{ color: 'var(--text-muted)' }}>{ag}</span>
          </div>
        ))}
      </div>

      {/* Flagged first */}
      {analyzedDrugs
        .sort(([, a], [, b]) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0))
        .map(([drug, data]) => (
          <DrugCard key={drug} drug={drug} data={data} />
        ))
      }
    </div>
  );
}
