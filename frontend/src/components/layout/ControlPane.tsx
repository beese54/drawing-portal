import { MrlConfigPanel } from '../panel/MrlConfigPanel';
import { SymbolPalette } from '../panel/SymbolPalette';
import { ActionPanel } from '../panel/ActionPanel';
import { SchematicSettingsPanel } from '../panel/SchematicSettingsPanel';
import { PipePropertiesPanel } from '../panel/PipePropertiesPanel';
import { WaterTankPropertiesPanel } from '../panel/WaterTankPropertiesPanel';
import { useSymbols } from '../../hooks/useSymbols';
import { useCanvasStore } from '../../store/canvasStore';

interface ControlPaneProps {
  canvasWidth: number;
  canvasHeight: number;
}

export function ControlPane({ canvasWidth, canvasHeight }: ControlPaneProps) {
  const symbolsState = useSymbols();
  const { selectedId, pipes, elements } = useCanvasStore();
  const isPipeSelected = pipes.some((p) => p.id === selectedId);
  const isTankSelected = elements.some(
    (el) => el.id === selectedId && el.symbolId === 'water_tank'
  );

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
      <SchematicSettingsPanel />
      {isPipeSelected && <PipePropertiesPanel />}
      {isTankSelected && <WaterTankPropertiesPanel />}
      <MrlConfigPanel />
      <SymbolPalette {...symbolsState} />
      <ActionPanel canvasWidth={canvasWidth} canvasHeight={canvasHeight} />
    </div>
  );
}
