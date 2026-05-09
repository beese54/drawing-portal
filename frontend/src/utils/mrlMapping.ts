/**
 * Convert an mRL value (real-world elevation in metres) to a canvas Y pixel coordinate.
 * mRL increases upward; Konva Y increases downward — so we invert.
 *
 * @param mrl       - Real-world elevation in metres
 * @param canvasH   - Canvas height in pixels
 * @param upperMrl  - mRL at the top of the canvas
 * @param lowerMrl  - mRL at the bottom of the canvas
 */
export function mrlToPixel(
  mrl: number,
  canvasH: number,
  upperMrl: number,
  lowerMrl: number
): number {
  const range = upperMrl - lowerMrl;
  if (range === 0) return canvasH / 2;
  return canvasH - ((mrl - lowerMrl) / range) * canvasH;
}

/**
 * Convert a canvas Y pixel coordinate back to an mRL value.
 */
export function pixelToMrl(
  canvasY: number,
  canvasH: number,
  upperMrl: number,
  lowerMrl: number
): number {
  const range = upperMrl - lowerMrl;
  if (range === 0) return lowerMrl;
  return lowerMrl + ((canvasH - canvasY) / canvasH) * range;
}

/**
 * Compute a nice grid interval for a given mRL range, targeting 6-12 grid lines.
 */
export function getGridInterval(upperMrl: number, lowerMrl: number): number {
  const range = upperMrl - lowerMrl;
  if (range <= 0) return 10;
  const raw = range / 8;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  if (normalized < 1.5) return magnitude;
  if (normalized < 3.5) return 2 * magnitude;
  if (normalized < 7.5) return 5 * magnitude;
  return 10 * magnitude;
}

/**
 * Generate the list of mRL values where grid lines should be drawn.
 */
export function getGridMrlValues(upperMrl: number, lowerMrl: number): number[] {
  const interval = getGridInterval(upperMrl, lowerMrl);
  const start = Math.ceil(lowerMrl / interval) * interval;
  const values: number[] = [];
  for (let v = start; v <= upperMrl; v += interval) {
    values.push(Math.round(v * 100) / 100);
  }
  return values;
}
