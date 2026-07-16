import { z } from "zod";

// ---------------------------------------------------------------------------
// Keep — Building Graph
// ---------------------------------------------------------------------------
// The Building Graph is the single structured description of a building that
// every part of Keep reads from or writes to: the 3D viewer, the AI
// generators (text-to-design, image-to-3D), the estimation engine, and the
// shareable blueprint page all operate on this same shape.
//
// Units: all lengths are in METRES (m) as floating point numbers unless
// noted otherwise. Angles are in DEGREES. This is a design-development /
// estimation model, not a stamped structural document — see
// `metadata.disclaimer`, which every consumer of a BuildingGraph should
// surface to the end user verbatim.
// ---------------------------------------------------------------------------

export const Point2Schema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Point2 = z.infer<typeof Point2Schema>;

export const Point3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});
export type Point3 = z.infer<typeof Point3Schema>;

// A material is defined once in the catalog and referenced by id everywhere
// else in the graph, so the estimation engine can price and quantify every
// element consistently.
export const MaterialCategorySchema = z.enum([
  "concrete",
  "masonry",
  "timber",
  "steel",
  "roofing",
  "glazing",
  "finish",
  "insulation",
  "other",
]);
export type MaterialCategory = z.infer<typeof MaterialCategorySchema>;

export const MaterialSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: MaterialCategorySchema,
  unit: z.enum(["m3", "m2", "m", "kg", "unit"]),
  unitCost: z.number().nonnegative(), // cost per `unit`, in `currency`
  currency: z.string().default("USD"),
  densityKgM3: z.number().positive().optional(), // enables weight-based takeoffs
  laborHoursPerUnit: z.number().nonnegative().optional(), // drives labor estimation
});
export type Material = z.infer<typeof MaterialSchema>;

export const OpeningTypeSchema = z.enum(["door", "window"]);
export type OpeningType = z.infer<typeof OpeningTypeSchema>;

export const OpeningSchema = z.object({
  id: z.string(),
  type: OpeningTypeSchema,
  wallId: z.string(),
  // Distance in metres from the wall's start point to the opening's center.
  offset: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
  sillHeight: z.number().nonnegative().default(0), // 0 for doors
  materialId: z.string().optional(), // e.g. a specific door/window product; falls back to a category default if omitted
});
export type Opening = z.infer<typeof OpeningSchema>;

export const WallSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  start: Point2Schema,
  end: Point2Schema,
  height: z.number().positive(),
  thickness: z.number().positive(),
  materialId: z.string(),
  loadBearing: z.boolean().default(true),
  openingIds: z.array(z.string()).default([]),
});
export type Wall = z.infer<typeof WallSchema>;

export const SlabTypeSchema = z.enum(["floor", "roof-deck", "ceiling"]);
export type SlabType = z.infer<typeof SlabTypeSchema>;

export const SlabSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  type: SlabTypeSchema,
  boundary: z.array(Point2Schema).min(3),
  thickness: z.number().positive(),
  materialId: z.string(),
});
export type Slab = z.infer<typeof SlabSchema>;

export const RoofTypeSchema = z.enum(["flat", "shed", "gable", "hip"]);
export type RoofType = z.infer<typeof RoofTypeSchema>;

export const RoofSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  type: RoofTypeSchema,
  boundary: z.array(Point2Schema).min(3),
  baseHeight: z.number(), // elevation of the roof's base plane, in metres
  pitchDegrees: z.number().min(0).max(89).default(20),
  overhang: z.number().nonnegative().default(0.3),
  thickness: z.number().positive().default(0.2),
  materialId: z.string(),
});
export type Roof = z.infer<typeof RoofSchema>;

// A Room is the closed loop of walls itself — the thing the person actually
// drew — independent of whether it currently has a floor slab or a roof.
// Earlier phases inferred "a room exists" purely from a Slab existing,
// which meant a loop with neither a floor nor a roof (a fence, a low wall
// enclosure) had nowhere to be recorded at all. Slabs and roofs are now
// generated *from* a Room's hasFloor/hasRoof flags, not the other way
// around.
export const RoomSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  boundary: z.array(Point2Schema).min(3),
  hasFloor: z.boolean().default(true),
  hasRoof: z.boolean().default(true),
  roofType: RoofTypeSchema.default("flat"),
  roofPitchDegrees: z.number().min(0).max(89).default(20),
});
export type Room = z.infer<typeof RoomSchema>;

export const ColumnSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  position: Point2Schema,
  height: z.number().positive(),
  width: z.number().positive(),
  depth: z.number().positive(),
  materialId: z.string(),
});
export type Column = z.infer<typeof ColumnSchema>;

export const BeamSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  start: Point2Schema,
  end: Point2Schema,
  width: z.number().positive(),
  depth: z.number().positive(),
  materialId: z.string(),
});
export type Beam = z.infer<typeof BeamSchema>;

export const LevelSchema = z.object({
  id: z.string(),
  name: z.string(),
  elevation: z.number(), // metres above the site datum
  height: z.number().positive(), // floor-to-floor height
});
export type Level = z.infer<typeof LevelSchema>;

export const SiteSchema = z.object({
  boundary: z.array(Point2Schema).min(3).optional(),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});
export type Site = z.infer<typeof SiteSchema>;

export const BuildingGraphMetadataSchema = z.object({
  version: z.literal("0.1"),
  units: z.literal("m"),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: z.enum(["manual", "ai-text", "ai-image", "import"]).default("manual"),
  laborRatePerHour: z.number().nonnegative().default(25),
  disclaimer: z
    .string()
    .default(
      "Estimation and sizing figures are preliminary and for planning purposes only. They are not a substitute for review and sign-off by a licensed architect or engineer."
    ),
});
export type BuildingGraphMetadata = z.infer<typeof BuildingGraphMetadataSchema>;

export const BuildingGraphSchema = z.object({
  id: z.string(),
  name: z.string(),
  site: SiteSchema.default({}),
  levels: z.array(LevelSchema).min(1),
  rooms: z.array(RoomSchema).default([]),
  walls: z.array(WallSchema).default([]),
  slabs: z.array(SlabSchema).default([]),
  roofs: z.array(RoofSchema).default([]),
  columns: z.array(ColumnSchema).default([]),
  beams: z.array(BeamSchema).default([]),
  openings: z.array(OpeningSchema).default([]),
  materials: z.array(MaterialSchema).default([]),
  metadata: BuildingGraphMetadataSchema,
});
export type BuildingGraph = z.infer<typeof BuildingGraphSchema>;

export function parseBuildingGraph(data: unknown): BuildingGraph {
  return BuildingGraphSchema.parse(data);
}

export function validateBuildingGraph(data: unknown) {
  return BuildingGraphSchema.safeParse(data);
}
