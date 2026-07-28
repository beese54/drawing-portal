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

export interface SegmentIntersection { t: number; u: number; x: number; y: number }

/**
 * Standard parametric line-segment intersection. t is the interpolation parameter
 * along segment 1 (x1,y1)-(x2,y2), u along segment 2 (x3,y3)-(x4,y4); both must be
 * in [0,1] for the segments to actually intersect (not just their infinite lines).
 * Returns null for parallel/collinear segments (denom ~0) — two lines lying on top
 * of each other is a distinct degenerate case, not a single intersection point.
 */
export function segmentIntersection(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): SegmentIntersection | null {
  const d1x = x2 - x1, d1y = y2 - y1;
  const d2x = x4 - x3, d2y = y4 - y3;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x3 - x1) * d2y - (y3 - y1) * d2x) / denom;
  const u = ((x3 - x1) * d1y - (y3 - y1) * d1x) / denom;
  return { t, u, x: x1 + t * d1x, y: y1 + t * d1y };
}
