import type { Material, MaterialCategory } from "@keep/building-graph";

export const REALIZED_COLORS: Record<MaterialCategory, string> = {
  concrete: "#B8B8B0",
  masonry: "#C9BBA8",
  timber: "#8B5E3C",
  steel: "#8D97A0",
  roofing: "#5B6B73",
  glazing: "#AEE3EA",
  finish: "#DCD6C9",
  insulation: "#E8DFC8",
  other: "#9AA0A6",
};

// Category alone isn't enough to tell materials apart visually — brick and
// concrete block are both "masonry", but should not look identical in
// Realized mode. Keyed by the default material ids (see useBuildingEditor);
// anything not listed here falls back to its category's color.
const MATERIAL_COLOR_OVERRIDES: Record<string, string> = {
  "mat-default-masonry": "#C9BBA8", // concrete block — cool grey-tan
  "mat-default-brick": "#A85C42", // brick veneer — warm terracotta red
  "mat-default-timber-wall": "#B08858", // lighter, more "raw wood" than the door's timber tone
  "mat-default-steel-wall": "#7C8894", // cool blue-grey, distinct from concrete
  "mat-concrete-block": "#C9BBA8", // Phase 0 sample-house material ids
};

export const BLUEPRINT_LINE_COLOR = "#5EC8D8"; // "drafting cyan"
export const BLUEPRINT_BG_COLOR = "#0E1B2E"; // deep ink, darker than the app chrome
export const BLUEPRINT_GRID_COLOR = "#1C3350";

export const REALIZED_BG_COLOR = "#EDEAE2"; // soft daylight studio backdrop

export function realizedColorForCategory(category: MaterialCategory): string {
  return REALIZED_COLORS[category] ?? REALIZED_COLORS.other;
}

export function realizedColorForMaterial(material: Material | undefined): string {
  if (!material) return REALIZED_COLORS.other;
  return MATERIAL_COLOR_OVERRIDES[material.id] ?? realizedColorForCategory(material.category);
}
