import { MrlConfigPanel } from '../panel/MrlConfigPanel';
import { SymbolPalette } from '../panel/SymbolPalette';
import { ActionPanel } from '../panel/ActionPanel';
import { WaterTankPropertiesPanel } from '../panel/WaterTankPropertiesPanel';
import { PipeColorPanel } from '../panel/PipeColorPanel';
import { useSymbols } from '../../hooks/useSymbols';
import { useCanvasStore } from '../../store/canvasStore';

interface ControlPaneProps {
  canvasWidth: number;
  canvasHeight: number;
}

export function ControlPane({ canvasWidth, canvasHeight }: ControlPaneProps) {
  const symbolsState = useSymbols();
  const { selectedId, selectedPipeIds, elements, pipes } = useCanvasStore();
  const selectedEl = elements.find((el) => el.id === selectedId);
  const isTankSelected = selectedEl?.symbolId === 'water_tank';

  // A single pipe clicked on canvas lands in `selectedId` (the same channel symbols use),
  // while `selectedPipeIds` only ever gets populated by rubber-band multi-select or paste —
  // reconcile both so a single-pipe click (the common case) still shows the color panel.
  const selectedPipe = pipes.find((p) => p.id === selectedId);
  const effectivePipeIds = selectedPipeIds.length > 0
    ? selectedPipeIds
    : (selectedPipe ? [selectedPipe.id] : []);

  return (
    <div style={{
      width: 260,
      flexShrink: 0,
      background: '#fafafa',
      borderLeft: '1px solid #ddd',
      display: 'flex',
      flexDirection: 'column',
      padding: '12px 14px 56px',
      overflowY: 'auto',
      height: '100%',
    }}>
      {isTankSelected && <WaterTankPropertiesPanel />}
      {effectivePipeIds.length > 0 && <PipeColorPanel pipeIds={effectivePipeIds} />}
      <MrlConfigPanel />
      <SymbolPalette {...symbolsState} />
      <ActionPanel canvasWidth={canvasWidth} canvasHeight={canvasHeight} />
    </div>
  );
}
