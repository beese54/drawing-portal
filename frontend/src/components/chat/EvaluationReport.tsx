import { useState, Component, type ReactNode } from 'react';
import type { EvaluationResponse, CheckResult } from '../../types/evaluation';
import { ComplianceCheckCard } from './ComplianceCheckCard';

class EvalErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '12px 16px', background: '#1e293b', borderRadius: 8, border: '1px solid #ef4444', color: '#fca5a5', fontSize: 13 }}>
          Evaluation display error: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

const STATUS_PRIORITY: Record<string, number> = { FAIL: 0, WARN: 1, SKIP: 2, PASS: 3 };

interface CheckEntry {
  check: CheckResult;
  annotatedImage?: string | null;
}

interface Props {
  result: EvaluationResponse;
}

export function EvaluationReport({ result }: Props) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Changing expandMode + version forces cards to remount with the new defaultExpanded
  const [expandMode, setExpandMode] = useState<'default' | 'all' | 'none'>('default');
  const [expandVersion, setExpandVersion] = useState(0);

  const allChecks: CheckEntry[] = [
    { check: result.check1_backflow, annotatedImage: result.annotated_image_b64 },
    { check: result.check2_supply_mode },
    { check: result.check3_water_efficiency },
    { check: result.check4_tank_pump },
    { check: result.check5_long_bath },
    { check: result.check6_hot_water },
    { check: result.check7_section3_pipes },
  ].sort((a, b) => (STATUS_PRIORITY[a.check.status] ?? 4) - (STATUS_PRIORITY[b.check.status] ?? 4));

  const failCount = allChecks.filter((e) => e.check.status === 'FAIL').length;
  const warnCount = allChecks.filter((e) => e.check.status === 'WARN').length;
  const passCount = allChecks.filter((e) => e.check.status === 'PASS').length;
  const skipCount = allChecks.filter((e) => e.check.status === 'SKIP').length;

  const issueCount = failCount + warnCount;
  const overallColor = failCount > 0 ? '#fca5a5' : warnCount > 0 ? '#fdba74' : '#86efac';
  const overallBg   = failCount > 0 ? '#450a0a' : warnCount > 0 ? '#431407' : '#052e16';

  const defaultExpandedFor = (status: string) =>
    expandMode === 'all' ? true : expandMode === 'none' ? false : status === 'FAIL';

  const triggerExpandAll = () => { setExpandMode('all');  setExpandVersion((v) => v + 1); };
  const triggerCollapseAll = () => { setExpandMode('none'); setExpandVersion((v) => v + 1); };

  return (
    <EvalErrorBoundary>
      <div style={{ marginTop: 8, width: '100%' }}>

        {/* Section header */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#64748b',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            marginBottom: 10,
            paddingBottom: 6,
            borderBottom: '1px solid #334155',
          }}
        >
          Compliance Evaluation Results
        </div>

        {/* Summary banner */}
        <div
          style={{
            background: overallBg,
            border: `1px solid ${overallColor}44`,
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: overallColor, flex: 1 }}>
            {issueCount === 0
              ? 'All checks passed'
              : `${issueCount} item${issueCount > 1 ? 's' : ''} need${issueCount === 1 ? 's' : ''} attention`}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {failCount > 0 && <Chip count={failCount} label="FAIL" color="#fca5a5" bg="#450a0a" />}
            {warnCount > 0 && <Chip count={warnCount} label="WARN" color="#fdba74" bg="#431407" />}
            {passCount > 0 && <Chip count={passCount} label="PASS" color="#86efac" bg="#052e16" />}
            {skipCount > 0 && <Chip count={skipCount} label="SKIP" color="#94a3b8" bg="#1e293b" />}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={triggerExpandAll} style={linkBtnStyle}>Expand all</button>
            <span style={{ color: '#334155' }}>·</span>
            <button onClick={triggerCollapseAll} style={linkBtnStyle}>Collapse all</button>
          </div>
        </div>

        {/* Sorted check cards */}
        {allChecks.map((entry) => (
          <ComplianceCheckCard
            key={`${entry.check.check_id}-${expandVersion}`}
            check={entry.check}
            annotatedImage={entry.annotatedImage}
            defaultExpanded={defaultExpandedFor(entry.check.status)}
          />
        ))}

        {/* AI summary — collapsible */}
        {result.llm_summary && (
          <div
            style={{
              background: '#1e293b',
              borderRadius: 10,
              padding: '12px 16px',
              border: '1px solid #334155',
            }}
          >
            <button
              onClick={() => setSummaryOpen((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                color: '#93c5fd',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{summaryOpen ? '▾' : '▸'}</span>
              AI Professional Summary
            </button>
            {summaryOpen && (
              <p
                style={{
                  marginTop: 10,
                  fontSize: 13,
                  color: '#cbd5e1',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {result.llm_summary}
              </p>
            )}
          </div>
        )}
      </div>
    </EvalErrorBoundary>
  );
}

function Chip({ count, label, color, bg }: { count: number; label: string; color: string; bg: string }) {
  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 99,
        border: `1px solid ${color}66`,
        letterSpacing: 0.4,
      }}
    >
      {count} {label}
    </span>
  );
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#64748b',
  fontSize: 11,
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
};
