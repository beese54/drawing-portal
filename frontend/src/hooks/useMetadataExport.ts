import { useCallback } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { useUiStore } from '../store/uiStore';
import { buildMetadata } from '../utils/metadataBuilder';
import type { AcknowledgmentFlags } from '../types';

const DEFAULT_ACKS: AcknowledgmentFlags = {
  materialsAcknowledged: false,
  pumpDischargeMaterialAcknowledged: false,
  heaterTypeAcknowledged: false,
  applianceCheckValveAcknowledged: false,
  bidetVacuumBreakerAcknowledged: false,
  tankPositionAcknowledged: false,
};

export function useMetadataExport(canvasWidth: number, canvasHeight: number) {
  const elements = useCanvasStore((s) => s.elements);
  const pipes = useCanvasStore((s) => s.pipes);
  const sourcePressureBar = useCanvasStore((s) => s.sourcePressureBar);
  const mrlConfig = useUiStore((s) => s.mrlConfig);
  const titleBlock = useUiStore((s) => s.sheetConfig.titleBlock);

  const exportMetadata = useCallback((acks: AcknowledgmentFlags = DEFAULT_ACKS) => {
    const data = buildMetadata(elements, pipes, mrlConfig, canvasWidth, canvasHeight, sourcePressureBar, acks, titleBlock);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schematic_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [elements, pipes, mrlConfig, canvasWidth, canvasHeight, sourcePressureBar, titleBlock]);

  const getMetadata = useCallback((acks: AcknowledgmentFlags = DEFAULT_ACKS) => {
    return buildMetadata(elements, pipes, mrlConfig, canvasWidth, canvasHeight, sourcePressureBar, acks, titleBlock);
  }, [elements, pipes, mrlConfig, canvasWidth, canvasHeight, sourcePressureBar, titleBlock]);

  return { exportMetadata, getMetadata };
}
