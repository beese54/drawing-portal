import { useState } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import {
  TANK_MATERIAL_OPTIONS,
  calcTankCapacityLitres,
  calcWaterLevelAmsl,
  type TankProperties,
} from '../../types';

interface Props {
  tankId: string;
  onClose: () => void;
}

type NumKey =
  | 'lengthM' | 'widthM' | 'heightM' | 'floorLevelMAmsl'
  | 'inletPipeDiameterM' | 'inletPipeMAmsl'
  | 'outletPipeDiameterM' | 'distanceOutletToBaseM'
  | 'overflowPipeDiameterM' | 'overflowPipeMAmsl'
  | 'warningPipeDiameterM' | 'warningPipeMAmsl'
  | 'supportHeightM';

/**
 * Advanced details modal for a Water Tank, mirroring PipePropertiesModal.tsx.
 *
 * Sections:
 *   Dimensions (length × width × height, floor-level AMSL)
 *   Inlet     (pipe diameter, AMSL)
 *   Outlet    (pipe diameter, distance outlet→base)
 *   Overflow  (pipe diameter, AMSL)
 *   Warning   (pipe diameter, AMSL)
 *   Supports  (height, default 0.6 m)
 *
 * Effective capacity is shown live, computed from L × W × H.
 */
export function WaterTankPropertiesModal({ tankId, onClose }: Props) {
  const tank = useCanvasStore((s) =>
    s.elements.find((el) => el.id === tankId && el.symbolId === 'water_tank')
  );
  const updateTankProperties = useCanvasStore((s) => s.updateTankProperties);

  const [draft, setDraft] = useState<TankProperties>({ ...(tank?.tankProperties ?? {}) });

  if (!tank) return null;

  const setField = (key: NumKey, raw: string) => {
    if (raw === '') {
      const next = { ...draft };
      delete next[key];
      setDraft(next);
      return;
    }
    const val = parseFloat(raw);
    if (isNaN(val)) return;
    setDraft({ ...draft, [key]: Math.max(0, Math.round(val * 10000) / 10000) });
  };

  const capacityL = calcTankCapacityLitres(draft);
  const waterLevelAmsl = calcWaterLevelAmsl(draft);

  const handleSave = () => {
    updateTankProperties(tankId, draft);
    onClose();
  };

  const handleCancel = () => onClose();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 1000,
        overflowY: 'auto',
        padding: '24px 0',
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 10,
        padding: '22px 26px',
        width: 'min(460px, calc(100vw - 48px))',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#111' }}>
          Water Tank — Advanced Details
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#666' }}>
          All elevations in metres AMSL. Diameters and dimensions in metres.
        </p>

        {/* Material */}
        <label style={LBL}>Material</label>
        <select
          value={draft.material ?? ''}
          onChange={(e) => setDraft({ ...draft, material: e.target.value || undefined })}
          style={INPUT}
        >
          <option value="">— Select —</option>
          {TANK_MATERIAL_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {/* Pressure Vessel */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: '#444', margin: '12px 0 8px',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={draft.pressureVesselPresent ?? false}
            onChange={(e) => setDraft({ ...draft, pressureVesselPresent: e.target.checked })}
            style={{ margin: 0 }}
          />
          Pressure Vessel Present
        </label>

        {/* Sunken Tank */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: '#444', margin: '0 0 16px',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={draft.isSunkenTank ?? false}
            onChange={(e) => setDraft({ ...draft, isSunkenTank: e.target.checked })}
            style={{ margin: 0 }}
          />
          Sunken / Detention Tank
        </label>

        {/* Dimensions */}
        <Section title="Dimensions">
          <Row3>
            <NumField label="Length"  unit="m" value={draft.lengthM}  onChange={(v) => setField('lengthM', v)} />
            <NumField label="Width"   unit="m" value={draft.widthM}   onChange={(v) => setField('widthM', v)} />
            <NumField label="Height"  unit="m" value={draft.heightM}  onChange={(v) => setField('heightM', v)} />
          </Row3>
          <NumField
            label="Floor Level"
            unit="m AMSL"
            value={draft.floorLevelMAmsl}
            onChange={(v) => setField('floorLevelMAmsl', v)}
          />
          <div style={{
            marginTop: 8,
            padding: '6px 10px',
            border: '1px dashed #cbd5e1',
            borderRadius: 5,
            background: '#f1f5f9',
            fontSize: 12,
            color: capacityL === null ? '#94a3b8' : '#0f172a',
            fontFamily: 'monospace',
          }}>
            Effective Capacity:&nbsp;
            <b>{capacityL === null ? '— L (set L, W, H)' : `${capacityL.toLocaleString()} L`}</b>
          </div>
        </Section>

        {/* Inlet */}
        <Section title="Inlet">
          <Row2>
            <NumField label="Pipe Diameter" unit="m"      value={draft.inletPipeDiameterM} onChange={(v) => setField('inletPipeDiameterM', v)} />
            <NumField label="Pipe Level"    unit="m AMSL" value={draft.inletPipeMAmsl}     onChange={(v) => setField('inletPipeMAmsl', v)} />
          </Row2>
        </Section>

        {/* Outlet */}
        <Section title="Outlet">
          <Row2>
            <NumField label="Pipe Diameter"        unit="m" value={draft.outletPipeDiameterM}    onChange={(v) => setField('outletPipeDiameterM', v)} />
            <NumField label="Outlet → Base"        unit="m" value={draft.distanceOutletToBaseM} onChange={(v) => setField('distanceOutletToBaseM', v)} />
          </Row2>
        </Section>

        {/* Overflow */}
        <Section title="Overflow">
          <Row2>
            <NumField label="Pipe Diameter" unit="m"      value={draft.overflowPipeDiameterM} onChange={(v) => setField('overflowPipeDiameterM', v)} />
            <NumField label="Pipe Level"    unit="m AMSL" value={draft.overflowPipeMAmsl}     onChange={(v) => setField('overflowPipeMAmsl', v)} />
          </Row2>
        </Section>

        {/* Warning */}
        <Section title="Warning">
          <Row2>
            <NumField label="Pipe Diameter" unit="m"      value={draft.warningPipeDiameterM} onChange={(v) => setField('warningPipeDiameterM', v)} />
            <NumField label="Pipe Level"    unit="m AMSL" value={draft.warningPipeMAmsl}     onChange={(v) => setField('warningPipeMAmsl', v)} />
          </Row2>
        </Section>

        {/* Supports */}
        <Section title="Supports">
          <NumField
            label="Support Height"
            unit="m"
            placeholder="default 0.6"
            value={draft.supportHeightM}
            onChange={(v) => setField('supportHeightM', v)}
          />
        </Section>

        {/* Calculated Water Level */}
        <div style={{
          marginTop: 14,
          padding: '10px 12px',
          border: '1px solid #bfdbfe',
          borderRadius: 6,
          background: '#eff6ff',
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#1d4ed8',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 6,
          }}>
            Calculated Water Level
          </div>
          <div style={{
            fontSize: 12,
            color: '#374151',
            marginBottom: 6,
            fontFamily: 'monospace',
          }}>
            = Inlet AMSL − Overflow Ø − 0.075
          </div>
          <div style={{
            padding: '6px 10px',
            border: '1px dashed #93c5fd',
            borderRadius: 5,
            background: '#fff',
            fontSize: 14,
            fontWeight: 700,
            color: waterLevelAmsl === null ? '#94a3b8' : '#1d4ed8',
            fontFamily: 'monospace',
          }}>
            {waterLevelAmsl === null
              ? '— m AMSL (set Inlet AMSL and Overflow Ø)'
              : `${waterLevelAmsl} m AMSL`}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={handleCancel} style={BTN_SECONDARY}>Cancel</button>
          <button onClick={handleSave}   style={BTN_PRIMARY}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tiny presentational helpers ───────────────────────────────────────────────

const LBL: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#444',
  marginBottom: 4,
};

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #d1d5db',
  borderRadius: 5,
  fontSize: 13,
  outline: 'none',
  background: '#fff',
};

const BTN_PRIMARY: React.CSSProperties = {
  flex: 1,
  padding: '9px 0',
  borderRadius: 6,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const BTN_SECONDARY: React.CSSProperties = {
  flex: 1,
  padding: '9px 0',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  background: '#f9fafb',
  color: '#374151',
  fontSize: 13,
  cursor: 'pointer',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 14,
      padding: '10px 12px',
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      background: '#fafbfc',
      boxSizing: 'border-box',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>{children}</div>;
}

function Row3({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>{children}</div>;
}

interface NumFieldProps {
  label: string;
  unit: string;
  value: number | undefined;
  placeholder?: string;
  onChange: (raw: string) => void;
}

function NumField({ label, unit, value, placeholder, onChange }: NumFieldProps) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 11, color: '#475569', marginBottom: 3 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          min={0}
          step={0.01}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '5px 7px',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            fontSize: 13,
            background: '#fff',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: 11, color: '#64748b', minWidth: 50 }}>{unit}</span>
      </div>
    </div>
  );
}
