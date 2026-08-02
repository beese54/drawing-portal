import { useState } from 'react';
import { CanvasPane } from './CanvasPane';
import { ControlPane } from './ControlPane';
import { Masthead } from './Masthead';
import { SheetSetupModal } from '../common/SheetSetupModal';
import { ToastNotification, DcvToastNotification } from '../common/ToastNotification';
import { useUiStore } from '../../store/uiStore';

export function AppLayout() {
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [logoFailed, setLogoFailed] = useState(false);
  const activeTool = useUiStore((s) => s.activeTool);
  const sheetSetupOpen = useUiStore((s) => s.sheetSetupOpen);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Official Government Banner — must stay the topmost component (DSS TL-3) */}
      <Masthead />

      {/* Header */}
      <div style={{
        height: 48, background: '#1a3a5c', color: '#fff',
        display: 'flex', alignItems: 'center', paddingLeft: 20, gap: 16,
        flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}>
        {/* Agency logo, linked to the PUB homepage — DSS TL-3's companion control TL-2.
            Opens in a new tab deliberately: a drawing lives only in browser memory and is
            never persisted server-side, so a same-tab navigation would discard unsaved work.
            The official PUB logo is NOT bundled — pub.gov.sg Terms of Use require PUB's prior
            written consent to reproduce it. Drop the asset supplied by PUB comms at
            frontend/public/pub-logo.svg and it appears automatically; until then this renders
            as a text wordmark. See frontend/public/README.md. */}
        <a
          href="https://www.pub.gov.sg"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="PUB, Singapore's National Water Agency — opens in a new tab"
          style={{
            display: 'inline-flex', alignItems: 'center',
            textDecoration: 'none', color: 'inherit', flexShrink: 0,
          }}
        >
          {logoFailed ? (
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.08em' }}>PUB</span>
          ) : (
            <img
              src="/pub-logo.svg"
              alt=""
              onError={() => setLogoFailed(true)}
              style={{ height: 26, width: 'auto', display: 'block' }}
            />
          )}
        </a>

        <span aria-hidden="true" style={{ opacity: 0.35 }}>|</span>

        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.03em' }}>
          Schematic Drawing Portal
        </span>
        {(activeTool === 'pipe' || activeTool === 'cold_pipe' || activeTool === 'hot_pipe') && (
          <span style={{
            fontSize: 11,
            background: activeTool === 'hot_pipe' ? '#e63329' : '#007bff',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 12,
            fontWeight: 600,
          }}>
            {activeTool === 'cold_pipe'
              ? 'COLD PIPE — Click two points · H/V only · Esc to cancel'
              : activeTool === 'hot_pipe'
              ? 'HOT PIPE — Click two points · H/V only · Esc to cancel'
              : 'PIPE MODE — Click canvas to place points · Esc to cancel'}
          </span>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <CanvasPane
          onSizeChange={(w, h) => setCanvasSize({ width: w, height: h })}
        />
        <ControlPane canvasWidth={canvasSize.width} canvasHeight={canvasSize.height} />
      </div>

      {sheetSetupOpen && <SheetSetupModal />}
      <ToastNotification />
      <DcvToastNotification />
    </div>
  );
}
