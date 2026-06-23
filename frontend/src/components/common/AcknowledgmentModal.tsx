import { useState } from 'react';
import type { CanvasElement, AcknowledgmentFlags } from '../../types';

const APPLIANCE_SYMBOL_IDS = new Set(['washing_machine', 'dishwasher', 'water_dispenser', 'bib_tap_cw_cap_and_lock_schematic']);

interface Props {
  elements: CanvasElement[];
  onConfirm: (flags: AcknowledgmentFlags) => void;
  onCancel: () => void;
}

interface CheckboxItem {
  key: keyof AcknowledgmentFlags;
  label: string;
  description: string;
  applicable: boolean;
}

export function AcknowledgmentModal({ elements, onConfirm, onCancel }: Props) {
  const hasPump       = elements.some((e) => e.symbolId === 'pump');
  const hasHeater     = elements.some((e) => e.symbolId === 'water_heater');
  const hasTank       = elements.some((e) => e.symbolId === 'water_tank');
  const hasBidet      = elements.some((e) => e.symbolId === 'bidet_spray');
  const hasAppliance  = elements.some((e) => APPLIANCE_SYMBOL_IDS.has(e.symbolId));

  const items: CheckboxItem[] = [
    {
      key: 'materialsAcknowledged',
      label: 'PUB-approved materials',
      description: 'I (LP/PE) confirm that all pipework will be installed using PUB-approved materials and sizes.',
      applicable: true,
    },
    {
      key: 'pumpHeadAcknowledged',
      label: 'Pump rated head ≤ 35 m',
      description: 'I (LP/PE) confirm the pump rated head does not exceed 35 m (PUB requirement).',
      applicable: hasPump,
    },
    {
      key: 'pumpDischargeMaterialAcknowledged',
      label: 'Pump discharge — non-plastic materials',
      description: 'I (LP/PE) confirm that all pump discharge pipes are made of PUB-approved non-plastic materials (e.g. copper, stainless steel, galvanised steel). Plastic pipes such as PVC/uPVC must NOT be used on pump discharge lines.',
      applicable: hasPump,
    },
    {
      key: 'heaterTypeAcknowledged',
      label: 'Direct-supply heater type',
      description: 'I (LP/PE) confirm that all heaters taking direct supply are mains-pressure type (storage or instantaneous water heaters), as required under SS 636.',
      applicable: hasHeater,
    },
    {
      key: 'applianceCheckValveAcknowledged',
      label: 'Appliance double check valves',
      description: 'I (LP/PE) confirm that double check valves are installed for all applicable appliances (dishwasher, water dispenser, washing machine, landscape taps, ice maker, coffee maker, refrigerator, balancing tank) where required.',
      applicable: hasAppliance,
    },
    {
      key: 'bidetVacuumBreakerAcknowledged',
      label: 'Bidet vacuum breaker assembly',
      description: 'I (LP/PE) confirm that all bidet sprays are installed with a vacuum breaker and check valve assembly to prevent backflow contamination.',
      applicable: hasBidet,
    },
    {
      key: 'tankPositionAcknowledged',
      label: 'Tank/pump not below sanitary pipes',
      description: 'I (LP/PE) confirm that tanks and pumps are NOT installed in a position below any sanitary pipe, floor trap, sewer waste pipe, rainwater downpipe, or other non-potable water pipe.',
      applicable: hasTank || hasPump,
    },
  ];

  const applicableItems = items.filter((i) => i.applicable);

  const initialState = Object.fromEntries(
    items.map((i) => [i.key, false])
  ) as AcknowledgmentFlags;

  const [checks, setChecks] = useState<AcknowledgmentFlags>(initialState);

  const allChecked = applicableItems.every((i) => checks[i.key]);

  const toggle = (key: keyof AcknowledgmentFlags) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConfirm = () => {
    onConfirm(checks);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 10,
          width: 'min(520px, calc(100vw - 32px))',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px 14px',
          borderBottom: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 4 }}>
            Pre-Evaluation Checklist
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
            Please review and confirm all applicable statements before evaluation.
            Only items relevant to your schematic are shown.
          </div>
        </div>

        {/* Checklist items */}
        <div style={{ overflowY: 'auto', padding: '14px 22px', flex: 1 }}>
          {applicableItems.map((item) => (
            <label
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '10px 12px',
                marginBottom: 8,
                borderRadius: 6,
                border: checks[item.key] ? '1px solid #bbf7d0' : '1px solid #e5e7eb',
                background: checks[item.key] ? '#f0fdf4' : '#fafafa',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <input
                type="checkbox"
                checked={checks[item.key]}
                onChange={() => toggle(item.key)}
                style={{ marginTop: 2, flexShrink: 0, accentColor: '#16a34a', width: 14, height: 14 }}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 3 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 11, color: '#555', lineHeight: 1.45 }}>
                  {item.description}
                </div>
              </div>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
        }}>
          {!allChecked && (
            <span style={{ fontSize: 11, color: '#b45309', flex: 1 }}>
              Please confirm all items above to proceed.
            </span>
          )}
          {allChecked && (
            <span style={{ fontSize: 11, color: '#15803d', flex: 1 }}>
              All items confirmed — ready to evaluate.
            </span>
          )}
          <button
            onClick={onCancel}
            style={{
              padding: '8px 18px', border: '1px solid #d1d5db',
              borderRadius: 6, background: '#f9fafb', color: '#374151',
              cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allChecked}
            style={{
              padding: '8px 18px', border: 'none', borderRadius: 6,
              background: allChecked ? '#7c3aed' : '#ccc',
              color: '#fff', cursor: allChecked ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600,
            }}
          >
            Confirm &amp; Evaluate
          </button>
        </div>
      </div>
    </div>
  );
}
