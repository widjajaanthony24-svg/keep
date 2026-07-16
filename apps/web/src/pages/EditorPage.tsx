import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { validateBuildingGraph, type BuildingGraph } from "@keep/building-graph";
import { api } from "../api/client";
import { BuildingViewer } from "../viewer/BuildingViewer";
import { PlanCanvas, type PlanCanvasHandle } from "../editor/PlanCanvas";
import { Toolbar } from "../editor/Toolbar";
import { PropertiesPanel } from "../editor/PropertiesPanel";
import { LevelSwitcher } from "../editor/LevelSwitcher";
import { RoofPanel } from "../editor/RoofPanel";
import { WallDefaultsPanel } from "../editor/WallDefaultsPanel";
import { ViewToggle } from "../editor/ViewToggle";
import { EditableTitle } from "../editor/EditableTitle";
import { useBuildingEditor } from "../editor/useBuildingEditor";

function EditorInner({ id, name, baseGraph }: { id: string; name: string; baseGraph: BuildingGraph }) {
  const editor = useBuildingEditor(baseGraph);
  const [projectName, setProjectName] = useState(name);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const planCanvasRef = useRef<PlanCanvasHandle>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isTyping = (e.target as HTMLElement)?.tagName === "INPUT";
      if (isTyping) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        editor.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        editor.redo();
        return;
      }
      if (e.key === "Escape") editor.cancelChain();
      if ((e.key === "Delete" || e.key === "Backspace") && (editor.selectedWall || editor.selectedOpening)) {
        editor.deleteSelected();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.selectedWall, editor.selectedOpening]);

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const graph = editor.exportGraph(baseGraph);
      await api.updateProject(id, { buildingGraph: graph, name: projectName });
      editor.markSaved();
      setSaveMessage("Saved.");
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  }

  async function handleRename(newName: string) {
    setProjectName(newName);
    try {
      await api.updateProject(id, { name: newName });
    } catch {
      // Non-critical — the name still shows locally and will save properly next full Save.
    }
  }

  const showFirstTimeHint = editor.walls.length === 0 && !editor.pendingChain;

  const currentLevelIndex = editor.levels.findIndex((l) => l.id === editor.currentLevelId);
  const belowLevel = currentLevelIndex > 0 ? editor.levels[currentLevelIndex - 1] : null;
  const belowWalls = belowLevel ? editor.walls.filter((w) => w.levelId === belowLevel.id) : [];

  return (
    <div className="editor-page">
      <header className="editor-page__header">
        <Link to={`/projects/${id}`} className="back-link">
          ← Viewer
        </Link>
        <EditableTitle value={projectName} onSave={handleRename} />
        <ViewToggle view={view} onChange={setView} />
      </header>

      <Toolbar
        tool={editor.tool}
        onToolChange={editor.setTool}
        onUndo={editor.undo}
        canUndo={editor.canUndo}
        onRedo={editor.redo}
        canRedo={editor.canRedo}
        onFitView={() => planCanvasRef.current?.fitToView()}
        onSave={handleSave}
        saving={saving}
        saveMessage={saveMessage}
        dirty={editor.isDirty}
        view={view}
      />

      <div className="editor-subbar">
        <LevelSwitcher
          levels={editor.levels}
          currentLevelId={editor.currentLevelId}
          onSwitchLevel={editor.switchLevel}
          onAddLevel={editor.addLevel}
          onUpdateLevelHeight={editor.updateLevelHeight}
        />
        {view === "2d" && (
          <WallDefaultsPanel
            thickness={editor.defaultThickness}
            height={editor.defaultHeight}
            materialId={editor.defaultMaterialId}
            materials={editor.materials}
            onThicknessChange={editor.setDefaultThickness}
            onHeightChange={editor.setDefaultHeight}
            onMaterialChange={editor.setDefaultMaterialId}
            minHeight={editor.minWallHeight}
          />
        )}
        {view === "2d" && <RoofPanel rooms={editor.currentLevelRooms} onUpdateRoom={editor.updateRoom} />}
      </div>

      {showFirstTimeHint && view === "2d" && (
        <div className="first-time-hint">
          New here? Pick <strong>Rectangle Room</strong> above and drag from one corner of a room to the
          opposite corner — that's the fastest way to sketch your first room. Use <strong>Draw Wall</strong>{" "}
          instead for shapes that aren't rectangular, and hold <strong>Shift</strong> while drawing to keep
          lines straight.
        </div>
      )}

      <div className="editor-canvas-area">
        {view === "2d" ? (
          <PlanCanvas
            ref={planCanvasRef}
            tool={editor.tool}
            walls={editor.currentLevelWalls}
            openings={editor.currentLevelOpenings}
            rooms={editor.currentLevelRooms}
            belowWalls={belowWalls}
            belowLevelName={belowLevel?.name}
            pendingChain={editor.pendingChain}
            selection={editor.selection}
            onPointClick={editor.handleCanvasClick}
            onRectangleComplete={editor.handleRectangleComplete}
            onVertexDragComplete={editor.moveWallVertex}
            onOpeningDragComplete={editor.moveOpeningAlongWall}
          />
        ) : (
          <div className="editor-preview">
            <BuildingViewer
              graph={editor.previewGraph}
              selection={editor.selection}
              onSelectWall={editor.selectWall}
              onSelectOpening={editor.selectOpening}
              onDeselect={editor.clearSelection}
            />
          </div>
        )}

        {(editor.selectedWall || editor.selectedOpening) && (
          <div className="properties-panel properties-panel--floating">
            <PropertiesPanel
              selectedWall={editor.selectedWall}
              selectedOpening={editor.selectedOpening}
              materials={editor.previewGraph.materials}
              onUpdateWall={editor.updateSelectedWall}
              onUpdateOpening={editor.updateSelectedOpening}
              onDelete={editor.deleteSelected}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [graph, setGraph] = useState<BuildingGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getProject(id)
      .then((project) => {
        setName(project.name);
        const validation = validateBuildingGraph(project.buildingGraph);
        if (!validation.success) {
          setError("This project's Building Graph failed schema validation — see console for details.");
          console.error(validation.error.issues);
          return;
        }
        setGraph(validation.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load project"));
  }, [id, navigate]);

  if (error) {
    return (
      <div className="page">
        <div className="form-error">{error}</div>
      </div>
    );
  }

  if (!graph || !id) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return <EditorInner id={id} name={name} baseGraph={graph} />;
}
