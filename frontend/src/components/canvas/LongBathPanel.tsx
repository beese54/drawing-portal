import { useState, useEffect } from 'react';
import { useCanvasStore } from '../../store/canvasStore';

const SYMBOL_SIZE = 48;

interface LongBathPanelProps {
  elementId: string;
  x: number;
  y: number;
  currentCapacityL?: number;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  zIndex: 10,
  background: 'rgba(255,255,255,0.97)',
  borderRadius: 6,
  padding: '8px 10px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
  border: '1px solid #ccc',
  pointerEvents: 'all',
  minWidth: 160,
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#666',
  textAlign: 'center',
  letterSpacing: '0.05em',
  userSelect: 'none',
  marginBottom: 2,
};

export function LongBathPanel({ elementId, x, y, currentCapacityL }: LongBathPanelProps) {
  const updateLongBathCapacity = useCanvasStore((s) => s.updateLongBathCapacity);
  const [inputValue, setInputValue] = useState(currentCapacityL !== undefined ? String(currentCapacityL) : '');

  useEffect(() => {
    setInputValue(currentCapacityL !== undefined ? String(currentCapacityL) : '');
  }, [elementId, currentCapacityL]);

  const commit = () => {
    const v = parseFloat(inputValue);
    if (!isNaN(v) && v > 0) updateLongBathCapacity(elementId, v);
  };

  const posStyle: React.CSSProperties = {
    ...panelStyle,
    left: x + SYMBOL_SIZE / 2 + 22,
    top: y - SYMBOL_SIZE / 2,
  };

  return (
    <div style={posStyle}>
      <div style={labelStyle}>LONG BATH CAPACITY</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          min={1}
          step={1}
          value={inputValue}
          onChange={(e) => { e.stopPropagation(); setInputValue(e.target.value); }}
          onBlur={commit}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); }}
          onClick={(e) => e.stopPropagation()}
          placeholder="e.g. 200"
          style={{
            width: 80,
            padding: '4px 6px',
            borderRadius: 4,
            border: '1px solid #ddd',
            fontSize: 12,
            color: '#333',
          }}
        />
        <span style={{ fontSize: 11, color: '#555', userSelect: 'none' }}>L</span>
      </div>
      {currentCapacityL !== undefined && (
        <div style={{
          fontSize: 10,
          color: currentCapacityL > 250 ? '#b45309' : '#166534',
          fontWeight: 600,
          textAlign: 'center',
        }}>
          {currentCapacityL > 250 ? `⚠ ${currentCapacityL} L > 250 L limit` : `✓ ${currentCapacityL} L — within limit`}
        </div>
      )}
    </div>
  );
}
