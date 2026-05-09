/**
 * Euclidean distance between two points.
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Angle in degrees of the vector from (x1,y1) to (x2,y2), measured clockwise from east (right).
 */
export function angleDeg(x1: number, y1: number, x2: number, y2: number): number {
  return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
}

/**
 * Closest point on segment (x1,y1)→(x2,y2) to point (px,py).
 * Returns the point coords and the interpolation parameter t ∈ [0,1].
 */
export function closestPointOnSegment(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number
): { x: number; y: number; t: number } {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: x1, y: y1, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return { x: x1 + t * dx, y: y1 + t * dy, t };
}
