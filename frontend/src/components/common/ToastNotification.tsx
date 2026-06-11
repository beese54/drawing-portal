import { useEffect, useRef } from 'react';
import { useUiStore } from '../../store/uiStore';
import { useCanvasStore } from '../../store/canvasStore';
import { SCHEMATIC_SYMBOL_PX } from '../../types';
import { SYMBOL_PORTS, getPortPosition } from '../../utils/symbolPorts';

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
  const { elements, insertDcvAssembly } = useCanvasStore();
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
    const { elementX, elementY, pipeId } = toast;

    // Find the upstream pipe (the one that ENDS near the element's upstream port).
    // For terminal elements dropped on a pipe, insertElementOnPipe replaces the original
    // pipe (new UUID) so the stored pipeId may be stale — use proximity fallback.
    // For inline elements (water heater), insertElementOnPipeInline creates pipeA (upstream,
    // ends at element inlet) and pipeB (downstream); checking endX/endY selects pipeA.
    const allPipes = useCanvasStore.getState().pipes;
    let targetPipe = allPipes.find((p) => p.id === pipeId);
    if (!targetPipe) {
      let closest = 30;
      for (const p of allPipes) {
        const dEnd = Math.hypot(p.endX - elementX, p.endY - elementY);
        if (dEnd < closest) { closest = dEnd; targetPipe = p; }
      }
    }

    // Assembly components are always standard size regardless of the fitting's size multiplier.
    const cvWidth  = SCHEMATIC_SYMBOL_PX;
    const cvHeight = SCHEMATIC_SYMBOL_PX;
    const cvFluid  = existing?.carriesFluid;
    const cvHalfPort = SCHEMATIC_SYMBOL_PX / 2; // = 3 (scaled port offset for standard elements)

    // Anchor = fitting's actual upstream port so CV1's downstream aligns exactly with it,
    // even when the fitting is a different size (e.g. water heater at 1.7× scale).
    const fittingPorts = existing ? (SYMBOL_PORTS[existing.symbolId] ?? []) : [];
    const fittingUpstream = fittingPorts.find((p) => p.role === 'upstream');
    const anchor = fittingUpstream && existing
      ? getPortPosition(existing, fittingUpstream)
      : { x: elementX, y: elementY };

    // Pipe flow direction unit vector from targetPipe; determines assembly orientation.
    let ux = 0; let uy = 1; // default: vertical (downward flow)
    let asmRotation = 90;
    if (targetPipe) {
      const dx = targetPipe.endX - targetPipe.startX;
      const dy = targetPipe.endY - targetPipe.startY;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        ux = dx / len;
        uy = dy / len;
        asmRotation = Math.abs(uy) >= Math.abs(ux) ? 90 : 0;
      }
    }

    // Place elements upstream of anchor.
    // CV1.downstream touches anchor; CV2.downstream touches CV1.upstream; GV.downstream touches CV2.upstream.
    const makeAssemblyEl = (symbolId: string, symbolName: string, distFromAnchor: number) => ({
      id: crypto.randomUUID(),
      symbolId,
      symbolName,
      x: anchor.x - ux * distFromAnchor,
      y: anchor.y - uy * distFromAnchor,
      rotation: asmRotation,
      width: cvWidth,
      height: cvHeight,
      ...(cvFluid !== undefined && { carriesFluid: cvFluid }),
    });

    // Each element's downstream port is cvHalfPort (=3) from its center toward the fitting.
    // Adjacent same-size elements are STEP (=6) apart center-to-center.
    const cv1El = makeAssemblyEl('check_valve', 'Check Valve', cvHalfPort);
    const cv2El = makeAssemblyEl('check_valve', 'Check Valve', cvHalfPort + STEP);
    const gvEl  = makeAssemblyEl('gate_valve',  'Gate Valve',  cvHalfPort + STEP * 2);

    // Single atomic history entry for the whole assembly.
    const gvPorts = SYMBOL_PORTS['gate_valve'] ?? [];
    const gvUpstream = gvPorts.find((p) => p.role === 'upstream');
    const gvInletPos = gvUpstream ? getPortPosition(gvEl, gvUpstream) : { x: gvEl.x, y: gvEl.y };
    insertDcvAssembly(gvEl, cv2El, cv1El, targetPipe?.id ?? null, gvInletPos.x, gvInletPos.y);

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
            Insert <strong>Gate Valve → CV → CV</strong> upstream (SS636 §6.4)?
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
