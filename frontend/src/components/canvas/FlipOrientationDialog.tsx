import { symbolsApi } from '../../api/client';

interface FlipOrientationDialogProps {
  symbolId: string;
  symbolName: string;
  onConfirm: (rotation: number, scaleX?: number) => void;
  onCancel: () => void;
}

const OPTION_BTN_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  padding: '14px 20px',
  border: '2px solid #ccc',
  borderRadius: 8,
  background: '#f9f9f9',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
};

// Port dot overlay configs for the 64×64 dialog preview.
// center=(32,32), scale=64/48≈1.333 from canvas to dialog.
// labelLeft: override label x position (useful when dot is near right edge).

type DotDef = { left: number; top: number; color: string; label: string; labelLeft?: number };

// water_tank: ports at top-left and bottom-right
const WATER_TANK_DOTS_LTR: DotDef[] = [
  { left: 12, top: 2,  color: '#007bff', label: 'Input'  },
  { left: 46, top: 56, color: '#e63329', label: 'Output' },
];
const WATER_TANK_DOTS_RTL: DotDef[] = [
  { left: 46, top: 2,  color: '#007bff', label: 'Input'  },
  { left: 12, top: 56, color: '#e63329', label: 'Output' },
];

// water_heater: ports on left and right sides, vertically centered
// (-24,0) → x=0, y=32;  (24,0) → x=64, y=32
const WATER_HEATER_DOTS_LTR: DotDef[] = [
  { left: 2,  top: 27, color: '#007bff', label: 'Input',  labelLeft: 14  },
  { left: 54, top: 27, color: '#e63329', label: 'Output', labelLeft: 28  },
];
const WATER_HEATER_DOTS_RTL: DotDef[] = [
  { left: 54, top: 27, color: '#007bff', label: 'Input',  labelLeft: 28  },
  { left: 2,  top: 27, color: '#e63329', label: 'Output', labelLeft: 14  },
];

// pump: IN stub at right (SVG x=64,y=36), OUT casing opening at top-left (SVG x=12,y=2)
const PUMP_DOTS_LTR: DotDef[] = [
  { left: 59, top: 31, color: '#007bff', label: 'IN',  labelLeft: -28 },
  { left:  8, top:  2, color: '#e63329', label: 'OUT', labelLeft:  20 },
];
// mirrored: IN moves to left, OUT moves to top-right
const PUMP_DOTS_RTL: DotDef[] = [
  { left:  2, top: 31, color: '#007bff', label: 'IN',  labelLeft: 14 },
  { left: 52, top:  2, color: '#e63329', label: 'OUT', labelLeft: 28 },
];

// symbols that use scaleX=-1 for Left←Right (image stays upright, ports mirror)
const SCALE_FLIP_SYMBOLS = new Set(['water_tank', 'water_heater', 'water_meter', 'pump', 'tap_point_schematic']);

// water_meter: stubs at y=32, left tip at x=0, right tip at x=64
const WATER_METER_DOTS_LTR: DotDef[] = [
  { left: 5,  top: 32, color: '#007bff', label: 'Input',  labelLeft: 14  },
  { left: 59, top: 32, color: '#e63329', label: 'Output', labelLeft: 28  },
];
const WATER_METER_DOTS_RTL: DotDef[] = [
  { left: 59, top: 32, color: '#007bff', label: 'Input',  labelLeft: 28  },
  { left: 5,  top: 32, color: '#e63329', label: 'Output', labelLeft: 14  },
];

// tap_point_schematic: single upstream port at offsetX=-14, offsetY=4 from centre (48px → 64px dialog, ×1.333)
// LTR: port on left at canvas (10, 28) → dialog (13, 37)
// RTL (scaleX=-1): port mirrors to right at canvas (38, 28) → dialog (51, 37)
const TAP_POINT_DOTS_LTR: DotDef[] = [
  { left: 13, top: 37, color: '#007bff', label: 'Port', labelLeft: 18 },
];
const TAP_POINT_DOTS_RTL: DotDef[] = [
  { left: 51, top: 37, color: '#007bff', label: 'Port', labelLeft: 18 },
];

// dot configs indexed by symbolId
const DOTS_LTR: Record<string, DotDef[]> = {
  water_tank:          WATER_TANK_DOTS_LTR,
  water_heater:        WATER_HEATER_DOTS_LTR,
  water_meter:         WATER_METER_DOTS_LTR,
  pump:                PUMP_DOTS_LTR,
  tap_point_schematic: TAP_POINT_DOTS_LTR,
};
const DOTS_RTL: Record<string, DotDef[]> = {
  water_tank:          WATER_TANK_DOTS_RTL,
  water_heater:        WATER_HEATER_DOTS_RTL,
  water_meter:         WATER_METER_DOTS_RTL,
  pump:                PUMP_DOTS_RTL,
  tap_point_schematic: TAP_POINT_DOTS_RTL,
};

/** Renders only the coloured dot circles on the image — labels are shown outside the image. */
function PortDots({ dots }: { dots: DotDef[] }) {
  return (
    <>
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: d.left - 5,
            top: d.top - 5,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: d.color,
            border: '1.5px solid #fff',
            boxShadow: '0 0 2px rgba(0,0,0,0.4)',
          }}
        />
      ))}
    </>
  );
}

/** Legend row shown below the image: ● Input   ● Output */
function PortLegend({ dots }: { dots: DotDef[] }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 4 }}>
      {dots.map((d, i) => (
        <span key={i} style={{ fontSize: 10, color: d.color, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8,
            borderRadius: '50%', background: d.color,
            border: '1px solid #fff', boxShadow: '0 0 1px rgba(0,0,0,0.3)',
          }} />
          {d.label}
        </span>
      ))}
    </div>
  );
}

export function FlipOrientationDialog({ symbolId, symbolName, onConfirm, onCancel }: FlipOrientationDialogProps) {
  const imageUrl = symbolsApi.getImageUrl(symbolId);
  const useScaleFlip = SCALE_FLIP_SYMBOLS.has(symbolId);
  const dotsLtr = DOTS_LTR[symbolId];
  const dotsRtl = DOTS_RTL[symbolId];

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
          {symbolName} Orientation
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 20 }}>
          Choose the flow direction.
        </div>

        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: 20 }}>
          {/* Left → Right */}
          <button
            onClick={() => useScaleFlip ? onConfirm(0, 1) : onConfirm(0)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#1a3a5c';
              (e.currentTarget as HTMLButtonElement).style.background = '#eef2f8';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#ccc';
              (e.currentTarget as HTMLButtonElement).style.background = '#f9f9f9';
            }}
            style={OPTION_BTN_STYLE}
          >
            <div style={{ position: 'relative', width: 64, height: 64 }}>
              <img src={imageUrl} width={64} height={64} style={{ display: 'block' }} />
              {dotsLtr && <PortDots dots={dotsLtr} />}
            </div>
            {dotsLtr && <PortLegend dots={dotsLtr} />}
            <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>Left → Right</span>
          </button>

          {/* Left ← Right */}
          <button
            onClick={() => useScaleFlip ? onConfirm(0, -1) : onConfirm(180)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#1a3a5c';
              (e.currentTarget as HTMLButtonElement).style.background = '#eef2f8';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#ccc';
              (e.currentTarget as HTMLButtonElement).style.background = '#f9f9f9';
            }}
            style={OPTION_BTN_STYLE}
          >
            <div style={{ position: 'relative', width: 64, height: 64 }}>
              <img
                src={imageUrl}
                width={64}
                height={64}
                style={{
                  display: 'block',
                  transform: useScaleFlip ? 'scaleX(-1)' : 'rotate(180deg)',
                }}
              />
              {dotsRtl && <PortDots dots={dotsRtl} />}
            </div>
            {dotsRtl && <PortLegend dots={dotsRtl} />}
            <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>Left ← Right</span>
          </button>
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
