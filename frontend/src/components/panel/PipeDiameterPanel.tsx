import { useState, useEffect } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import { selectPipesByIds, computeMixedValue } from './mixedPipeValue';

interface PipeDiameterPanelProps {
  pipeIds: string[];
}

/** Placeholder shown in the text field when the selected pipes have different labels —
 *  distinguishes "nothing set" (empty) from "multiple different values" (mixed). */
const MIXED_PLACEHOLDER = 'Mixed';

export function PipeDiameterPanel({ pipeIds }: PipeDiameterPanelProps) {
  const pipes = useCanvasStore((s) => s.pipes);
  const setPipesDiameterLabel = useCanvasStore((s) => s.setPipesDiameterLabel);

  const selected = selectPipesByIds(pipeIds, pipes);
  const { mixed, current: mixedCurrent } = computeMixedValue(
    selected,
    (p) => p.diameterLabel ?? '',
    (p) => p.diameterLabel ?? '',
  );
  const current = mixedCurrent ?? '';

  const [draft, setDraft] = useState(current);
  useEffect(() => setDraft(current), [current, pipeIds.join(',')]);

  if (selected.length === 0) return null;

  const commit = () => {
    // Strip a leading Ø the user may have typed themselves — it's always added at
    // display time (canvas + PDF), so keeping it in the stored value would double it up.
    const trimmed = draft.trim().replace(/^Ø\s*/, '');
    setPipesDiameterLabel(pipeIds, trimmed.length > 0 ? trimmed : null);
  };

  return (
    <div style={{
      border: '1px solid #d1d5db', borderRadius: 6,
      padding: '10px 12px', marginBottom: 14, background: '#f8fafc',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#555',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
      }}>
        Pipe Diameter{selected.length > 1 ? ` (${selected.length} selected)` : ''}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#555' }}>Ø</span>
        <input
          type="text"
          value={draft}
          placeholder={mixed ? MIXED_PLACEHOLDER : '20mm'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setDraft(current);
          }}
          style={{
            flex: 1, boxSizing: 'border-box', padding: '5px 8px',
            fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4,
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
        Shown beside the pipe's flow arrow, prefixed with Ø. Leave blank to hide.
      </div>
    </div>
  );
}
