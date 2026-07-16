import type { Tool } from "./types";

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "rectangle", label: "Rectangle Room", hint: "Drag from one corner to the opposite corner" },
  { id: "select", label: "Select", hint: "Click to select. Drag a corner to reshape, drag a door/window to move it" },
  { id: "wall", label: "Draw Wall", hint: "Click to place points, click back near the start to close. Hold Shift for straight lines" },
  { id: "fence", label: "Fence", hint: "Click to place points — an open run, not a room. Press Escape when done" },
  { id: "door", label: "Door", hint: "Click on a wall" },
  { id: "window", label: "Window", hint: "Click on a wall" },
  { id: "delete", label: "Delete", hint: "Click a wall to remove it" },
];

export function Toolbar({
  tool,
  onToolChange,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  onFitView,
  onSave,
  saving,
  saveMessage,
  dirty,
  view,
}: {
  tool: Tool;
  onToolChange: (t: Tool) => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  onFitView: () => void;
  onSave: () => void;
  saving: boolean;
  saveMessage: string | null;
  dirty: boolean;
  view: "2d" | "3d";
}) {
  const active = TOOLS.find((t) => t.id === tool);

  return (
    <div className="editor-toolbar">
      <div className="editor-toolbar__tools">
        {view === "2d" ? (
          <>
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={tool === t.id ? "tool-btn is-active" : "tool-btn"}
                onClick={() => onToolChange(t.id)}
              >
                {t.label}
              </button>
            ))}
            <button className="tool-btn" onClick={onFitView} title="Frame the whole model">
              Fit View
            </button>
          </>
        ) : (
          <span className="editor-toolbar__mode-note">
            3D view — click a wall or opening to select and edit it. Switch to 2D to draw new geometry.
          </span>
        )}
        <button className="tool-btn" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
          Undo
        </button>
        <button className="tool-btn" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y">
          Redo
        </button>
      </div>
      <div className="editor-toolbar__hint">{view === "2d" ? active?.hint : ""}</div>
      <div className="editor-toolbar__save">
        {dirty && !saveMessage && (
          <span className="dirty-message" title="The 3D view always reflects your latest edits, saved or not">
            ● Unsaved changes
          </span>
        )}
        {saveMessage && <span className="save-message">{saveMessage}</span>}
        <button className="btn btn--primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
