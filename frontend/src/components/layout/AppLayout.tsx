import { useState } from 'react';
import { CanvasPane } from './CanvasPane';
import { ControlPane } from './ControlPane';
import { SheetSetupModal } from '../common/SheetSetupModal';
import { ToastNotification, DcvToastNotification } from '../common/ToastNotification';
import { ChatWindow } from '../chat/ChatWindow';
import { useUiStore } from '../../store/uiStore';

type Tab = 'draw' | 'evaluate';

const TABS: { id: Tab; label: string }[] = [
  { id: 'draw', label: 'Draw' },
  { id: 'evaluate', label: 'Evaluate' },
];

export function AppLayout() {
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [activeTab, setActiveTab] = useState<Tab>('draw');
  const activeTool = useUiStore((s) => s.activeTool);
  const sheetSetupOpen = useUiStore((s) => s.sheetSetupOpen);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        height: 48, background: '#1a3a5c', color: '#fff',
        display: 'flex', alignItems: 'center', paddingLeft: 20, gap: 16,
        flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.03em' }}>
          Schematic Drawing Portal
        </span>
        {activeTab === 'draw' && (activeTool === 'pipe' || activeTool === 'cold_pipe' || activeTool === 'hot_pipe') && (
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

        {/* Tab bar */}
        <div style={{ marginLeft: 'auto', display: 'flex', height: '100%', paddingRight: 8 }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '3px solid #60a5fa' : '3px solid transparent',
                color: activeTab === tab.id ? '#e2e8f0' : '#94a3b8',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 700 : 500,
                padding: '0 16px',
                height: '100%',
                letterSpacing: '0.02em',
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 'draw' && (
          <>
            <CanvasPane
              onSizeChange={(w, h) => setCanvasSize({ width: w, height: h })}
            />
            <ControlPane canvasWidth={canvasSize.width} canvasHeight={canvasSize.height} />
          </>
        )}
        {activeTab === 'evaluate' && (
          <div style={{ flex: 1, background: '#0f172a', overflow: 'hidden' }}>
            <ChatWindow />
          </div>
        )}
      </div>

      {sheetSetupOpen && <SheetSetupModal />}
      <ToastNotification />
      <DcvToastNotification />
    </div>
  );
}
