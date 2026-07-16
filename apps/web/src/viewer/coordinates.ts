import type { Point2, Wall } from "@keep/building-graph";
import { wallDirection, centroidOf } from "@keep/building-graph";

export { centroidOf };

// Building Graph plan space is (x, y) in metres, looking down from above.
// three.js world space is (x, y-up, z). We map plan.x -> world.x,
// plan.y -> world.-z, and an explicit elevation -> world.y. Every mesh
// builder in this folder must go through `toWorld` rather than inventing
// its own mapping, so walls, openings, slabs, and roofs stay aligned.
export function toWorld(p: Point2, elevation: number): [number, number, number] {
  return [p.x, elevation, -p.y];
}

// Rotation (radians) around the world Y axis that points a box's local
// +X axis along a wall's direction. Derived so it lines up with the
// toWorld mapping above — see README-viewer.md for the derivation.
export function wallRotationY(wall: Wall): number {
  return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
}

/** A point `distance` metres along the wall, measured from wall.start, in plan space. */
export function pointAlongWall(wall: Wall, distance: number): Point2 {
  const dir = wallDirection(wall);
  return {
    x: wall.start.x + dir.x * distance,
    y: wall.start.y + dir.y * distance,
  };
}

/**
 * The outward-facing normal of a wall in plan space (unit length).
 *
 * A fixed 90-degree rotation of the wall direction isn't enough here: which
 * perpendicular is "outward" depends on which way the loop was wound when it
 * was drawn (clockwise vs counter-clockwise), and Phase 1's freeform wall
 * tool doesn't enforce a winding direction. So instead we compute both
 * candidate perpendiculars and pick whichever one points away from the
 * room's centroid — this is correct regardless of winding order, for any
 * reasonably room-shaped (non-self-intersecting, roughly convex) footprint.
 */
export function wallNormal(wall: Wall, roomCentroid?: Point2): Point2 {
  const dir = wallDirection(wall);
  const candidateA: Point2 = { x: -dir.y, y: dir.x };

  if (!roomCentroid) return candidateA;

  const mid: Point2 = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const towardMid = { x: mid.x - roomCentroid.x, y: mid.y - roomCentroid.y };
  const dot = candidateA.x * towardMid.x + candidateA.y * towardMid.y;
  return dot >= 0 ? candidateA : { x: -candidateA.x, y: -candidateA.y };
}
