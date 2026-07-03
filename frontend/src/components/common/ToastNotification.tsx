import { useEffect, useRef } from 'react';
import { useUiStore } from '../../store/uiStore';
import { useCanvasStore } from '../../store/canvasStore';
import { SCHEMATIC_SYMBOL_PX, getBackflowRule } from '../../types';
import { buildBackflowAssemblies } from '../../utils/dcvAssembly';

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
  const insertDcvAssemblies = useCanvasStore((s) => s.insertDcvAssemblies);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast, dismiss]);

  if (!toast) return null;

  const { elements: allElements } = useCanvasStore.getState();
  const rule = getBackflowRule(allElements.find((e) => e.id === toast.elementId) ?? { symbolId: '' });
  const assemblyLabel = rule === 'vb_and_check_valve' ? 'Gate Valve → CV → Vacuum Breaker' : 'Gate Valve → CV → CV';
  const ruleRef = rule === 'vb_and_check_valve' ? 'SS636 §6.5' : 'SS636 §6.4';

  const handleInsert = () => {
    const { pipeId } = toast;
    const { elements: currElements, pipes: currPipes } = useCanvasStore.getState();
    const asms = buildBackflowAssemblies(toast.elementId, pipeId, currElements, currPipes);
    if (asms.length > 0) {
      insertDcvAssemblies(asms.map((a) => ({
        elements: a.elements, targetPipeId: a.targetPipeId, snapX: a.snapX, snapY: a.snapY,
      })));
    }
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
            Insert <strong>{assemblyLabel}</strong> upstream ({ruleRef})?
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
          Insert Assembly
        </button>
      </div>
    </div>
  );
}
