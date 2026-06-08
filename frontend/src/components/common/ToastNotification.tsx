import { useEffect, useRef } from 'react';
import { useUiStore } from '../../store/uiStore';
import { useCanvasStore } from '../../store/canvasStore';
import { SCHEMATIC_SYMBOL_PX } from '../../types';

const AUTO_DISMISS_MS = 7000;
const STEP = SCHEMATIC_SYMBOL_PX;

export function ToastNotification() {
  const toast = useUiStore((s) => s.bidetToast);
  const dismiss = useUiStore((s) => s.dismissBidetToast);
  const { removeElement, addElement, elements } = useCanvasStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast, dismiss]);

  if (!toast) return null;

  const handleSwitch = () => {
    const existing = elements.find((e) => e.id === toast.tapElementId);
    if (existing) {
      removeElement(toast.tapElementId);

      // Bidet spray at the original tap position, rotated 90°
      addElement({
        ...existing,
        id: crypto.randomUUID(),
        symbolId: 'bidet_spray',
        symbolName: 'Bidet Spray',
        x: toast.tapX,
        y: toast.tapY,
        rotation: 90,
      });

      // Vacuum breaker 1 step above
      addElement({
        ...existing,
        id: crypto.randomUUID(),
        symbolId: 'vacuum_breaker',
        symbolName: 'Vacuum Breaker',
        x: toast.tapX,
        y: toast.tapY - STEP,
        rotation: 0,
      });

      // Check valve 2 steps above, rotated 90°
      addElement({
        ...existing,
        id: crypto.randomUUID(),
        symbolId: 'check_valve',
        symbolName: 'Check Valve',
        x: toast.tapX,
        y: toast.tapY - STEP * 2,
        rotation: 90,
      });
    }
    dismiss();
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 2000,
      maxWidth: 340,
      background: '#1e3a5f',
      color: '#fff',
      borderRadius: 10,
      padding: '14px 16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      animation: 'slideInToast 0.2s ease-out',
    }}>
      <style>{`
        @keyframes slideInToast {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>💡</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>
            Tap placed near a WC — is this a bidet spray?
          </div>
          <div style={{ fontSize: 11, color: '#b8d0f0', lineHeight: 1.45 }}>
            Switching will place a <strong>Bidet Spray</strong> with a pre-connected
            <strong> Check Valve</strong> and <strong>Vacuum Breaker</strong> inline
            upstream — satisfying Rule 6.5 requirements automatically.
          </div>
        </div>
        <button
          onClick={dismiss}
          style={{
            background: 'none', border: 'none', color: '#7fa8d8',
            cursor: 'pointer', fontSize: 16, lineHeight: 1,
            padding: 0, flexShrink: 0, marginLeft: 'auto',
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={dismiss}
          style={{
            padding: '5px 12px', fontSize: 11, borderRadius: 5,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent', color: '#b8d0f0', cursor: 'pointer',
          }}
        >
          Keep as tap
        </button>
        <button
          onClick={handleSwitch}
          style={{
            padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 5,
            border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer',
          }}
        >
          Insert Bidet Spray Assembly
        </button>
      </div>
    </div>
  );
}

export function DcvToastNotification() {
  const toast = useUiStore((s) => s.dcvToast);
  const dismiss = useUiStore((s) => s.dismissDcvToast);
  const { addElement, elements } = useCanvasStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast, dismiss]);

  if (!toast) return null;

  const handleInsert = () => {
    const existing = elements.find((e) => e.id === toast.elementId);
    const { elementX, elementY } = toast;
    // Strip tank-specific and long-bath-specific fields from base props
    const baseProps = existing
      ? (({ tankProperties: _t, longBathCapacityL: _l, dualSupply: _d, swapDualSupply: _s, ...rest }) => rest)(existing as typeof existing & { tankProperties?: unknown; longBathCapacityL?: unknown; dualSupply?: unknown; swapDualSupply?: unknown })
      : null;

    const sharedProps = baseProps
      ? {
          width: baseProps.width,
          height: baseProps.height,
          scaleX: baseProps.scaleX,
          carriesFluid: baseProps.carriesFluid,
        }
      : {};

    // CV1: directly above the fitting
    addElement({
      ...sharedProps,
      id: crypto.randomUUID(),
      symbolId: 'check_valve',
      symbolName: 'Check Valve',
      x: elementX,
      y: elementY - STEP,
      rotation: 90,
    });

    // CV2: two steps above the fitting
    addElement({
      ...sharedProps,
      id: crypto.randomUUID(),
      symbolId: 'check_valve',
      symbolName: 'Check Valve',
      x: elementX,
      y: elementY - STEP * 2,
      rotation: 90,
    });

    dismiss();
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 100,
      right: 24,
      zIndex: 2000,
      maxWidth: 360,
      background: '#1e3a5f',
      color: '#fff',
      borderRadius: 10,
      padding: '14px 16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      animation: 'slideInToast 0.2s ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>
            Backflow-risk appliance detected
          </div>
          <div style={{ fontSize: 11, color: '#b8d0f0', lineHeight: 1.45 }}>
            Insert 2 check valves in series upstream (SS636 §6.4)?
          </div>
        </div>
        <button
          onClick={dismiss}
          style={{
            background: 'none', border: 'none', color: '#7fa8d8',
            cursor: 'pointer', fontSize: 16, lineHeight: 1,
            padding: 0, flexShrink: 0, marginLeft: 'auto',
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={dismiss}
          style={{
            padding: '5px 12px', fontSize: 11, borderRadius: 5,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent', color: '#b8d0f0', cursor: 'pointer',
          }}
        >
          Skip
        </button>
        <button
          onClick={handleInsert}
          style={{
            padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 5,
            border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer',
          }}
        >
          Insert 2 Check Valves
        </button>
      </div>
    </div>
  );
}
