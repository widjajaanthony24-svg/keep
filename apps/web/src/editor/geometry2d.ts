import type { Point2, Wall } from "@keep/building-graph";
import { wallLength, boundingBoxOf, isAxisAlignedRectangle } from "@keep/building-graph";

export { boundingBoxOf, isAxisAlignedRectangle };
export type { BoundingBox2D as BoundingBox } from "@keep/building-graph";

/** How close (in metres) the cursor must be to a wall chain's first point to close the loop. */
export const CLOSE_LOOP_SNAP_DISTANCE = 0.3;

export function snapToGrid(p: Point2, gridSize = 0.1): Point2 {
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize,
  };
}

export function distance(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Projects `point` onto the segment a->b. Returns the distance from the
 * segment (perpendicular, or to the nearest endpoint if the projection
 * falls outside the segment) and how far along the segment (in metres
 * from `a`) the closest point sits.
 */
export function projectPointOntoSegment(
  point: Point2,
  a: Point2,
  b: Point2
): { distanceFromSegment: number; alongSegment: number } {
  const segLen = distance(a, b);
  if (segLen === 0) return { distanceFromSegment: distance(point, a), alongSegment: 0 };

  const t = ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / (segLen * segLen);
  const clampedT = Math.max(0, Math.min(1, t));
  const closest: Point2 = {
    x: a.x + clampedT * (b.x - a.x),
    y: a.y + clampedT * (b.y - a.y),
  };
  return { distanceFromSegment: distance(point, closest), alongSegment: clampedT * segLen };
}

/** Finds the closest wall to a plan point, within `maxDistance` metres. */
export function findNearestWall(
  point: Point2,
  walls: Wall[],
  maxDistance = 0.4
): { wall: Wall; alongSegment: number } | null {
  let best: { wall: Wall; alongSegment: number; distanceFromSegment: number } | null = null;

  for (const wall of walls) {
    const { distanceFromSegment, alongSegment } = projectPointOntoSegment(
      point,
      wall.start,
      wall.end
    );
    if (distanceFromSegment <= maxDistance && (!best || distanceFromSegment < best.distanceFromSegment)) {
      best = { wall, alongSegment, distanceFromSegment };
    }
  }

  return best ? { wall: best.wall, alongSegment: best.alongSegment } : null;
}

/** Where an opening sits in plan space, given the wall it's mounted on. */
export function openingPositionOnWall(wall: Wall, offset: number): Point2 {
  const len = wallLength(wall) || 1;
  const t = offset / len;
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  };
}

/** Clamps an opening's offset so it doesn't hang off either end of its wall. */
export function clampOpeningOffset(offset: number, openingWidth: number, wall: Wall): number {
  const margin = openingWidth / 2 + 0.05;
  const length = wallLength(wall);
  return Math.max(margin, Math.min(length - margin, offset));
}

/**
 * Locks `to` onto the nearest 45-degree direction from `from`, at the same
 * distance `to` was at. Used when the person holds Shift while drawing or
 * dragging, so walls come out straight instead of at whatever stray angle
 * the mouse happened to be at.
 */
export function snapToOrtho(from: Point2, to: Point2): Point2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return to;

  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4; // 45 degrees
  const snappedAngle = Math.round(angle / step) * step;

  return {
    x: from.x + Math.cos(snappedAngle) * dist,
    y: from.y + Math.sin(snappedAngle) * dist,
  };
}

export interface VertexRef {
  wallId: string;
  end: "start" | "end";
  point: Point2;
}

/** Finds the closest wall endpoint to a plan point, within `maxDistance` metres. */
export function findNearestVertex(point: Point2, walls: Wall[], maxDistance = 0.25): VertexRef | null {
  let best: VertexRef | null = null;
  let bestDist = Infinity;

  for (const wall of walls) {
    for (const end of ["start", "end"] as const) {
      const p = wall[end];
      const d = distance(point, p);
      if (d <= maxDistance && d < bestDist) {
        bestDist = d;
        best = { wallId: wall.id, end, point: p };
      }
    }
  }
  return best;
}

/** Every (wallId, end) pair whose point coincides with `anchor` — the shared corner to move together. */
export function findCoincidentVertices(
  anchor: Point2,
  walls: Wall[],
  epsilon = 0.02
): { wallId: string; end: "start" | "end" }[] {
  const matches: { wallId: string; end: "start" | "end" }[] = [];
  for (const wall of walls) {
    for (const end of ["start", "end"] as const) {
      if (distance(anchor, wall[end]) <= epsilon) matches.push({ wallId: wall.id, end });
    }
  }
  return matches;
}
