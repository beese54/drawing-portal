import type { ExportedElement, ExportedPipe } from '../types';

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MARGIN_RATIO = 0.15;
const MIN_MARGIN_PX = 40;

function symbolBbox(el: ExportedElement): [number, number, number, number] | null {
  const cx = el.position?.canvas_x;
  const cy = el.position?.canvas_y;
  if (cx == null || cy == null) return null;
  const w = el.width || 0;
  const h = el.height || 0;
  const rot = ((el.rotation_deg || 0) * Math.PI) / 180;
  const hw = w / 2;
  const hh = h / 2;
  const corners: Array<[number, number]> = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const xs = corners.map(([dx, dy]) => cx + dx * cos - dy * sin);
  const ys = corners.map(([dx, dy]) => cy + dx * sin + dy * cos);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function pipeBbox(pipe: ExportedPipe): [number, number, number, number] | null {
  const xs = [pipe.start?.canvas_x, pipe.end?.canvas_x].filter((v): v is number => v != null);
  const ys = [pipe.start?.canvas_y, pipe.end?.canvas_y].filter((v): v is number => v != null);
  if (xs.length < 2 || ys.length < 2) return null;
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Canvas-space crop region (with margin) around the given element/pipe ids —
 * mirrors backend/app/services/image_annotator.py's crop bbox math, since both
 * sides need to agree on where a "focus" crop for a compliance issue sits.
 * Returns null if none of the ids resolve to a real element/pipe (caller
 * should leave that row's image blank).
 */
export function computeCropRegion(
  elementIds: string[],
  elements: ExportedElement[],
  pipes: ExportedPipe[],
): CropRegion | null {
  const elemById = new Map(elements.map((e) => [e.id, e]));
  const pipeById = new Map(pipes.map((p) => [p.id, p]));

  const boxes: Array<[number, number, number, number]> = [];
  for (const id of elementIds) {
    const el = elemById.get(id);
    const pipe = pipeById.get(id);
    const box = el ? symbolBbox(el) : pipe ? pipeBbox(pipe) : null;
    if (box) boxes.push(box);
  }
  if (boxes.length === 0) return null;

  let xMin = Math.min(...boxes.map((b) => b[0]));
  let yMin = Math.min(...boxes.map((b) => b[1]));
  let xMax = Math.max(...boxes.map((b) => b[2]));
  let yMax = Math.max(...boxes.map((b) => b[3]));

  const marginX = Math.max(MIN_MARGIN_PX, (xMax - xMin) * MARGIN_RATIO);
  const marginY = Math.max(MIN_MARGIN_PX, (yMax - yMin) * MARGIN_RATIO);
  xMin -= marginX;
  xMax += marginX;
  yMin -= marginY;
  yMax += marginY;

  return { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin };
}
