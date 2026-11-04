/**
 * canvasPopupStyles.ts: the look of the small popups that sit over the drawing
 * canvas: the symbol properties popup (double-click a symbol) and the warning
 * tooltip on a "!" badge. Both use these styles, so they stay consistent.
 *
 * The sizes are screen px. These popups are HTML overlays, not Konva shapes,
 * so their text stays readable at any zoom.
 */
import type { CSSProperties } from 'react';

/** The white card: border, rounded corners, soft shadow. */
export const POPUP_PANEL: CSSProperties = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  zIndex: 10,
  background: 'rgba(255,255,255,0.97)',
  borderRadius: 6,
  padding: '8px 10px 10px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
  border: '1px solid #ccc',
  minWidth: 160,
  maxWidth: 220,
};

/** The popup's heading, for example the symbol name. */
export const POPUP_TITLE: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#1a3a5c',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 8,
};

/** Ordinary text inside a popup. */
export const POPUP_BODY: CSSProperties = {
  fontSize: 11,
  color: '#333',
  lineHeight: 1.4,
};

/** A prompt telling the user what to do next, for example "Select a tick rating". */
export const POPUP_HINT: CSSProperties = {
  fontSize: 10,
  color: '#b45309',
  lineHeight: 1.4,
};
