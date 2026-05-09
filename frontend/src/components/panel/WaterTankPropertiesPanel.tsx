import { useState } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import {
  TANK_MATERIAL_OPTIONS,
  calcTankCapacityLitres,
  calcWaterLevelAmsl,
  type TankMaterial,
} from '../../types';
import { WaterTankPropertiesModal } from '../canvas/WaterTankPropertiesModal';

/**
 * Right-sidebar quick-edit panel for the selected Water Tank.
 * Mirrors PipePropertiesPanel.tsx in spirit and styling.
 *
 * Quick fields shown here:
 *   - Material
 *   - Pressure Vessel? (toggle)
 *   - Effective Capacity (read-only, derived from L × W × H in the modal)
 *   - "Edit Advanced Details…" → opens WaterTankPropertiesModal
 */
export function WaterTankPropertiesPanel() {
  const { selectedId, elements, updateTankProperties } = useCanvasStore();
  const [showModal, setShowModal] = useState(false);

  const tank = elements.find((el) => el.id === selectedId && el.symbolId === 'water_tank');
  if (!tank) return null;

  const props = tank.tankProperties ?? {};
  const update = (patch: Parameters<typeof updateTankProperties>[1]) =>
    updateTankProperties(tank.id, patch);

  const capacityL = calcTankCapacityLitres(props);
  const waterLevelAmsl = calcWaterLevelAmsl(props);

  const normalizeMaterial = (raw: string): TankMaterial | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const cleaned = trimmed.toLowerCase().replace(/\s+/g, '_');
    const matched = TANK_MATERIAL_OPTIONS.find(
      (opt) => opt.value.toLowerCase() === cleaned
        || opt.label.toLowerCase() === trimmed.toLowerCase()
    );
    return matched ? matched.value : trimmed;
  };

  return (
    <>
      <div style={{
        border: '1px solid #d1d5db',
        borderRadius: 6,
        padding: '10px 12px',
        marginBottom: 14,
        background: '#f8fafc',
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#555',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 10,
        }}>
          Water Tank Properties
        </div>

        {/* Material */}
        <label style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 4 }}>
          Material
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <input
            type="text"
            value={props.material ?? ''}
            placeholder="e.g. FRP, GRP, SS_316"
            list="tank-material-options"
            onChange={(e) => update({ material: normalizeMaterial(e.target.value) })}
            style={{
              flex: 1,
              padding: '5px 8px',
              border: '1px solid #ccc',
              borderRadius: 4,
              fontSize: 13,
              background: '#fff',
              color: '#222',
              outline: 'none',
            }}
          />
          <datalist id="tank-material-options">
            {TANK_MATERIAL_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </datalist>
        </div>

        {/* Pressure Vessel toggle */}
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: '#444',
          marginBottom: 12,
          cursor: 'pointer',
          userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={props.pressureVesselPresent ?? false}
            onChange={(e) => update({ pressureVesselPresent: e.target.checked })}
            style={{ margin: 0 }}
          />
          Pressure Vessel Present
        </label>

        {/* Effective Capacity (read-only) */}
        <label style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 4 }}>
          Effective Capacity
        </label>
        <div style={{
          padding: '5px 8px',
          border: '1px dashed #cbd5e1',
          borderRadius: 4,
          background: '#f1f5f9',
          fontSize: 13,
          color: capacityL === null ? '#94a3b8' : '#0f172a',
          marginBottom: 12,
          fontFamily: 'monospace',
        }}>
          {capacityL === null ? 'Set L × W × H in advanced details' : `${capacityL.toLocaleString()} L`}
        </div>

        {/* Water Level (read-only) */}
        <label style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 4 }}>
          Water Level AMSL
        </label>
        <div style={{
          padding: '5px 8px',
          border: '1px dashed #93c5fd',
          borderRadius: 4,
          background: '#eff6ff',
          fontSize: 13,
          color: waterLevelAmsl === null ? '#94a3b8' : '#1d4ed8',
          marginBottom: 12,
          fontFamily: 'monospace',
          fontWeight: 600,
        }}>
          {waterLevelAmsl === null ? 'Set Inlet AMSL + Overflow Ø' : `${waterLevelAmsl} m AMSL`}
        </div>

        {/* Edit Advanced Details */}
        <button
          onClick={() => setShowModal(true)}
          style={{
            width: '100%',
            padding: '7px 0',
            borderRadius: 5,
            border: '1px solid #2563eb',
            background: '#eff6ff',
            color: '#1d4ed8',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Edit Advanced Details…
        </button>
      </div>

      {showModal && (
        <WaterTankPropertiesModal
          tankId={tank.id}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
