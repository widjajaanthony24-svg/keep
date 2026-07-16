import type { Point2, Wall } from "./schema.js";

export function distance(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function wallLength(wall: Wall): number {
  return distance(wall.start, wall.end);
}

/** Unit vector pointing from wall.start to wall.end, in the XY (plan) plane. */
export function wallDirection(wall: Wall): Point2 {
  const len = wallLength(wall) || 1;
  return {
    x: (wall.end.x - wall.start.x) / len,
    y: (wall.end.y - wall.start.y) / len,
  };
}

/** Midpoint of a wall in plan. */
export function wallMidpoint(wall: Wall): Point2 {
  return {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  };
}

/** Signed area via the shoelace formula. Positive = counter-clockwise winding. */
export function signedPolygonArea(boundary: Point2[]): number {
  let sum = 0;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Unsigned floor/roof area in m^2, regardless of winding order. */
export function polygonArea(boundary: Point2[]): number {
  return Math.abs(signedPolygonArea(boundary));
}

export function polygonPerimeter(boundary: Point2[]): number {
  let total = 0;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    total += distance(a, b);
  }
  return total;
}

/** Plain centroid (average) of a set of plan points. */
export function centroidOf(points: Point2[]): Point2 {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export interface BoundingBox2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function boundingBoxOf(points: Point2[]): BoundingBox2D {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * True if `boundary` is (approximately) a plain axis-aligned rectangle —
 * exactly 4 corners, each matching the bounding box. Real gable/shed roof
 * geometry assumes this; anything else falls back to a flat plate.
 */
export function isAxisAlignedRectangle(boundary: Point2[], tolerance = 0.05): boolean {
  if (boundary.length !== 4) return false;
  const box = boundingBoxOf(boundary);
  const corners = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  return boundary.every((p) => corners.some((c) => distance(p, c) <= tolerance));
}
