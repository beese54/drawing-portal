/** Inline markup for the User Guide text in guideContent.tsx. */
import type { ReactNode } from 'react';

/** A button, tab or field name, styled the way the guide shows UI labels. */
export function Ui({ children }: { children: ReactNode }) {
  return <strong className="guide-ui">{children}</strong>;
}

/** A key or mouse action, such as Ctrl + scroll wheel. */
export function Key({ children }: { children: ReactNode }) {
  return <kbd className="guide-key">{children}</kbd>;
}
