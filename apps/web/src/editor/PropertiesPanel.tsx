import type { Material, Opening, Wall } from "@keep/building-graph";
import { NumberField } from "./NumberField";

export function PropertiesPanel({
  selectedWall,
  selectedOpening,
  materials,
  onUpdateWall,
  onUpdateOpening,
  onDelete,
}: {
  selectedWall: Wall | null;
  selectedOpening: Opening | null;
  materials: Material[];
  onUpdateWall: (patch: Partial<Pick<Wall, "thickness" | "height" | "materialId">>) => void;
  onUpdateOpening: (patch: Partial<Pick<Opening, "width" | "height" | "sillHeight">>) => void;
  onDelete: () => void;
}) {
  if (selectedWall) {
    return (
      <div className="properties-panel">
        <div className="eyebrow">Wall</div>
        <label>
          Height (m)
          <NumberField
            value={selectedWall.height}
            onChange={(v) => onUpdateWall({ height: v })}
            step={0.1}
            min={0.1}
            max={6}
          />
        </label>
        <label>
          Thickness (m)
          <NumberField
            value={selectedWall.thickness}
            onChange={(v) => onUpdateWall({ thickness: v })}
            step={0.05}
            min={0.1}
            max={0.6}
          />
        </label>
        <label>
          Material
          <select
            value={selectedWall.materialId}
            onChange={(e) => onUpdateWall({ materialId: e.target.value })}
          >
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={onDelete}>
          Delete wall
        </button>
      </div>
    );
  }

  if (selectedOpening) {
    return (
      <div className="properties-panel">
        <div className="eyebrow">{selectedOpening.type === "door" ? "Door" : "Window"}</div>
        <label>
          Width (m)
          <NumberField
            value={selectedOpening.width}
            onChange={(v) => onUpdateOpening({ width: v })}
            step={0.1}
            min={0.5}
            max={3}
          />
        </label>
        <label>
          Height (m)
          <NumberField
            value={selectedOpening.height}
            onChange={(v) => onUpdateOpening({ height: v })}
            step={0.1}
            min={0.5}
            max={2.5}
          />
        </label>
        {selectedOpening.type === "window" && (
          <label>
            Sill height (m)
            <NumberField
              value={selectedOpening.sillHeight}
              onChange={(v) => onUpdateOpening({ sillHeight: v })}
              step={0.1}
              min={0}
              max={2}
            />
          </label>
        )}
        <button className="btn" onClick={onDelete}>
          Delete {selectedOpening.type}
        </button>
      </div>
    );
  }

  return null;
}
