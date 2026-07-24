import { useCanvasStore } from '../../store/canvasStore';
import { getPipeDrawStyle } from '../canvas/PipeElement';

interface PipeColorPanelProps {
  pipeIds: string[];
}

/** Neutral placeholder swatch color shown when the selected pipes have different colors —
 *  a native <input type="color"> always needs some valid hex value, but this one is purely
 *  cosmetic (it doesn't determine anything until the user actually picks a new color). */
const MIXED_SWATCH_COLOR = '#808080';

export function PipeColorPanel({ pipeIds }: PipeColorPanelProps) {
  const pipes = useCanvasStore((s) => s.pipes);
  const setPipesCustomColor = useCanvasStore((s) => s.setPipesCustomColor);

  const selected = pipes.filter((p) => pipeIds.includes(p.id));
  if (selected.length === 0) return null;

  const colorSet = new Set(selected.map((p) => p.customColor ?? '__auto__'));
  const mixed = colorSet.size > 1;
  const current = !mixed ? selected[0].customColor : undefined;
  const swatchValue = mixed ? MIXED_SWATCH_COLOR : (current ?? getPipeDrawStyle(selected[0].pipeType, false).color);
  const canReset = selected.some((p) => p.customColor !== undefined);

  return (
    <div style={{
      border: '1px solid #d1d5db', borderRadius: 6,
      padding: '10px 12px', marginBottom: 14, background: '#f8fafc',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#555',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
      }}>
        Pipe Color{selected.length > 1 ? ` (${selected.length} selected)` : ''}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          value={swatchValue}
          title={mixed ? 'Selected pipes have different colors' : 'Pipe color'}
          onChange={(e) => setPipesCustomColor(pipeIds, e.target.value)}
          style={{ width: 36, height: 28, padding: 0, border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}
        />
        <button
          onClick={() => setPipesCustomColor(pipeIds, null)}
          disabled={!canReset}
          style={{
            padding: '5px 10px', fontSize: 11,
            borderRadius: 5, border: '1px solid #d1d5db',
            background: canReset ? '#fff' : '#f1f5f9',
            color: canReset ? '#334155' : '#9ca3af',
            cursor: canReset ? 'pointer' : 'default',
          }}
        >
          Automatic
        </button>
      </div>
    </div>
  );
}
