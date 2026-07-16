import type { BuildingGraph } from "./schema.js";

/**
 * A minimal valid BuildingGraph: one empty ground floor level, no walls or
 * elements yet. This is the starting point for a brand-new project in the
 * manual/blank authoring flow (Phase 1).
 */
export function createEmptyBuildingGraph(name: string, id: string): BuildingGraph {
  const now = new Date().toISOString();
  return {
    id,
    name,
    site: {},
    levels: [{ id: "level-1", name: "Ground Floor", elevation: 0, height: 3 }],
    rooms: [],
    walls: [],
    slabs: [],
    roofs: [],
    columns: [],
    beams: [],
    openings: [],
    materials: [],
    metadata: {
      version: "0.1",
      units: "m",
      createdAt: now,
      updatedAt: now,
      source: "manual",
      laborRatePerHour: 25,
      disclaimer:
        "Estimation and sizing figures are preliminary and for planning purposes only. They are not a substitute for review and sign-off by a licensed architect or engineer.",
    },
  };
}
