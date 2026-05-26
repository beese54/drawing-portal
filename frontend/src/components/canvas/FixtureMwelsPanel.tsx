import { useCanvasStore } from '../../store/canvasStore';
import { FIXTURE_MWELS_CATEGORY, AMBIGUOUS_TAP_OPTIONS, WATER_FITTING_TYPES, SCHEMATIC_SYMBOL_PX } from '../../types';

const TICK = '✓';

interface FixtureMwelsPanelProps {
  elementId: string;
  symbolId: string;
  x: number;
  y: number;
  currentFittingTypeId?: string;
  currentEfficiencyRating?: 2 | 3;
  elementHalfWidthVp?: number;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  zIndex: 10,
  background: 'rgba(255,255,255,0.97)',
  borderRadius: 6,
  padding: '6px 8px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
  border: '1px solid #ccc',
  pointerEvents: 'all',
  alignItems: 'stretch',
  minWidth: 150,
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#666',
  textAlign: 'center',
  marginBottom: 2,
  letterSpacing: '0.05em',
  userSelect: 'none',
};

export function FixtureMwelsPanel({
  elementId,
  symbolId,
  x,
  y,
  currentFittingTypeId,
  currentEfficiencyRating,
  elementHalfWidthVp = SCHEMATIC_SYMBOL_PX / 2,
}: FixtureMwelsPanelProps) {
  const updateFittingType     = useCanvasStore((s) => s.updateFittingType);
  const updateEfficiencyRating = useCanvasStore((s) => s.updateEfficiencyRating);

  const fixedCategory = FIXTURE_MWELS_CATEGORY[symbolId];
  const isAmbiguous   = fixedCategory === null;

  // For fixed-category symbols, resolve the display name from WATER_FITTING_TYPES
  const categoryLabel = fixedCategory
    ? (WATER_FITTING_TYPES.find((t) => t.id === fixedCategory)?.label ?? fixedCategory)
    : null;

  const posStyle: React.CSSProperties = {
    ...panelStyle,
    left: x + elementHalfWidthVp + 22,
    top:  y - elementHalfWidthVp,
  };

  return (
    <div style={posStyle}>
      <div style={{ ...labelStyle, fontWeight: 700, color: '#1a3a5c', fontSize: 10 }}>MWELS</div>

      {isAmbiguous ? (
        <>
          <div style={labelStyle}>FITTING TYPE</div>
          <select
            value={currentFittingTypeId ?? ''}
            onChange={(e) => { e.stopPropagation(); updateFittingType(elementId, e.target.value); }}
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: '4px 6px',
              borderRadius: 4,
              border: '1px solid #ddd',
              fontSize: 11,
              color: currentFittingTypeId ? '#333' : '#999',
              cursor: 'pointer',
              background: '#fff',
              marginBottom: 6,
            }}
          >
            {!currentFittingTypeId && <option value="">— select type —</option>}
            {AMBIGUOUS_TAP_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </>
      ) : (
        <div style={{
          fontSize: 10,
          color: '#374151',
          background: '#f3f4f6',
          borderRadius: 4,
          padding: '3px 6px',
          textAlign: 'center',
          marginBottom: 4,
          userSelect: 'none',
        }}>
          {categoryLabel}
        </div>
      )}

      <div style={labelStyle}>WATER EFFICIENCY</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {([2, 3] as const).map((n) => (
          <button
            key={n}
            onClick={(e) => { e.stopPropagation(); updateEfficiencyRating(elementId, n); }}
            style={{
              flex: 1,
              padding: '4px 0',
              borderRadius: 4,
              border: currentEfficiencyRating === n ? '2px solid #1a3a5c' : '1px solid #ddd',
              background: currentEfficiencyRating === n ? '#1a3a5c' : '#f5f5f5',
              color: currentEfficiencyRating === n ? '#fff' : '#333',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'Arial, sans-serif',
            }}
          >
            {n} {TICK.repeat(n)}
          </button>
        ))}
      </div>

      {!currentEfficiencyRating && (
        <div style={{ fontSize: 9, color: '#b45309', textAlign: 'center', marginTop: 2, userSelect: 'none' }}>
          Set tick rating for MWELS check
        </div>
      )}
    </div>
  );
}
