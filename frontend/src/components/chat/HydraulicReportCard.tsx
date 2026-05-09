import type { HydraulicReport, HydraulicAggregate, LlmUsage } from '../../types/evaluation';

interface Props {
  report: HydraulicReport;
  llmUsage?: LlmUsage | null;
}

const STATUS_COLOR: Record<string, string> = {
  PASS: '#22c55e',
  WARN: '#f59e0b',
  FAIL: '#ef4444',
  'N/A': '#64748b',
};

const STATUS_BG: Record<string, string> = {
  PASS: 'rgba(34,197,94,0.15)',
  WARN: 'rgba(245,158,11,0.15)',
  FAIL: 'rgba(239,68,68,0.15)',
  'N/A': 'rgba(100,116,139,0.15)',
};

function AggregateBanner({ agg, sourcePressure, totalDemand }: {
  agg: HydraulicAggregate;
  sourcePressure: number | null;
  totalDemand: number;
}) {
  const color = STATUS_COLOR[agg.status] ?? '#64748b';
  const bg = STATUS_BG[agg.status] ?? 'rgba(100,116,139,0.15)';

  const statusLabel: Record<string, string> = {
    PASS: 'All outlets adequate',
    WARN: 'Some outlets below threshold',
    FAIL: 'Pressure inadequate',
    'N/A': 'No outlets evaluated',
  };

  return (
    <div style={{
      background: bg,
      border: `1px solid ${color}`,
      borderRadius: 8,
      padding: '10px 14px',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
    }}>
      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          background: color,
          color: '#0f172a',
          fontWeight: 700,
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 4,
          letterSpacing: 0.5,
        }}>
          {agg.status}
        </span>
        <span style={{ color, fontWeight: 600, fontSize: 13 }}>
          {statusLabel[agg.status]}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginLeft: 'auto' }}>
        {sourcePressure !== null && (
          <Metric label="Mains pressure" value={`${sourcePressure} bar`} />
        )}
        {agg.source_elevation_m != null && (
          <Metric label="Source elevation" value={`${agg.source_elevation_m.toFixed(1)} m MRL`} />
        )}
        {totalDemand > 0 && (
          <Metric label="Total demand" value={`${totalDemand.toFixed(1)} L/min`} />
        )}
        {agg.outlets_total > 0 && (
          <Metric
            label="Outlets ≥ 1 bar"
            value={`${agg.outlets_adequate} / ${agg.outlets_total}`}
            valueColor={agg.outlets_adequate < agg.outlets_total ? '#fca5a5' : '#86efac'}
          />
        )}
        {agg.min_residual_bar !== null && (
          <Metric
            label="Min residual"
            value={`${agg.min_residual_bar.toFixed(3)} bar`}
            valueColor={agg.min_residual_bar < 1.0 ? '#fca5a5' : '#86efac'}
          />
        )}
        {agg.max_residual_bar !== null && (
          <Metric label="Max residual" value={`${agg.max_residual_bar.toFixed(3)} bar`} />
        )}
        {agg.highest_elevation_m != null && (
          <Metric
            label={`Highest fitting${agg.highest_fitting_type ? ` (${agg.highest_fitting_type.replace(/_/g, ' ')})` : ''}`}
            value={agg.highest_fitting_pressure_bar != null
              ? `${agg.highest_fitting_pressure_bar.toFixed(3)} bar @ ${agg.highest_elevation_m.toFixed(1)} m`
              : `${agg.highest_elevation_m.toFixed(1)} m — no pressure data`}
            valueColor={
              agg.highest_fitting_pressure_bar != null && agg.highest_fitting_pressure_bar < 1.0
                ? '#fca5a5' : '#86efac'
            }
          />
        )}
      </div>
    </div>
  );
}

export function HydraulicReportCard({ report, llmUsage }: Props) {
  const hasPipes = report.pipes.length > 0;
  const hasFittings = report.fittings.length > 0;

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>⚙</span>
        <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>Hydraulic Analysis</span>
      </div>

      {/* Aggregate banner (final result) */}
      {report.aggregate && (
        <AggregateBanner
          agg={report.aggregate}
          sourcePressure={report.source_pressure_bar}
          totalDemand={report.total_demand_lpm}
        />
      )}

      {/* Solver note */}
      {report.note && (
        <p style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginBottom: 10 }}>
          {report.note}
        </p>
      )}

      {/* Fittings / Outlets table */}
      {hasFittings && (
        <>
          <SectionHeading>Fittings / Outlets</SectionHeading>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 14 }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
                  <th style={th}>Fitting Type</th>
                  <th style={th}>Ticks</th>
                  <th style={th}>Elevation (m)</th>
                  <th style={th}>Design Flow (L/min)</th>
                  <th style={th}>Residual Pressure (bar)</th>
                </tr>
              </thead>
              <tbody>
                {report.fittings.map((f, i) => {
                  const isDisconnected = f.disconnected === true;
                  const isError = f.calculation_error === true;
                  const lowP = !isDisconnected && !isError && f.residual_pressure_bar !== null && f.residual_pressure_bar < 1.0;
                  const bg = isDisconnected || isError
                    ? 'rgba(220,38,38,0.18)'
                    : lowP
                    ? 'rgba(220,38,38,0.10)'
                    : i % 2 === 0 ? '#0f172a' : '#1a2535';
                  return (
                    <tr key={f.id} style={{
                      background: bg,
                      borderLeft: isDisconnected || isError
                        ? '3px solid #ef4444'
                        : f.is_highest ? '3px solid #f59e0b' : undefined,
                    }}>
                      <td style={td}>
                        {f.fitting_type.replace(/_/g, ' ')}
                        {f.is_highest && !isDisconnected && !isError && (
                          <span style={{ marginLeft: 5, fontSize: 9, color: '#f59e0b', fontWeight: 700 }}>▲ HIGHEST</span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>{f.ticks ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right', color: f.is_highest ? '#f59e0b' : '#cbd5e1' }}>
                        {f.elevation_m?.toFixed(1) ?? '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {f.design_flow_lpm !== null ? f.design_flow_lpm.toFixed(2) : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: isDisconnected || isError ? '#fca5a5' : lowP ? '#fca5a5' : '#cbd5e1' }}>
                        {isDisconnected ? (
                          <span style={{ fontWeight: 600, fontSize: 11 }}>NOT CONNECTED</span>
                        ) : isError ? (
                          <span style={{ fontWeight: 600, fontSize: 11 }}>CALC ERROR</span>
                        ) : f.residual_pressure_bar !== null ? (
                          <>
                            {f.residual_pressure_bar.toFixed(3)}
                            {lowP && ' ⚠ < 1 bar'}
                          </>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Pipes table */}
      {hasPipes && (
        <>
          <SectionHeading>Pipes</SectionHeading>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
                  <th style={th}>#</th>
                  <th style={th}>Route</th>
                  <th style={th}>Type</th>
                  <th style={th}>Length (m)</th>
                  <th style={th}>Size (mm)</th>
                  <th style={th}>Material</th>
                  <th style={th}>Flow (L/min)</th>
                  <th style={th}>Velocity (m/s)</th>
                  <th style={th}>Friction (bar)</th>
                </tr>
              </thead>
              <tbody>
                {report.pipes.map((p, i) => {
                  const isHot = p.pipe_type === 'hot';
                  const bg = i % 2 === 0 ? '#0f172a' : '#1a2535';
                  const typeColor = isHot ? '#fca5a5' : '#93c5fd';
                  return (
                    <tr key={p.id} style={{ background: bg }}>
                      <td style={{ ...td, color: '#64748b' }}>{i + 1}</td>
                      <td style={{ ...td, color: '#94a3b8', fontSize: 11 }}>
                        {p.from_element_name} → {p.to_element_name}
                      </td>
                      <td style={{ ...td, color: typeColor, fontWeight: 600, fontSize: 11 }}>
                        {isHot ? 'Hot' : 'Cold'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{p.length_m ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{p.nominal_size_mm ?? '—'}</td>
                      <td style={td}>{p.material ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {p.flow_lpm !== null ? p.flow_lpm.toFixed(2) : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {p.velocity_ms !== null ? p.velocity_ms.toFixed(3) : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {p.friction_loss_bar !== null ? p.friction_loss_bar.toFixed(4) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!hasPipes && !hasFittings && !report.note && (
        <p style={{ color: '#64748b', fontSize: 12 }}>No hydraulic data available.</p>
      )}

      {/* LLM usage footer */}
      {llmUsage && (
        <div style={{
          marginTop: 10,
          padding: '7px 12px',
          background: '#0f172a',
          borderRadius: 6,
          fontSize: 11,
          color: '#64748b',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <span style={{ fontWeight: 600, color: '#475569' }}>AI Summary</span>
          <span style={{ color: '#94a3b8' }}>{llmUsage.model}</span>
          <span>{llmUsage.input_tokens.toLocaleString()} in / {llmUsage.output_tokens.toLocaleString()} out tokens</span>
          <span style={{ color: '#86efac' }}>${llmUsage.cost_usd.toFixed(6)}</span>
          <span>{llmUsage.latency_ms.toFixed(0)} ms</span>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: valueColor ?? '#93c5fd' }}>{value}</div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

const card: React.CSSProperties = {
  background: '#1e293b',
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 12,
  border: '1px solid #334155',
};

const th: React.CSSProperties = {
  padding: '6px 10px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.3,
  borderBottom: '1px solid #334155',
};

const td: React.CSSProperties = {
  padding: '5px 10px',
  color: '#cbd5e1',
  fontSize: 12,
};
