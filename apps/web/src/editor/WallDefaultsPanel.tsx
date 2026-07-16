import type { Material } from "@keep/building-graph";
import { NumberField } from "./NumberField";

export function WallDefaultsPanel({
  thickness,
  height,
  materialId,
  materials,
  onThicknessChange,
  onHeightChange,
  onMaterialChange,
  minHeight,
}: {
  thickness: number;
  height: number;
  materialId: string;
  materials: Material[];
  onThicknessChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onMaterialChange: (id: string) => void;
  minHeight: number;
}) {
  const wallMaterials = materials.filter((m) =>
    ["masonry", "timber", "steel", "concrete"].includes(m.category)
  );

  return (
    <div className="wall-defaults">
      <span className="wall-defaults__label">New walls:</span>
      <label className="wall-defaults__field">
        Height (m)
        <NumberField value={height} onChange={onHeightChange} step={0.1} min={minHeight} max={6} />
      </label>
      <label className="wall-defaults__field">
        Thickness (m)
        <NumberField value={thickness} onChange={onThicknessChange} step={0.05} min={0.05} max={0.6} />
      </label>
      <label className="wall-defaults__field">
        Material
        <select value={materialId} onChange={(e) => onMaterialChange(e.target.value)}>
          {wallMaterials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <span className="wall-defaults__hint">Applies to new walls only — existing ones keep their own settings</span>
    </div>
  );
}
