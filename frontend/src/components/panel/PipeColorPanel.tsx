import { useCanvasStore } from '../../store/canvasStore';
import { useUiStore } from '../../store/uiStore';
import { getPipeDrawStyle } from '../canvas/PipeElement';
import { PipeType } from '../../types';

interface PipeColorPanelProps {
  pipeIds: string[];
}

/** Neutral placeholder swatch color shown when the selected pipes have different colors —
 *  a native <input type="color"> always needs some valid hex value, but this one is purely
 *  cosmetic (it doesn't determine anything until the user actually picks a new color). */
const MIXED_SWATCH_COLOR = '#808080';

const PIPE_TYPE_LABEL: Record<PipeType, string> = { cold: 'cold', hot: 'hot', generic: 'generic' };

export function PipeColorPanel({ pipeIds }: PipeColorPanelProps) {
  const pipes = useCanvasStore((s) => s.pipes);
  const setPipesCustomColor = useCanvasStore((s) => s.setPipesCustomColor);
  const pipeColorDefaults = useUiStore((s) => s.pipeColorDefaults);
  const recentPipeColors = useUiStore((s) => s.recentPipeColors);
  const setPipeColorDefault = useUiStore((s) => s.setPipeColorDefault);
  const resetPipeColorDefault = useUiStore((s) => s.resetPipeColorDefault);
  const addRecentPipeColor = useUiStore((s) => s.addRecentPipeColor);

  const selected = pipes.filter((p) => pipeIds.includes(p.id));
  if (selected.length === 0) return null;

  const colorSet = new Set(selected.map((p) => p.customColor ?? '__auto__'));
  const mixed = colorSet.size > 1;
  const current = !mixed ? selected[0].customColor : undefined;
  const swatchValue = mixed ? MIXED_SWATCH_COLOR : (current ?? getPipeDrawStyle(selected[0].pipeType, false).color);
  const canReset = selected.some((p) => p.customColor !== undefined);

  // Picking a color both recolors the current selection AND becomes the new
  // default for every future pipe of that type (see useCanvasInteraction.ts's
  // pipe-construction site) — the main swatch and the recent-colors row below
  // share this so they behave identically.
  function applyColor(color: string) {
    setPipesCustomColor(pipeIds, color);
    for (const t of new Set(selected.map((p) => p.pipeType))) setPipeColorDefault(t, color);
    addRecentPipeColor(color);
  }

  const selectedTypesWithDefault = [...new Set(selected.map((p) => p.pipeType))].filter((t) => pipeColorDefaults[t] !== undefined);

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
          onChange={(e) => applyColor(e.target.value)}
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

      {recentPipeColors.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 10, color: '#888' }}>Recent:</span>
          {recentPipeColors.map((color) => (
            <button
              key={color}
              onClick={() => applyColor(color)}
              title={color}
              style={{
                width: 18, height: 18, padding: 0, borderRadius: 3,
                border: '1px solid #d1d5db', background: color, cursor: 'pointer',
              }}
            />
          ))}
        </div>
      )}

      {selectedTypesWithDefault.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {selectedTypesWithDefault.map((t) => (
            <button
              key={t}
              onClick={() => resetPipeColorDefault(t)}
              style={{
                alignSelf: 'flex-start', padding: 0, border: 'none', background: 'none',
                color: '#0066cc', fontSize: 10.5, cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Reset default {PIPE_TYPE_LABEL[t]} pipe color
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
