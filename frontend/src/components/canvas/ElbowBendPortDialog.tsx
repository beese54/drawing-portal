import { useState } from 'react';
import { SYMBOL_PORTS, rotateOffset } from '../../utils/symbolPorts';

interface ElbowBendPortDialogProps {
  imageUrl: string;
  onConfirm: (upstreamPortIndex: number, rotation: number) => void;
  onCancel: () => void;
}

const BASE_PORTS = SYMBOL_PORTS['elbow_bend'] ?? [];

const DIAGRAM_SIZE = 200;
const IMAGE_SIZE = 140;
const CENTER = DIAGRAM_SIZE / 2;
const SCALE = IMAGE_SIZE / 48;

function portScreenPos(portIndex: number, rotation: number) {
  const port = BASE_PORTS[portIndex];
  const r = rotateOffset(port.offsetX * SCALE, port.offsetY * SCALE, rotation);
  return { x: CENTER + r.x, y: CENTER + r.y };
}

export function ElbowBendPortDialog({ imageUrl, onConfirm, onCancel }: ElbowBendPortDialogProps) {
  const [rotation, setRotation] = useState(0);
  const [hoveredPort, setHoveredPort] = useState<number | null>(null);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 10,
        padding: '24px 28px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        minWidth: 300,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: '#1a3a5c' }}>
          Elbow Bend Setup
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
          Choose orientation, then click a port to set it as the <strong>inlet</strong>.
        </div>

        {/* Rotation selector */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => setRotation((prev) => (prev + 270) % 360)}
            title="Rotate 90° clockwise"
            style={{
              width: 44, height: 44,
              borderRadius: 6,
              border: '1px solid #ccc',
              background: '#f5f5f5',
              color: '#1a3a5c',
              cursor: 'pointer',
              fontSize: 22, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ↻
          </button>
        </div>

        {/* Diagram: actual symbol image + port dots */}
        <div style={{ position: 'relative', width: DIAGRAM_SIZE, height: DIAGRAM_SIZE, margin: '0 auto 20px', userSelect: 'none' }}>
          <img
            src={imageUrl}
            width={IMAGE_SIZE}
            height={IMAGE_SIZE}
            style={{
              position: 'absolute',
              left: CENTER - IMAGE_SIZE / 2,
              top: CENTER - IMAGE_SIZE / 2,
              transform: `rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              pointerEvents: 'none',
            }}
          />

          {BASE_PORTS.map((_, i) => {
            const pos = portScreenPos(i, rotation);
            const isHovered = hoveredPort === i;
            return (
              <button
                key={i}
                onClick={() => onConfirm(i, rotation)}
                onMouseEnter={() => setHoveredPort(i)}
                onMouseLeave={() => setHoveredPort(null)}
                onTouchStart={() => setHoveredPort(i)}
                title="Click to set as inlet"
                style={{
                  position: 'absolute',
                  left: pos.x - 16,
                  top: pos.y - 16,
                  width: 32, height: 32,
                  borderRadius: '50%',
                  border: isHovered ? '2px solid #007bff' : '2px solid #aaa',
                  background: isHovered ? '#007bff' : '#f0f4ff',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                  color: isHovered ? '#fff' : '#555',
                  transition: 'all 0.15s',
                  zIndex: 1,
                }}
              >
                {isHovered ? 'IN' : '●'}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, color: '#999', marginBottom: 14 }}>
          Tap a port to set it as inlet — the other becomes outlet
        </div>

        <button
          onClick={onCancel}
          style={{
            padding: '7px 20px',
            border: '1px solid #ccc',
            borderRadius: 6,
            background: '#f5f5f5',
            cursor: 'pointer',
            fontSize: 13,
            color: '#555',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
