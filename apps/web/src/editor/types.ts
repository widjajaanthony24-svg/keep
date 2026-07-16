import type { Point2 } from "@keep/building-graph";

export type Tool = "select" | "rectangle" | "wall" | "fence" | "door" | "window" | "delete";

export interface Selection {
  kind: "wall" | "opening";
  id: string;
}

// A wall chain in progress: the plan points placed so far, and the wall
// segment ids created between each consecutive pair. Closing the chain
// (clicking back near points[0]) turns it into a footprint loop.
export interface PendingChain {
  points: Point2[];
  wallIds: string[];
}
