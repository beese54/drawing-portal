import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Clamps an absolutely/fixed-positioned element so it never renders past the
 * edge of its bounding box. Measures the element's actual rendered size (which
 * can change, e.g. a popup growing when a text field opens) via ResizeObserver,
 * so the clamp stays correct as content changes — not just at mount.
 *
 * `bounds: 'parent'` clamps against the nearest positioned ancestor (for
 * `position: absolute` popups); `'window'` clamps against the viewport (for
 * `position: fixed` elements, whose offsetParent isn't meaningful).
 */
export function useClampToViewport<T extends HTMLElement>(
  x: number,
  y: number,
  opts?: { margin?: number; bounds?: 'parent' | 'window' },
) {
  const margin = opts?.margin ?? 8;
  const bounds = opts?.bounds ?? 'parent';
  const ref = useRef<T>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const recalc = () => {
      let boundsWidth = window.innerWidth;
      let boundsHeight = window.innerHeight;
      if (bounds === 'parent') {
        const parent = el.offsetParent as HTMLElement | null;
        if (parent) {
          boundsWidth = parent.clientWidth;
          boundsHeight = parent.clientHeight;
        }
      }
      const rect = el.getBoundingClientRect();
      const maxLeft = Math.max(margin, boundsWidth - rect.width - margin);
      const maxTop = Math.max(margin, boundsHeight - rect.height - margin);
      setPos({
        left: Math.min(Math.max(x, margin), maxLeft),
        top: Math.min(Math.max(y, margin), maxTop),
      });
    };
    recalc();
    // Observe both the popup itself (content growing, e.g. the annotation menu's custom-
    // text mode) and, for 'parent' bounds, the container it's clamped against — resizing
    // the browser window changes the container's width/height too, which would otherwise
    // leave an already-open popup clamped against a stale bound until it's reopened.
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    const parent = bounds === 'parent' ? (el.offsetParent as HTMLElement | null) : null;
    if (parent) ro.observe(parent);
    window.addEventListener('resize', recalc);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recalc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, margin, bounds]);

  return { ref, left: pos.left, top: pos.top };
}
