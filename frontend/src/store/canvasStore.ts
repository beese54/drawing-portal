import { create } from 'zustand';
import { CanvasElement, PipeMaterial, NominalSizeMm, PipeElement, TankProperties } from '../types';
import { SYMBOL_PORTS, rotateOffset } from '../utils/symbolPorts';

interface PipeProperties {
  lengthM?: number;
  nominalSizeMm?: NominalSizeMm;
  material?: PipeMaterial;
}

interface Clipboard {
  elements: CanvasElement[];
  pipes: PipeElement[];
}

interface CanvasStore {
  elements: CanvasElement[];
  pipes: PipeElement[];
  selectedId: string | null;
  selectedIds: string[];
  sourcePressureBar: number | null;
  clipboard: Clipboard | null;
  copySelection: () => void;
  pasteClipboard: () => void;
  addElement: (el: CanvasElement) => void;
  loadTemplate: (elements: CanvasElement[], pipes: PipeElement[]) => void;
  updateElementPosition: (id: string, x: number, y: number) => void;
  moveElement: (
    id: string,
    newX: number,
    newY: number,
    oldPorts: { x: number; y: number }[],
    newPorts: { x: number; y: number }[]
  ) => void;
  moveMultiple: (elementIds: string[], dx: number, dy: number) => void;
  updateElementRotation: (id: string, rotation: number) => void;
  updateElementScaleX: (id: string, scaleX: number) => void;
  updateFittingType: (id: string, fittingType: string) => void;
  updateEfficiencyRating: (id: string, rating: 2 | 3) => void;
  updateLongBathCapacity: (id: string, capacityL: number) => void;
  addPipe: (pipe: PipeElement) => void;
  updatePipeEndpoints: (id: string, startX: number, startY: number, endX: number, endY: number) => void;
  insertElementOnPipe: (pipeId: string, element: CanvasElement, snapX: number, snapY: number, terminatePipe?: boolean) => void;
  insertElementOnPipeInline: (pipeId: string, element: CanvasElement, inletPos: { x: number; y: number }, outletPos: { x: number; y: number }) => void;
  removeElement: (id: string) => void;
  removePipe: (id: string) => void;
  clearCanvas: () => void;
  setSelected: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  updatePipeProperties: (id: string, props: PipeProperties) => void;
  updateTankProperties: (id: string, props: Partial<TankProperties>) => void;
  updateCarriesFluid: (id: string, fluid: 'cold' | 'hot' | undefined) => void;
  setSourcePressure: (bar: number | null) => void;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  elements: [],
  pipes: [],
  selectedId: null,
  selectedIds: [],
  sourcePressureBar: null,
  clipboard: null,

  addElement: (el) =>
    set((state) => ({ elements: [...state.elements, el] })),

  loadTemplate: (elements, pipes) =>
    set({ elements, pipes, selectedId: null, selectedIds: [] }),

  updateElementPosition: (id, x, y) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, x, y } : el
      ),
    })),

  moveElement: (id, newX, newY, oldPorts, newPorts) =>
    set((state) => {
      // Snap threshold: pipe endpoints are created from exact arithmetic so 2px is plenty
      const MATCH = 2;
      const updatedPipes = state.pipes.map((pipe) => {
        let { startX, startY, endX, endY } = pipe;
        for (let i = 0; i < oldPorts.length; i++) {
          const op = oldPorts[i];
          const np = newPorts[i];
          if (Math.hypot(startX - op.x, startY - op.y) < MATCH) {
            startX = np.x;
            startY = np.y;
          }
          if (Math.hypot(endX - op.x, endY - op.y) < MATCH) {
            endX = np.x;
            endY = np.y;
          }
        }
        return { ...pipe, startX, startY, endX, endY };
      });
      return {
        elements: state.elements.map((el) =>
          el.id === id ? { ...el, x: newX, y: newY } : el
        ),
        pipes: updatedPipes,
      };
    }),

  moveMultiple: (elementIds, dx, dy) =>
    set((state) => {
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return {};
      const idSet = new Set(elementIds);
      const selectedEls = state.elements.filter((e) => idSet.has(e.id));
      const MATCH = 3;

      // Collect old absolute port positions for all moving elements
      const oldPorts: { x: number; y: number }[] = [];
      for (const el of selectedEls) {
        const ports = SYMBOL_PORTS[el.symbolId] ?? [];
        for (const port of ports) {
          const rot = rotateOffset(port.offsetX * (el.scaleX ?? 1), port.offsetY, el.rotation);
          oldPorts.push({ x: el.x + rot.x, y: el.y + rot.y });
        }
      }

      const newElements = state.elements.map((el) =>
        idSet.has(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el
      );

      // Move any pipe endpoint that was touching a selected element's port
      const newPipes = state.pipes.map((pipe) => {
        let { startX, startY, endX, endY } = pipe;
        let startMoved = false;
        let endMoved = false;
        for (const op of oldPorts) {
          if (!startMoved && Math.hypot(startX - op.x, startY - op.y) < MATCH) {
            startX += dx; startY += dy; startMoved = true;
          }
          if (!endMoved && Math.hypot(endX - op.x, endY - op.y) < MATCH) {
            endX += dx; endY += dy; endMoved = true;
          }
          if (startMoved && endMoved) break;
        }
        return { ...pipe, startX, startY, endX, endY };
      });

      return { elements: newElements, pipes: newPipes };
    }),

  updateElementRotation: (id, rotation) =>
    set((state) => {
      const el = state.elements.find((e) => e.id === id);
      if (!el) return {};
      const ports = SYMBOL_PORTS[el.symbolId] ?? [];
      const sx = el.scaleX ?? 1;
      // Use a generous threshold (20px) to catch endpoints that may be slightly off-centre
      const MATCH = 20;
      const oldPorts = ports.map((port) => {
        const rot = rotateOffset(port.offsetX * sx, port.offsetY, el.rotation);
        return { x: el.x + rot.x, y: el.y + rot.y };
      });
      const newPorts = ports.map((port) => {
        const rot = rotateOffset(port.offsetX * sx, port.offsetY, rotation);
        return { x: el.x + rot.x, y: el.y + rot.y };
      });
      const updatedPipes = state.pipes.map((pipe) => {
        let { startX, startY, endX, endY } = pipe;
        for (let i = 0; i < oldPorts.length; i++) {
          const op = oldPorts[i];
          const np = newPorts[i];
          if (Math.hypot(startX - op.x, startY - op.y) < MATCH) {
            startX = np.x; startY = np.y;
          }
          if (Math.hypot(endX - op.x, endY - op.y) < MATCH) {
            endX = np.x; endY = np.y;
          }
        }
        return { ...pipe, startX, startY, endX, endY };
      });
      return {
        elements: state.elements.map((e) => e.id === id ? { ...e, rotation } : e),
        pipes: updatedPipes,
      };
    }),

  updateElementScaleX: (id, scaleX) =>
    set((state) => {
      const el = state.elements.find((e) => e.id === id);
      if (!el) return {};
      const ports = SYMBOL_PORTS[el.symbolId] ?? [];
      const MATCH = 20;
      const oldPorts = ports.map((port) => {
        const rot = rotateOffset(port.offsetX * (el.scaleX ?? 1), port.offsetY, el.rotation);
        return { x: el.x + rot.x, y: el.y + rot.y };
      });
      const newPorts = ports.map((port) => {
        const rot = rotateOffset(port.offsetX * scaleX, port.offsetY, el.rotation);
        return { x: el.x + rot.x, y: el.y + rot.y };
      });
      const updatedPipes = state.pipes.map((pipe) => {
        let { startX, startY, endX, endY } = pipe;
        for (let i = 0; i < oldPorts.length; i++) {
          const op = oldPorts[i];
          const np = newPorts[i];
          if (Math.hypot(startX - op.x, startY - op.y) < MATCH) {
            startX = np.x; startY = np.y;
          }
          if (Math.hypot(endX - op.x, endY - op.y) < MATCH) {
            endX = np.x; endY = np.y;
          }
        }
        return { ...pipe, startX, startY, endX, endY };
      });
      return {
        elements: state.elements.map((e) => e.id === id ? { ...e, scaleX } : e),
        pipes: updatedPipes,
      };
    }),

  updateFittingType: (id, fittingType) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, fittingType } : el
      ),
    })),

  updateEfficiencyRating: (id, efficiencyRating) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, efficiencyRating } : el
      ),
    })),

  updateLongBathCapacity: (id, longBathCapacityL) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, longBathCapacityL } : el
      ),
    })),

  addPipe: (pipe) =>
    set((state) => ({ pipes: [...state.pipes, pipe] })),

  updatePipeEndpoints: (id, startX, startY, endX, endY) =>
    set((state) => ({
      pipes: state.pipes.map((p) =>
        p.id === id ? { ...p, startX, startY, endX, endY } : p
      ),
    })),

  insertElementOnPipe: (pipeId, element, snapX, snapY, terminatePipe = false) =>
    set((state) => {
      const orig = state.pipes.find((p) => p.id === pipeId);
      if (!orig) return { elements: [...state.elements, element] };
      const pipeA: PipeElement = {
        id: crypto.randomUUID(),
        pipeType: orig.pipeType,
        startX: orig.startX,
        startY: orig.startY,
        endX: snapX,
        endY: snapY,
      };
      const newPipes = terminatePipe
        ? [...state.pipes.filter((p) => p.id !== pipeId), pipeA]
        : [
            ...state.pipes.filter((p) => p.id !== pipeId),
            pipeA,
            {
              id: crypto.randomUUID(),
              pipeType: orig.pipeType,
              startX: snapX,
              startY: snapY,
              endX: orig.endX,
              endY: orig.endY,
            } as PipeElement,
          ];
      return {
        elements: [...state.elements, element],
        pipes: newPipes,
      };
    }),

  insertElementOnPipeInline: (pipeId, element, inletPos, outletPos) =>
    set((state) => {
      const orig = state.pipes.find((p) => p.id === pipeId);
      if (!orig) return { elements: [...state.elements, element] };

      const origDx = orig.endX - orig.startX;
      const origDy = orig.endY - orig.startY;
      const newPipes: PipeElement[] = state.pipes.filter((p) => p.id !== pipeId);

      // pipeA: original start → inlet. Skip if zero-length (snap was at pipe start).
      const pipeALen = Math.hypot(inletPos.x - orig.startX, inletPos.y - orig.startY);
      if (pipeALen > 1) {
        newPipes.push({
          id: crypto.randomUUID(),
          pipeType: orig.pipeType,
          startX: orig.startX,
          startY: orig.startY,
          endX: inletPos.x,
          endY: inletPos.y,
        });
      }

      // pipeB: outlet → original end. Skip if zero-length or backwards
      // (snap was at pipe end — outlet would be past the pipe's endpoint).
      const pipeBdx = orig.endX - outletPos.x;
      const pipeBdy = orig.endY - outletPos.y;
      const pipeBLen = Math.hypot(pipeBdx, pipeBdy);
      const sameDir = pipeBdx * origDx + pipeBdy * origDy >= 0;
      if (pipeBLen > 1 && sameDir) {
        newPipes.push({
          id: crypto.randomUUID(),
          pipeType: orig.pipeType,
          startX: outletPos.x,
          startY: outletPos.y,
          endX: orig.endX,
          endY: orig.endY,
        });
      }

      return {
        elements: [...state.elements, element],
        pipes: newPipes,
      };
    }),

  removeElement: (id) =>
    set((state) => ({
      elements: state.elements.filter((el) => el.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
    })),

  removePipe: (id) =>
    set((state) => ({
      pipes: state.pipes.filter((p) => p.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
    })),

  clearCanvas: () =>
    set({ elements: [], pipes: [], selectedId: null, selectedIds: [] }),

  setSelected: (id) =>
    set({ selectedId: id, selectedIds: [] }),

  setSelectedIds: (ids) =>
    set({ selectedIds: ids, selectedId: null }),

  updatePipeProperties: (id, props) =>
    set((state) => ({
      pipes: state.pipes.map((p) => p.id === id ? { ...p, ...props } : p),
    })),

  updateTankProperties: (id, props) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id
          ? { ...el, tankProperties: { ...(el.tankProperties ?? {}), ...props } }
          : el
      ),
    })),

  updateCarriesFluid: (id, fluid) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, carriesFluid: fluid } : el
      ),
    })),

  setSourcePressure: (bar) =>
    set({ sourcePressureBar: bar }),

  copySelection: () => {
    const state = get();
    const ids = state.selectedIds.length > 0
      ? new Set(state.selectedIds)
      : state.selectedId ? new Set([state.selectedId]) : new Set<string>();
    if (ids.size === 0) return;

    const selectedEls = state.elements.filter((el) => ids.has(el.id));

    // Collect absolute port positions for all selected elements
    const MATCH = 20;
    const selectedPortPositions: { x: number; y: number }[] = [];
    for (const el of selectedEls) {
      const ports = SYMBOL_PORTS[el.symbolId] ?? [];
      for (const port of ports) {
        const rot = rotateOffset(port.offsetX * (el.scaleX ?? 1), port.offsetY, el.rotation);
        selectedPortPositions.push({ x: el.x + rot.x, y: el.y + rot.y });
      }
    }

    const isNearSelectedPort = (x: number, y: number) =>
      selectedPortPositions.some((p) => Math.hypot(p.x - x, p.y - y) < MATCH);

    // Include a pipe only if BOTH its endpoints touch selected element ports
    // (or if only one touches, include it — keeps terminal pipes attached)
    const selectedPipes = state.pipes.filter((pipe) => {
      const startHit = isNearSelectedPort(pipe.startX, pipe.startY);
      const endHit = isNearSelectedPort(pipe.endX, pipe.endY);
      return startHit && endHit;
    });

    set({ clipboard: { elements: selectedEls, pipes: selectedPipes } });
  },

  pasteClipboard: () => {
    const state = get();
    if (!state.clipboard || state.clipboard.elements.length === 0) return;

    const OFFSET = 40;

    const newElements: CanvasElement[] = state.clipboard.elements.map((el) => ({
      ...el,
      id: crypto.randomUUID(),
      x: el.x + OFFSET,
      y: el.y + OFFSET,
    }));

    const newPipes: PipeElement[] = state.clipboard.pipes.map((pipe) => ({
      ...pipe,
      id: crypto.randomUUID(),
      startX: pipe.startX + OFFSET,
      startY: pipe.startY + OFFSET,
      endX: pipe.endX + OFFSET,
      endY: pipe.endY + OFFSET,
    }));

    const newIds = newElements.map((el) => el.id);

    set({
      elements: [...state.elements, ...newElements],
      pipes: [...state.pipes, ...newPipes],
      selectedIds: newIds,
      selectedId: null,
    });
  },
}));
