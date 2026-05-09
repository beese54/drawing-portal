import type { EvaluationResponse } from '../../types/evaluation';
import { ComplianceCheckCard } from '../chat/ComplianceCheckCard';
import { HydraulicReportCard } from '../chat/HydraulicReportCard';

interface Props {
  result: EvaluationResponse;
  onClose: () => void;
}

export function EvaluationModal({ result, onClose }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0f172a',
          borderRadius: 12,
          width: 'min(640px, calc(100vw - 32px))',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
          border: '1px solid #1e293b',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
              Compliance Evaluation
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Reg 28 · Supply Mode · MWELS · Tank/Pump · Hydraulics
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 13,
              padding: '4px 12px',
            }}
          >
            Close
          </button>
        </div>

        {/* Scrollable results */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
          <ComplianceCheckCard check={result.check1_backflow} />
          <ComplianceCheckCard check={result.check2_supply_mode} />
          <ComplianceCheckCard check={result.check3_water_efficiency} />
          <ComplianceCheckCard check={result.check4_tank_pump} />
          <ComplianceCheckCard check={result.check5_long_bath} />
          <HydraulicReportCard report={result.hydraulic_report} llmUsage={null} />
        </div>
      </div>
    </div>
  );
}
