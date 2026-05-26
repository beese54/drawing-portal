import { useCanvasStore } from '../../store/canvasStore';
import { CLOCKWISE_SYMBOL_IDS, FLIP_ONLY_SYMBOL_IDS, SCHEMATIC_SYMBOL_PX } from '../../types';

interface RotationPanelProps {
  elementId: string;
  symbolId: string;
  x: number;
  y: number;
  currentRotation: number;
  currentScaleX?: number;
  elementHalfWidthVp?: number;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  zIndex: 10,
  background: 'rgba(255,255,255,0.97)',
  borderRadius: 6,
  padding: 4,
  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
  border: '1px solid #ccc',
  pointerEvents: 'all',
  alignItems: 'center',
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#666',
  textAlign: 'center',
  marginBottom: 2,
  letterSpacing: '0.05em',
  userSelect: 'none',
};

const btnStyle: React.CSSProperties = {
  width: 36,
  height: 32,
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
  color: '#444',
  cursor: 'pointer',
  fontSize: 18,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'sans-serif',
  lineHeight: 1,
};

export function RotationPanel({ elementId, symbolId, x, y, currentRotation, currentScaleX = 1, elementHalfWidthVp = SCHEMATIC_SYMBOL_PX / 2 }: RotationPanelProps) {
  const updateRotation = useCanvasStore((s) => s.updateElementRotation);
  const updateScaleX = useCanvasStore((s) => s.updateElementScaleX);

  const posStyle: React.CSSProperties = {
    ...panelStyle,
    left: x + elementHalfWidthVp + 22,
    top: y - elementHalfWidthVp,
  };

  if ((CLOCKWISE_SYMBOL_IDS as readonly string[]).includes(symbolId)) {
    const displayDeg = (360 - currentRotation) % 360;
    return (
      <div style={posStyle}>
        <div style={labelStyle}>ROTATE</div>
        <button
          onClick={(e) => { e.stopPropagation(); updateRotation(elementId, (currentRotation + 270) % 360); }}
          title="Rotate 90° clockwise"
          style={btnStyle}
        >
          ↻
        </button>
        <div style={{ fontSize: 9, color: '#888', textAlign: 'center', userSelect: 'none' }}>
          {displayDeg}°
        </div>
      </div>
    );
  }

  if ((FLIP_ONLY_SYMBOL_IDS as readonly string[]).includes(symbolId)) {
    // water_tank, water_heater, water_meter use scaleX=-1 for mirror; others use rotation=180
    const isWaterTank = symbolId === 'water_tank' || symbolId === 'water_heater' || symbolId === 'water_meter' || symbolId === 'pump';
    return (
      <div style={posStyle}>
        <div style={labelStyle}>FLIP</div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isWaterTank) {
              updateScaleX(elementId, currentScaleX === 1 ? -1 : 1);
            } else {
              updateRotation(elementId, currentRotation === 0 ? 180 : 0);
            }
          }}
          title="Flip left / right"
          style={btnStyle}
        >
          ↔
        </button>
      </div>
    );
  }

  // gate_valve: original 4-arrow UI
  const DIRECTIONS = [
    { label: '↑', name: 'N', rotation: 270 },
    { label: '→', name: 'E', rotation: 0 },
    { label: '↓', name: 'S', rotation: 90 },
    { label: '←', name: 'W', rotation: 180 },
  ] as const;

  return (
    <div style={posStyle}>
      <div style={labelStyle}>ROTATE</div>
      {DIRECTIONS.map(({ label, name, rotation }) => {
        const isActive = currentRotation === rotation;
        return (
          <button
            key={name}
            onClick={(e) => { e.stopPropagation(); updateRotation(elementId, rotation); }}
            title={name}
            style={{
              ...btnStyle,
              width: 30,
              height: 26,
              fontSize: 14,
              border: `1px solid ${isActive ? '#0066cc' : '#ddd'}`,
              background: isActive ? '#0066cc' : '#fff',
              color: isActive ? '#fff' : '#444',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
