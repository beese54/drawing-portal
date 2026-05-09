import { useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { NumberInput } from '../common/NumberInput';
import { MRL_LOWER_HARD_MIN, MRL_UPPER_HARD_MAX } from '../../types';

export function MrlConfigPanel() {
  const mrlConfig      = useUiStore((s) => s.mrlConfig);
  const setMrlConfig   = useUiStore((s) => s.setMrlConfig);
  const floorLevels    = useUiStore((s) => s.floorLevels);
  const addFloorLevel  = useUiStore((s) => s.addFloorLevel);
  const updateFloorLevel = useUiStore((s) => s.updateFloorLevel);
  const removeFloorLevel = useUiStore((s) => s.removeFloorLevel);

  const [newName, setNewName] = useState('');
  const [newFfl,  setNewFfl]  = useState('');

  const handleAdd = () => {
    const ffl = parseFloat(newFfl);
    if (!newName.trim() || isNaN(ffl)) return;
    addFloorLevel({ name: newName.trim().toUpperCase(), fflM: ffl });
    setNewName('');
    setNewFfl('');
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* ── MRL range ─────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        mRL Configuration
      </div>
      <div style={{ background: '#f7f8fa', borderRadius: 6, padding: 12, border: '1px solid #e8e8e8' }}>
        <NumberInput
          label={`Upper elevation  (max ${MRL_UPPER_HARD_MAX}m AMSL)`}
          value={mrlConfig.upperMrl}
          min={mrlConfig.lowerMrl + 1}
          max={MRL_UPPER_HARD_MAX}
          step={1}
          unit="m AMSL"
          onChange={(v) => setMrlConfig({ upperMrl: v })}
        />
        <NumberInput
          label={`Lower elevation (min ${MRL_LOWER_HARD_MIN}m AMSL)`}
          value={mrlConfig.lowerMrl}
          min={MRL_LOWER_HARD_MIN}
          max={mrlConfig.upperMrl - 1}
          step={1}
          unit="m AMSL"
          onChange={(v) => setMrlConfig({ lowerMrl: v })}
        />
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
          Range: {mrlConfig.upperMrl - mrlConfig.lowerMrl} m
        </div>
      </div>

      {/* ── Floor levels ──────────────────────────────────────────────────── */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#333', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Floor Levels (FFL)
      </div>
      <div style={{ background: '#f7f8fa', borderRadius: 6, padding: 10, border: '1px solid #e8e8e8' }}>

        {/* Existing floors */}
        {floorLevels.length === 0 && (
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8, textAlign: 'center' }}>
            No floor levels added yet
          </div>
        )}
        {[...floorLevels].reverse().map((floor) => (
          <div key={floor.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            {/* Name */}
            <input
              value={floor.name}
              onChange={(e) => updateFloorLevel(floor.id, { name: e.target.value.toUpperCase() })}
              placeholder="Name"
              style={{
                flex: 2, fontSize: 11, padding: '4px 6px',
                border: '1px solid #ddd', borderRadius: 4,
                fontFamily: 'monospace', textTransform: 'uppercase',
              }}
            />
            {/* FFL value */}
            <input
              type="number"
              value={floor.fflM}
              step={0.01}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) updateFloorLevel(floor.id, { fflM: v });
              }}
              style={{
                flex: 1, fontSize: 11, padding: '4px 6px',
                border: '1px solid #ddd', borderRadius: 4, minWidth: 0,
              }}
            />
            <span style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap' }}>m</span>
            {/* Remove */}
            <button
              onClick={() => removeFloorLevel(floor.id)}
              title="Remove floor level"
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                color: '#e53e3e', fontSize: 15, lineHeight: 1, padding: '0 2px',
              }}
            >
              ×
            </button>
          </div>
        ))}

        {/* Add new floor row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: floorLevels.length ? '1px solid #e8e8e8' : 'none', paddingTop: floorLevels.length ? 8 : 0 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. 1ST STOREY"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            style={{
              flex: 2, fontSize: 11, padding: '4px 6px',
              border: '1px solid #bbb', borderRadius: 4, minWidth: 0,
            }}
          />
          <input
            type="number"
            value={newFfl}
            step={0.01}
            onChange={(e) => setNewFfl(e.target.value)}
            placeholder="m AMSL"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            style={{
              flex: 1, fontSize: 11, padding: '4px 6px',
              border: '1px solid #bbb', borderRadius: 4, minWidth: 0,
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || newFfl === ''}
            title="Add floor level"
            style={{
              border: 'none', borderRadius: 4, padding: '4px 8px',
              background: newName.trim() && newFfl !== '' ? '#0066cc' : '#ccc',
              color: '#fff', cursor: newName.trim() && newFfl !== '' ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 700, lineHeight: 1,
            }}
          >
            +
          </button>
        </div>
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>
          FFL lines appear on the canvas as labelled reference lines.
        </div>
      </div>
    </div>
  );
}
