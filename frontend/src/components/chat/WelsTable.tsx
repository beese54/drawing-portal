import type { WelsRow } from '../../types/evaluation';

interface Props {
  rows: WelsRow[];
}

const TICK_SYMBOLS: Record<number, string> = { 1: '✓', 2: '✓✓', 3: '✓✓✓', 4: '✓✓✓✓' };

export function WelsTable({ rows }: Props) {
  const flowRateRows = rows.filter((r) => r.unit === 'L/min' && r.design_flow !== null);
  const totalLpm = flowRateRows.reduce((sum, r) => sum + (r.design_flow ?? 0), 0);

  return (
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
            <th style={th}>Fitting</th>
            <th style={th}>Ticks</th>
            <th style={th}>Max Flow</th>
            <th style={th}>Unit</th>
            <th style={th}>Compliant</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const bg = i % 2 === 0 ? '#0f172a' : '#1a2535';
            const failBg = row.compliant === false ? 'rgba(220,38,38,0.15)' : bg;
            return (
              <tr key={row.element_id} style={{ background: failBg }}>
                <td style={td}>{row.name}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  {row.ticks !== null ? (
                    <span style={{ color: row.compliant ? '#86efac' : '#fca5a5' }}>
                      {TICK_SYMBOLS[row.ticks] ?? row.ticks}
                    </span>
                  ) : (
                    <span style={{ color: '#64748b' }}>—</span>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {row.design_flow !== null ? row.design_flow : '—'}
                </td>
                <td style={{ ...td, color: '#64748b' }}>{row.unit}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  {row.compliant === null ? (
                    <span style={{ color: '#64748b' }}>?</span>
                  ) : row.compliant ? (
                    <span style={{ color: '#86efac' }}>✓</span>
                  ) : (
                    <span style={{ color: '#fca5a5' }}>✗</span>
                  )}
                </td>
              </tr>
            );
          })}
          {totalLpm > 0 && (
            <tr style={{ background: '#1e293b', borderTop: '1px solid #334155' }}>
              <td style={{ ...td, fontWeight: 700, color: '#e2e8f0' }} colSpan={2}>
                Total flow-rate demand
              </td>
              <td style={{ ...td, fontWeight: 700, color: '#e2e8f0', textAlign: 'right' }}>
                {totalLpm.toFixed(1)}
              </td>
              <td style={{ ...td, color: '#64748b' }}>L/min</td>
              <td style={td} />
            </tr>
          )}
        </tbody>
      </table>
      <p style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
        PUB MWELS: minimum 2-tick rating required for all fittings (from 1 Apr 2019).
      </p>
    </div>
  );
}

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
