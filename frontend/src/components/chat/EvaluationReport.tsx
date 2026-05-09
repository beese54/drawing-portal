import { useState, Component, type ReactNode } from 'react';
import type { EvaluationResponse } from '../../types/evaluation';
import { ComplianceCheckCard } from './ComplianceCheckCard';
import { HydraulicReportCard } from './HydraulicReportCard';

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

interface Props {
  result: EvaluationResponse;
}

export function EvaluationReport({ result }: Props) {
  const [summaryOpen, setSummaryOpen] = useState(false);

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
          marginBottom: 12,
          paddingBottom: 6,
          borderBottom: '1px solid #334155',
        }}
      >
        Compliance Evaluation Results
      </div>

      {/* Check 1 — Reg 28 backflow */}
      <ComplianceCheckCard
        check={result.check1_backflow}
        annotatedImage={result.annotated_image_b64}
      />

      {/* Check 2 — Supply mode */}
      <ComplianceCheckCard check={result.check2_supply_mode} />

      {/* Check 3 — MWELS */}
      <ComplianceCheckCard check={result.check3_water_efficiency} />

      {/* Check 4 — Tank / pump */}
      <ComplianceCheckCard check={result.check4_tank_pump} />

      {/* Check 5 — Long bath */}
      <ComplianceCheckCard check={result.check5_long_bath} />

      {/* Hydraulic report */}
      <HydraulicReportCard report={result.hydraulic_report} llmUsage={result.llm_usage} />

      {/* LLM summary — collapsible */}
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
