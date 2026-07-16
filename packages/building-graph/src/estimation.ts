import type { BuildingGraph, Material, MaterialCategory } from "./schema.js";
import { polygonArea, wallLength } from "./geometry.js";

export interface EstimateLineItem {
  materialId: string;
  materialName: string;
  category: MaterialCategory;
  quantity: number;
  unit: Material["unit"];
  unitCost: number;
  materialCost: number;
  laborHours: number;
  laborCost: number;
  totalCost: number;
}

export interface EstimateResult {
  lineItems: EstimateLineItem[];
  totalMaterialCost: number;
  totalLaborCost: number;
  totalCost: number;
  totalLaborHours: number;
  currency: string;
  laborRatePerHour: number;
  disclaimer: string;
  exclusions: string;
}

const ESTIMATE_DISCLAIMER =
  "Rough, preliminary estimate from geometry and default unit costs — not a quote. Unit prices vary by region and market conditions; edit each material's cost to match your own market before relying on this number.";

const ESTIMATE_EXCLUSIONS =
  "Excludes: plumbing, electrical, HVAC, interior finishes, paint/plaster, rebar/reinforcement, foundations, permits, and site work. Covers only the structural shell — walls, floor slabs, roofs, doors, and windows.";

/**
 * Finds a material to price an opening with: its own materialId if set,
 * otherwise the first *unit-priced* material matching a sensible category
 * for its type (timber for doors, glazing for windows). The unit filter
 * matters: without it, a category match could land on an area-priced wall
 * material of the same category (e.g. "Timber stud wall") ahead of the
 * actual per-unit door material in the list, silently merging a door's
 * count into an unrelated wall's area instead of its own line item.
 */
function materialForOpening(
  opening: { type: "door" | "window"; materialId?: string },
  materials: Material[]
): Material | null {
  if (opening.materialId) {
    const explicit = materials.find((m) => m.id === opening.materialId);
    if (explicit) return explicit;
  }
  const fallbackCategory: MaterialCategory = opening.type === "door" ? "timber" : "glazing";
  return (
    materials.find((m) => m.category === fallbackCategory && m.unit === "unit") ??
    materials.find((m) => m.category === fallbackCategory) ??
    null
  );
}

/**
 * Computes a quantity + cost breakdown for a BuildingGraph. Deterministic
 * and pure — same graph in, same numbers out, no hidden state. Quantities
 * (areas, volumes, counts) come straight from the graph's own geometry;
 * only unit costs and the labor rate are assumptions, and both are visible,
 * editable inputs (material.unitCost, laborRatePerHour) rather than baked
 * in, so the person using this can correct them for their own market.
 */
export function computeEstimate(graph: BuildingGraph, laborRateOverride?: number): EstimateResult {
  const laborRatePerHour = laborRateOverride ?? graph.metadata.laborRatePerHour;
  const quantityByMaterial = new Map<string, number>();

  function addQuantity(materialId: string | undefined, amount: number) {
    if (!materialId || amount <= 0) return;
    quantityByMaterial.set(materialId, (quantityByMaterial.get(materialId) ?? 0) + amount);
  }

  function quantityFor(material: Material, area: number, thickness: number): number {
    // Volume-priced materials (e.g. concrete, sold per m3) need area x thickness;
    // everything else (m2 wall/roof sheet, m for linear items) uses area directly.
    return material.unit === "m3" ? area * thickness : area;
  }

  const materialsById = new Map(graph.materials.map((m) => [m.id, m]));

  // Walls: net area (gross minus its own openings), by material — except
  // linear-priced materials (railings/fencing), which are quantified by
  // run length instead of area, since "per m2 of wall" doesn't make sense
  // for a railing.
  for (const wall of graph.walls) {
    const material = materialsById.get(wall.materialId);
    if (!material) continue;
    if (material.unit === "m") {
      addQuantity(wall.materialId, wallLength(wall));
      continue;
    }
    const grossArea = wallLength(wall) * wall.height;
    const openingsArea = graph.openings
      .filter((o) => o.wallId === wall.id)
      .reduce((sum, o) => sum + o.width * o.height, 0);
    const netArea = Math.max(0, grossArea - openingsArea);
    addQuantity(wall.materialId, quantityFor(material, netArea, wall.thickness));
  }

  // Slabs (floors): plan area, by material.
  for (const slab of graph.slabs) {
    const material = materialsById.get(slab.materialId);
    if (!material) continue;
    const area = polygonArea(slab.boundary);
    addQuantity(slab.materialId, quantityFor(material, area, slab.thickness));
  }

  // Roofs: plan area scaled up by a simple slope factor for pitched types,
  // approximating the larger real surface area of an angled roof.
  for (const roof of graph.roofs) {
    const material = materialsById.get(roof.materialId);
    if (!material) continue;
    const planArea = polygonArea(roof.boundary);
    const pitchRad = (roof.pitchDegrees * Math.PI) / 180;
    const slopeFactor = roof.type === "flat" ? 1 : 1 / Math.cos(pitchRad);
    addQuantity(roof.materialId, quantityFor(material, planArea * slopeFactor, roof.thickness));
  }

  // Openings: priced per unit (door/window count), not by area.
  for (const opening of graph.openings) {
    const material = materialForOpening(opening, graph.materials);
    if (!material) continue;
    addQuantity(material.id, 1);
  }

  const lineItems: EstimateLineItem[] = [];
  for (const [materialId, quantity] of quantityByMaterial) {
    const material = materialsById.get(materialId);
    if (!material) continue;
    const materialCost = quantity * material.unitCost;
    const laborHours = quantity * (material.laborHoursPerUnit ?? 0);
    const laborCost = laborHours * laborRatePerHour;
    lineItems.push({
      materialId,
      materialName: material.name,
      category: material.category,
      quantity,
      unit: material.unit,
      unitCost: material.unitCost,
      materialCost,
      laborHours,
      laborCost,
      totalCost: materialCost + laborCost,
    });
  }
  lineItems.sort((a, b) => b.totalCost - a.totalCost);

  const totalMaterialCost = lineItems.reduce((sum, li) => sum + li.materialCost, 0);
  const totalLaborCost = lineItems.reduce((sum, li) => sum + li.laborCost, 0);
  const totalLaborHours = lineItems.reduce((sum, li) => sum + li.laborHours, 0);
  const currency = graph.materials[0]?.currency ?? "USD";

  return {
    lineItems,
    totalMaterialCost,
    totalLaborCost,
    totalCost: totalMaterialCost + totalLaborCost,
    totalLaborHours,
    currency,
    laborRatePerHour,
    disclaimer: ESTIMATE_DISCLAIMER,
    exclusions: ESTIMATE_EXCLUSIONS,
  };
}
