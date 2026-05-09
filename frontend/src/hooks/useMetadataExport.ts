import { useCallback } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { useUiStore } from '../store/uiStore';
import { buildMetadata } from '../utils/metadataBuilder';

export function useMetadataExport(canvasWidth: number, canvasHeight: number) {
  const elements = useCanvasStore((s) => s.elements);
  const pipes = useCanvasStore((s) => s.pipes);
  const sourcePressureBar = useCanvasStore((s) => s.sourcePressureBar);
  const mrlConfig = useUiStore((s) => s.mrlConfig);

  const exportMetadata = useCallback(() => {
    const data = buildMetadata(elements, pipes, mrlConfig, canvasWidth, canvasHeight, sourcePressureBar);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schematic_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [elements, pipes, mrlConfig, canvasWidth, canvasHeight, sourcePressureBar]);

  const getMetadata = useCallback(() => {
    return buildMetadata(elements, pipes, mrlConfig, canvasWidth, canvasHeight, sourcePressureBar);
  }, [elements, pipes, mrlConfig, canvasWidth, canvasHeight, sourcePressureBar]);

  return { exportMetadata, getMetadata };
}
