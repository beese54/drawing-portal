import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ActiveTool, FloorLevel, MrlConfig, MRL_LOWER_HARD_MIN, SheetConfig, TitleBlockData, DEFAULT_SHEET_CONFIG, getUpperMrl, PAPER_SIZES_MM, SHEET_PX_PER_MM } from '../types';
import type { CanvasElement, PipeElement } from '../types';
import { useCanvasStore } from './canvasStore';

export interface PendingTemplate {
  name: string;
  elements: CanvasElement[];
  pipes: PipeElement[];
}

export interface PdfBackground {
  dataUrl: string;
  x: number;      // center x in content coords
  y: number;      // center y in content coords
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  opacity: number; // 0–1
}

export interface BidetToast {
  tapElementId: string;
  tapX: number;
  tapY: number;
}

export interface DcvToast {
  elementId: string;
  elementX: number;
  elementY: number;
  pipeId: string;
}

interface UiStore {
  activeTool: ActiveTool;
  mrlConfig: MrlConfig;
  floorLevels: FloorLevel[];
  draggingSymbolId: string | null;
  pendingSymbol: { id: string; name: string } | null;
  pendingTemplate: PendingTemplate | null;
  exportJpgFn: (() => void) | null;
  pdfBackground: PdfBackground | null;
  pdfImportFn: ((file: File) => Promise<void>) | null;
  sheetConfig: SheetConfig;
  sheetSetupOpen: boolean;
  sheetSetupInitialTab: 'sheet' | 'titleblock';
  bidetToast: BidetToast | null;
  dcvToast: DcvToast | null;
  floorLevelOpacity: number;
  setActiveTool: (tool: ActiveTool) => void;
  setMrlConfig: (config: Partial<MrlConfig>) => void;
  addFloorLevel: (floor: Omit<FloorLevel, 'id'>) => void;
  updateFloorLevel: (id: string, changes: Partial<Omit<FloorLevel, 'id'>>) => void;
  removeFloorLevel: (id: string) => void;
  setDraggingSymbolId: (id: string | null) => void;
  setPendingSymbol: (sym: { id: string; name: string } | null) => void;
  setPendingTemplate: (t: PendingTemplate | null) => void;
  registerExportJpg: (fn: () => void) => void;
  setPdfBackground: (bg: PdfBackground | null) => void;
  updatePdfBackground: (props: Partial<PdfBackground>) => void;
  registerPdfImport: (fn: (file: File) => Promise<void>) => void;
  setSheetConfig: (cfg: SheetConfig) => void;
  setTitleBlock: (tb: TitleBlockData) => void;
  resetTitleBlock: () => void;
  openSheetSetup: () => void;
  openSheetSetupAtTitleBlock: () => void;
  closeSheetSetup: () => void;
  showBidetToast: (tapElementId: string, tapX: number, tapY: number) => void;
  dismissBidetToast: () => void;
  showDcvToast: (elementId: string, elementX: number, elementY: number, pipeId: string) => void;
  dismissDcvToast: () => void;
  setFloorLevelOpacity: (opacity: number) => void;
}

export const useUiStore = create<UiStore>()(persist((set, get) => ({
  activeTool: 'select',
  mrlConfig: {
    lowerMrl: 40,
    upperMrl: getUpperMrl(40, DEFAULT_SHEET_CONFIG),
  },
  floorLevels: [],
  draggingSymbolId: null,
  pendingSymbol: null,
  pendingTemplate: null,
  exportJpgFn: null,
  pdfBackground: null,
  pdfImportFn: null,
  sheetConfig: DEFAULT_SHEET_CONFIG,
  sheetSetupOpen: true,
  sheetSetupInitialTab: 'sheet' as const,
  bidetToast: null,
  dcvToast: null,
  floorLevelOpacity: 1,

  setActiveTool: (tool) => set({ activeTool: tool }),
  setDraggingSymbolId: (id) => set({ draggingSymbolId: id }),
  setPendingSymbol: (sym) => set({ pendingSymbol: sym }),
  setPendingTemplate: (t) => set({ pendingTemplate: t }),
  registerExportJpg: (fn) => set({ exportJpgFn: fn }),
  setPdfBackground: (bg) => set({ pdfBackground: bg }),
  updatePdfBackground: (props) => set((state) => ({
    pdfBackground: state.pdfBackground ? { ...state.pdfBackground, ...props } : null,
  })),
  registerPdfImport: (fn) => set({ pdfImportFn: fn }),
  setSheetConfig: (cfg) => {
    const { sheetConfig: prev, mrlConfig } = get();
    if (cfg.drawingScale !== prev.drawingScale) {
      // Use the OLD paper size's height as the bottom anchor (lowerMRL position)
      const virtualH = PAPER_SIZES_MM[prev.paperSize].h * SHEET_PX_PER_MM;
      useCanvasStore.getState().rescaleAll(prev.drawingScale, cfg.drawingScale, virtualH);
    }
    set({ sheetConfig: cfg, mrlConfig: { lowerMrl: mrlConfig.lowerMrl, upperMrl: getUpperMrl(mrlConfig.lowerMrl, cfg) } });
  },
  setTitleBlock: (tb) => set((state) => ({ sheetConfig: { ...state.sheetConfig, titleBlock: tb } })),
  resetTitleBlock: () => set((state) => ({ sheetConfig: { ...state.sheetConfig, titleBlock: DEFAULT_SHEET_CONFIG.titleBlock } })),
  openSheetSetup: () => set({ sheetSetupOpen: true, sheetSetupInitialTab: 'sheet' }),
  openSheetSetupAtTitleBlock: () => set({ sheetSetupOpen: true, sheetSetupInitialTab: 'titleblock' }),
  closeSheetSetup: () => set({ sheetSetupOpen: false }),
  showBidetToast: (tapElementId, tapX, tapY) => set({ bidetToast: { tapElementId, tapX, tapY } }),
  dismissBidetToast: () => set({ bidetToast: null }),
  showDcvToast: (elementId, elementX, elementY, pipeId) => set({ dcvToast: { elementId, elementX, elementY, pipeId } }),
  dismissDcvToast: () => set({ dcvToast: null }),
  setFloorLevelOpacity: (opacity) => set({ floorLevelOpacity: Math.max(0, Math.min(1, opacity)) }),

  addFloorLevel: (floor) =>
    set((state) => ({
      floorLevels: [...state.floorLevels, { id: crypto.randomUUID(), ...floor }]
        .sort((a, b) => a.fflM - b.fflM),
    })),

  updateFloorLevel: (id, changes) =>
    set((state) => ({
      floorLevels: state.floorLevels
        .map((f) => f.id === id ? { ...f, ...changes } : f)
        .sort((a, b) => a.fflM - b.fflM),
    })),

  removeFloorLevel: (id) =>
    set((state) => ({
      floorLevels: state.floorLevels.filter((f) => f.id !== id),
    })),

  setMrlConfig: (partial) => {
    // Only lowerMrl is user-configurable; upperMrl is always derived from sheetConfig
    const lowerMrl = Math.max(MRL_LOWER_HARD_MIN, partial.lowerMrl ?? get().mrlConfig.lowerMrl);
    set({ mrlConfig: { lowerMrl, upperMrl: getUpperMrl(lowerMrl, get().sheetConfig) } });
  },
}), {
  name: 'schematic-ui',
  version: 1,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    sheetConfig:       state.sheetConfig,
    mrlConfig:         state.mrlConfig,
    floorLevels:       state.floorLevels,
    sheetSetupOpen:    state.sheetSetupOpen,
    floorLevelOpacity: state.floorLevelOpacity,
  }),
  migrate: (_persisted, version) => {
    if (version < 1) return {} as UiStore;
    return _persisted as UiStore;
  },
}));
