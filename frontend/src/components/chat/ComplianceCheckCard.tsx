import type { CheckResult } from '../../types/evaluation';
import { WelsTable } from './WelsTable';

interface Props {
  check: CheckResult;
  annotatedImage?: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  PASS: { bg: '#052e16', color: '#86efac', label: 'PASS' },
  FAIL: { bg: '#450a0a', color: '#fca5a5', label: 'FAIL' },
  WARN: { bg: '#431407', color: '#fdba74', label: 'WARN' },
  SKIP: { bg: '#1e293b', color: '#94a3b8', label: 'SKIP' },
};

export function ComplianceCheckCard({ check, annotatedImage }: Props) {
  const style = STATUS_STYLES[check.status] ?? STATUS_STYLES.SKIP;

  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 12,
        border: `1px solid ${style.color}33`,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            background: style.bg,
            color: style.color,
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 10px',
            borderRadius: 99,
            border: `1px solid ${style.color}66`,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}
        >
          {style.label}
        </span>
        <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>{check.title}</span>
      </div>

      {/* Summary */}
      <p style={{ fontSize: 13, color: '#cbd5e1', margin: '0 0 10px', fontWeight: 500 }}>
        {check.summary}
      </p>

      {/* Detail bullets */}
      {check.detail.length > 0 && (
        <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>
          {check.detail
            .filter((d) => d.trim())
            .map((line, i) => (
              <li key={i} style={{ whiteSpace: 'pre-wrap' }}>
                {line}
              </li>
            ))}
        </ul>
      )}

      {/* WELS table for check3 */}
      {check.table && check.table.length > 0 && (
        <WelsTable rows={check.table} />
      )}

      {/* Annotated image for check1 */}
      {annotatedImage && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
            Annotated schematic — highlighted elements:
          </div>
          <img
            src={`data:image/jpeg;base64,${annotatedImage}`}
            alt="Annotated schematic"
            style={{
              maxWidth: '100%',
              borderRadius: 6,
              border: '1px solid #334155',
              display: 'block',
            }}
          />
        </div>
      )}
    </div>
  );
}
