import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasStore } from '../../store/canvasStore';
import { calcTankCapacityLitres } from '../../types';
import { WaterTankPropertiesModal } from '../canvas/WaterTankPropertiesModal';

export function WaterTankPropertiesPanel() {
  const { selectedId, elements } = useCanvasStore();
  const [showModal, setShowModal] = useState(false);

  const tank = elements.find((el) => el.id === selectedId && el.symbolId === 'water_tank');
  if (!tank) return null;

  const props = tank.tankProperties ?? {};
  const capacityL = calcTankCapacityLitres(props);

  const checklist: { label: string; ok: boolean; hint: string }[] = [
    {
      label: 'Inlet pipe size indicated',
      ok: props.inletPipeDiameterM != null,
      hint: 'Set inlet pipe diameter in advanced details',
    },
    {
      label: 'Overflow pipe size indicated',
      ok: props.overflowPipeDiameterM != null,
      hint: 'Set overflow pipe diameter in advanced details',
    },
    {
      label: 'Overflow warning pipe / alarm indicated',
      ok: props.warningPipeDiameterM != null,
      hint: 'Set warning pipe diameter in advanced details',
    },
    {
      label: 'Effective capacity annotated',
      ok: capacityL !== null,
      hint: 'Fill in Inlet AMSL, Overflow Ø, Floor Level, Outlet→Base, Length and Width',
    },
  ];

  return (
    <>
      <div style={{
        border: '1px solid #d1d5db', borderRadius: 6,
        padding: '10px 12px', marginBottom: 14, background: '#f8fafc',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: '#555',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
        }}>
          Water Tank Checklist
        </div>

        {checklist.map(({ label, ok, hint }) => (
          <button
            key={label}
            title={ok ? undefined : hint}
            onClick={ok ? undefined : () => setShowModal(true)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 7,
              width: '100%',
              background: ok ? '#f0fdf4' : '#fff7ed',
              border: `1px solid ${ok ? '#bbf7d0' : '#fed7aa'}`,
              borderRadius: 5, padding: '5px 8px', marginBottom: 4,
              cursor: ok ? 'default' : 'pointer', textAlign: 'left',
            }}
          >
            <span style={{
              fontSize: 13, lineHeight: 1, marginTop: 1,
              color: ok ? '#16a34a' : '#ea580c', flexShrink: 0,
            }}>
              {ok ? '✓' : '✗'}
            </span>
            <span style={{ fontSize: 11, color: ok ? '#166534' : '#9a3412', lineHeight: 1.4 }}>
              {label}
              {!ok && <span style={{ marginLeft: 4, opacity: 0.6, fontSize: 10 }}>— click to fix</span>}
            </span>
          </button>
        ))}

        <button
          onClick={() => setShowModal(true)}
          style={{
            width: '100%', marginTop: 6, padding: '7px 0',
            borderRadius: 5, border: '1px solid #2563eb',
            background: '#eff6ff', color: '#1d4ed8',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Edit Advanced Details…
        </button>
      </div>

      {showModal && createPortal(
        <WaterTankPropertiesModal tankId={tank.id} onClose={() => setShowModal(false)} />,
        document.body,
      )}
    </>
  );
}
