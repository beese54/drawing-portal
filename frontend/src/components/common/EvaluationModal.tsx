import type { EvaluationResponse } from '../../types/evaluation';
import { EvaluationReport } from '../chat/EvaluationReport';

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
          width: 'min(720px, calc(100vw - 32px))',
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
              WSI Compliance Evaluation
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              PUB WSI Checklist (Landed) · Sections 3 – 7
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
        <div style={{ overflowY: 'auto', padding: '4px 20px 20px', flex: 1 }}>
          <EvaluationReport result={result} />
        </div>
      </div>
    </div>
  );
}
