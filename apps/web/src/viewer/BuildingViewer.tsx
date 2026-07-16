import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import type { BuildingGraph } from "@keep/building-graph";
import { polygonArea } from "@keep/building-graph";
import { BuildingScene, type ViewerMode } from "./BuildingScene";
import { BLUEPRINT_BG_COLOR, BLUEPRINT_GRID_COLOR, REALIZED_BG_COLOR } from "./materials";

function roomsByFloor(graph: BuildingGraph) {
  return graph.levels.map((level) => {
    const levelSlabs = graph.slabs.filter((s) => s.levelId === level.id);
    return {
      levelId: level.id,
      levelName: level.name,
      rooms: levelSlabs.map((slab, i) => ({ id: slab.id, index: i + 1, area: polygonArea(slab.boundary) })),
    };
  });
}

export function BuildingViewer({
  graph,
  selection = null,
  onSelectWall,
  onSelectOpening,
  onDeselect,
}: {
  graph: BuildingGraph;
  selection?: { kind: "wall" | "opening"; id: string } | null;
  onSelectWall?: (wallId: string) => void;
  onSelectOpening?: (openingId: string) => void;
  onDeselect?: () => void;
}) {
  const [mode, setMode] = useState<ViewerMode>("blueprint");
  const [hideRoof, setHideRoof] = useState(false);
  const floors = useMemo(() => roomsByFloor(graph), [graph]);
  const totalRoomCount = floors.reduce((sum, f) => sum + f.rooms.length, 0);
  const totalFloorArea = useMemo(
    () => graph.slabs.reduce((sum, s) => sum + polygonArea(s.boundary), 0),
    [graph.slabs]
  );
  const bg = mode === "blueprint" ? BLUEPRINT_BG_COLOR : REALIZED_BG_COLOR;

  return (
    <div className="viewer">
      <div className="viewer__toolbar">
        <div className="viewer__disclaimer">{graph.metadata.disclaimer}</div>
        <label className="hide-roof-toggle">
          <input type="checkbox" checked={hideRoof} onChange={(e) => setHideRoof(e.target.checked)} />
          Hide roof
        </label>
        <div className="mode-toggle">
          <button
            className={mode === "blueprint" ? "mode-toggle__btn is-active" : "mode-toggle__btn"}
            onClick={() => setMode("blueprint")}
          >
            Blueprint
          </button>
          <button
            className={mode === "realized" ? "mode-toggle__btn is-active" : "mode-toggle__btn"}
            onClick={() => setMode("realized")}
          >
            Realized
          </button>
        </div>
      </div>

      <div className="viewer__canvas-wrap">
        <Canvas
          shadows={mode === "realized"}
          camera={{ position: [14, 11, 14], fov: 40 }}
          style={{ background: bg }}
          onPointerMissed={onDeselect}
        >
          <ambientLight intensity={mode === "blueprint" ? 0.9 : 0.55} />
          <directionalLight
            position={[8, 12, 6]}
            intensity={mode === "blueprint" ? 0.3 : 1}
            castShadow={mode === "realized"}
            shadow-mapSize={[1024, 1024]}
          />

          <Grid
            args={[40, 40]}
            cellColor={mode === "blueprint" ? BLUEPRINT_GRID_COLOR : "#D8D3C6"}
            sectionColor={mode === "blueprint" ? "#2A4A6E" : "#C7C0AE"}
            fadeDistance={30}
            infiniteGrid
          />

          {mode === "realized" && (
            <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[200, 200]} />
              <shadowMaterial opacity={0.22} />
            </mesh>
          )}

          <BuildingScene
            graph={graph}
            mode={mode}
            hideRoof={hideRoof}
            selection={selection}
            onSelectWall={onSelectWall}
            onSelectOpening={onSelectOpening}
          />

          <OrbitControls makeDefault target={[4, 1.5, -3]} />

          <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
            <GizmoViewport
              axisColors={["#c9524a", "#5a9e5a", "#5ec8d8"]}
              labelColor="#14233b"
            />
          </GizmoHelper>
        </Canvas>

        <div className="viewer__camera-hint">Drag to orbit · Scroll to zoom · Middle-drag to pan</div>

        <div className="viewer__stats">
          <div className="viewer__stats-row">
            <span>Total floor area</span>
            <span>{totalFloorArea.toFixed(1)} m²</span>
          </div>
          <div className="viewer__stats-row">
            <span>Floors</span>
            <span>{graph.levels.length}</span>
          </div>
          {totalRoomCount > 1 && (
            <div className="viewer__stats-rooms">
              {floors
                .filter((f) => f.rooms.length > 0)
                .map((f) => (
                  <div key={f.levelId} className="viewer__stats-floor-group">
                    <div className="viewer__stats-floor-name">{f.levelName}</div>
                    {f.rooms.map((r) => (
                      <div key={r.id} className="viewer__stats-row viewer__stats-row--room">
                        <span>Room {r.index}</span>
                        <span>{r.area.toFixed(1)} m²</span>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          )}
          {mode === "realized" && <div className="viewer__concept-badge">Concept render — materials are placeholders</div>}
        </div>
      </div>
    </div>
  );
}
