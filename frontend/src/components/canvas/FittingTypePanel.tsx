import { useCanvasStore } from '../../store/canvasStore';
import { WATER_FITTING_TYPES, SCHEMATIC_SYMBOL_PX } from '../../types';
const TICK = '✓';

interface FittingTypePanelProps {
  elementId: string;
  x: number;
  y: number;
  currentFittingTypeId: string;
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
  minWidth: 140,
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#666',
  textAlign: 'center',
  marginBottom: 2,
  letterSpacing: '0.05em',
  userSelect: 'none',
};

export function FittingTypePanel({ elementId, x, y, currentFittingTypeId, currentEfficiencyRating, elementHalfWidthVp = SCHEMATIC_SYMBOL_PX / 2 }: FittingTypePanelProps) {
  const updateFittingType    = useCanvasStore((s) => s.updateFittingType);
  const updateEfficiencyRating = useCanvasStore((s) => s.updateEfficiencyRating);

  const posStyle: React.CSSProperties = {
    ...panelStyle,
    left: x + elementHalfWidthVp + 22,
    top: y - elementHalfWidthVp,
  };

  return (
    <div style={posStyle}>
      <div style={labelStyle}>FITTING TYPE</div>
      <select
        value={currentFittingTypeId}
        onChange={(e) => {
          e.stopPropagation();
          updateFittingType(elementId, e.target.value);
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: '4px 6px',
          borderRadius: 4,
          border: '1px solid #ddd',
          fontSize: 11,
          color: '#333',
          cursor: 'pointer',
          background: '#fff',
          marginBottom: 6,
        }}
      >
        {WATER_FITTING_TYPES.map((type) => (
          <option key={type.id} value={type.id}>
            {type.code} — {type.label}
          </option>
        ))}
      </select>

      <div style={labelStyle}>WATER EFFICIENCY RATING</div>
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
    </div>
  );
}
