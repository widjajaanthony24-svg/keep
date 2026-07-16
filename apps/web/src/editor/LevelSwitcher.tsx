import type { Level } from "@keep/building-graph";
import { NumberField } from "./NumberField";

export function LevelSwitcher({
  levels,
  currentLevelId,
  onSwitchLevel,
  onAddLevel,
  onUpdateLevelHeight,
}: {
  levels: Level[];
  currentLevelId: string;
  onSwitchLevel: (levelId: string) => void;
  onAddLevel: () => void;
  onUpdateLevelHeight: (levelId: string, height: number) => void;
}) {
  const current = levels.find((l) => l.id === currentLevelId);

  return (
    <div className="level-switcher">
      <div className="level-switcher__tabs">
        {levels.map((level) => (
          <button
            key={level.id}
            className={level.id === currentLevelId ? "level-tab is-active" : "level-tab"}
            onClick={() => onSwitchLevel(level.id)}
          >
            {level.name}
          </button>
        ))}
        <button className="level-tab level-tab--add" onClick={onAddLevel}>
          + Add Floor
        </button>
      </div>
      {current && (
        <label className="level-switcher__height">
          Floor height (m)
          <NumberField
            value={current.height}
            onChange={(v) => onUpdateLevelHeight(current.id, v)}
            step={0.1}
            min={2}
            max={6}
          />
        </label>
      )}
    </div>
  );
}
