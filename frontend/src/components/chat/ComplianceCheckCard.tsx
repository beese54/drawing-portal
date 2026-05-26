import { useState } from 'react';
import type { CheckResult } from '../../types/evaluation';
import { WelsTable } from './WelsTable';

interface Props {
  check: CheckResult;
  annotatedImage?: string | null;
  defaultExpanded?: boolean;
}

const STATUS_STYLES: Record<string, { bg: string; border: string; color: string; label: string }> = {
  PASS: { bg: '#052e16', border: '#86efac33', color: '#86efac', label: 'PASS' },
  FAIL: { bg: '#450a0a', border: '#fca5a533', color: '#fca5a5', label: 'FAIL' },
  WARN: { bg: '#431407', border: '#fdba7433', color: '#fdba74', label: 'WARN' },
  SKIP: { bg: '#1e293b', border: '#94a3b833', color: '#94a3b8', label: 'SKIP' },
};

export function ComplianceCheckCard({ check, annotatedImage, defaultExpanded = true }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const style = STATUS_STYLES[check.status] ?? STATUS_STYLES.SKIP;

  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: 10,
        marginBottom: 8,
        border: `1px solid ${style.border}`,
        overflow: 'hidden',
      }}
    >
      {/* Clickable header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '11px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textAlign: 'left',
        }}
      >
        <span
          style={{
            background: style.bg,
            color: style.color,
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 9px',
            borderRadius: 99,
            border: `1px solid ${style.color}66`,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}
        >
          {style.label}
        </span>
        <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 13, flex: 1 }}>
          {check.title}
        </span>
        {!expanded && (
          <span
            style={{
              fontSize: 11,
              color: '#64748b',
              flexShrink: 0,
              maxWidth: 240,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {check.summary}
          </span>
        )}
        <span style={{ color: '#475569', fontSize: 11, flexShrink: 0, marginLeft: 6 }}>
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {/* Expandable body */}
      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ fontSize: 13, color: '#cbd5e1', margin: '0 0 10px', fontWeight: 500 }}>
            {check.summary}
          </p>

          {check.detail.length > 0 && (
            <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>
              {check.detail
                .filter((d) => d.trim())
                .map((line, i) => {
                  if (line.startsWith('##')) {
                    return (
                      <div
                        key={i}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 4px -18px' }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#7dd3fc', whiteSpace: 'nowrap' }}>
                          {line.slice(2).trim()}
                        </span>
                        <div style={{ flex: 1, height: 1, background: '#334155' }} />
                      </div>
                    );
                  }
                  return (
                    <li key={i} style={{ whiteSpace: 'pre-wrap' }}>
                      {line}
                    </li>
                  );
                })}
            </ul>
          )}

          {check.table && check.table.length > 0 && <WelsTable rows={check.table} />}

          {annotatedImage && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                Annotated schematic — highlighted elements:
              </div>
              <img
                src={`data:image/jpeg;base64,${annotatedImage}`}
                alt="Annotated schematic"
                style={{ maxWidth: '100%', borderRadius: 6, border: '1px solid #334155', display: 'block' }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
