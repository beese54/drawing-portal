import { create } from 'zustand';
import { ActiveTool, FloorLevel, MrlConfig, MRL_LOWER_HARD_MIN, MRL_UPPER_HARD_MAX } from '../types';

export interface PdfBackground {
  dataUrl: string;
  x: number;      // center x in content coords
  y: number;      // center y in content coords
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
}

interface UiStore {
  activeTool: ActiveTool;
  mrlConfig: MrlConfig;
  floorLevels: FloorLevel[];
  draggingSymbolId: string | null;
  pendingSymbol: { id: string; name: string } | null;
  exportJpgFn: (() => void) | null;
  pdfBackground: PdfBackground | null;
  pdfImportFn: ((file: File) => Promise<void>) | null;
  setActiveTool: (tool: ActiveTool) => void;
  setMrlConfig: (config: Partial<MrlConfig>) => void;
  addFloorLevel: (floor: Omit<FloorLevel, 'id'>) => void;
  updateFloorLevel: (id: string, changes: Partial<Omit<FloorLevel, 'id'>>) => void;
  removeFloorLevel: (id: string) => void;
  setDraggingSymbolId: (id: string | null) => void;
  setPendingSymbol: (sym: { id: string; name: string } | null) => void;
  registerExportJpg: (fn: () => void) => void;
  setPdfBackground: (bg: PdfBackground | null) => void;
  updatePdfBackground: (props: Partial<PdfBackground>) => void;
  registerPdfImport: (fn: (file: File) => Promise<void>) => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  activeTool: 'select',
  mrlConfig: {
    upperMrl: 60,
    lowerMrl: 40,
  },
  floorLevels: [],
  draggingSymbolId: null,
  pendingSymbol: null,
  exportJpgFn: null,
  pdfBackground: null,
  pdfImportFn: null,

  setActiveTool: (tool) => set({ activeTool: tool }),
  setDraggingSymbolId: (id) => set({ draggingSymbolId: id }),
  setPendingSymbol: (sym) => set({ pendingSymbol: sym }),
  registerExportJpg: (fn) => set({ exportJpgFn: fn }),
  setPdfBackground: (bg) => set({ pdfBackground: bg }),
  updatePdfBackground: (props) => set((state) => ({
    pdfBackground: state.pdfBackground ? { ...state.pdfBackground, ...props } : null,
  })),
  registerPdfImport: (fn) => set({ pdfImportFn: fn }),

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
    const current = get().mrlConfig;
    const next = { ...current, ...partial };
    // Enforce hard caps
    next.lowerMrl = Math.max(MRL_LOWER_HARD_MIN, Math.min(next.lowerMrl, MRL_UPPER_HARD_MAX - 1));
    next.upperMrl = Math.max(MRL_LOWER_HARD_MIN + 1, Math.min(next.upperMrl, MRL_UPPER_HARD_MAX));
    // Ensure lower < upper
    if (next.lowerMrl >= next.upperMrl) {
      next.lowerMrl = next.upperMrl - 1;
    }
    set({ mrlConfig: next });
  },
}));
