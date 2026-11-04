/**
 * WarningTooltip: what a "!" badge means, shown while the pointer is over the badge.
 *
 * Drawn as an HTML overlay in screen px, with the same card, heading and text sizes as
 * the symbol properties popup (canvasPopupStyles). It used to be Konva text in canvas
 * units, which shrank with the zoom and was too small to read. It ignores the pointer,
 * so it never takes the hover away from the badge underneath.
 */
import { POPUP_PANEL, POPUP_TITLE, POPUP_BODY, POPUP_HINT } from './canvasPopupStyles';

/** A badge's tooltip. x and y are the badge centre in canvas (content) coordinates. */
export interface WarningTip {
  x: number;
  y: number;
  title: string;
  details: string[];
  /** What the user can do about it, shown as a hint. */
  action?: string;
}

interface Props {
  tip: WarningTip;
  /** Badge centre in viewport px. */
  vpX: number;
  vpY: number;
  /** Badge radius in viewport px, so the card clears the badge at any zoom. */
  badgeRadiusVp: number;
  canvasWidth: number;
}

const GAP = 6;
const FLIP_RIGHT_MARGIN = 240; // card max width + gap: closer than this to the right edge, open leftwards
const FLIP_TOP_MARGIN = 140;   // closer than this to the top, open downwards

export function WarningTooltip({ tip, vpX, vpY, badgeRadiusVp, canvasWidth }: Props) {
  const openLeft = vpX > canvasWidth - FLIP_RIGHT_MARGIN;
  const openDown = vpY < FLIP_TOP_MARGIN;
  const clear = badgeRadiusVp + GAP;

  return (
    <div
      role="tooltip"
      style={{
        ...POPUP_PANEL,
        zIndex: 30,
        pointerEvents: 'none',
        left: openLeft ? vpX - clear : vpX + clear,
        top: openDown ? vpY + clear : vpY - clear,
        transform: `translate(${openLeft ? '-100%' : '0'}, ${openDown ? '0' : '-100%'})`,
      }}
    >
      <div style={{ ...POPUP_TITLE, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden="true" style={{
          flexShrink: 0, width: 14, height: 14, borderRadius: '50%',
          background: '#f97316', color: '#fff', fontSize: 10, fontWeight: 800,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>!</span>
        {tip.title}
      </div>
      {tip.details.map((line) => (
        <div key={line} style={{ ...POPUP_BODY, marginBottom: 4 }}>{line}</div>
      ))}
      {tip.action && <div style={POPUP_HINT}>{tip.action}</div>}
    </div>
  );
}
