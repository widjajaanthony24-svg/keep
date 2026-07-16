import { useCallback, useMemo, useRef, useState } from "react";
import type {
  BuildingGraph,
  Level,
  Material,
  Opening,
  OpeningType,
  Point2,
  Room,
  RoofType,
  Wall,
} from "@keep/building-graph";
import { wallLength } from "@keep/building-graph";
import {
  CLOSE_LOOP_SNAP_DISTANCE,
  clampOpeningOffset,
  distance,
  findNearestWall,
  snapToGrid,
} from "./geometry2d";
import type { PendingChain, Selection, Tool } from "./types";

const DEFAULT_WALL_HEIGHT = 3;
const DEFAULT_WALL_THICKNESS = 0.2;
const MIN_WALL_HEIGHT = 0.1; // low enough for a fence, a parapet, a knee-wall
const FENCE_DEFAULT_HEIGHT = 1.1; // typical railing/terrace-fence height
const MAX_HISTORY_ENTRIES = 100;

const DEFAULT_MASONRY_MATERIAL: Material = {
  id: "mat-default-masonry",
  name: "Concrete block wall",
  category: "masonry",
  unit: "m2",
  unitCost: 45,
  currency: "USD",
  densityKgM3: 1900,
  laborHoursPerUnit: 0.9,
};

const DEFAULT_BRICK_MATERIAL: Material = {
  id: "mat-default-brick",
  name: "Brick veneer wall",
  category: "masonry",
  unit: "m2",
  unitCost: 58,
  currency: "USD",
  densityKgM3: 1700,
  laborHoursPerUnit: 1.1,
};

const DEFAULT_TIMBER_WALL_MATERIAL: Material = {
  id: "mat-default-timber-wall",
  name: "Timber stud wall",
  category: "timber",
  unit: "m2",
  unitCost: 38,
  currency: "USD",
  densityKgM3: 500,
  laborHoursPerUnit: 0.7,
};

const DEFAULT_STEEL_WALL_MATERIAL: Material = {
  id: "mat-default-steel-wall",
  name: "Steel-framed wall",
  category: "steel",
  unit: "m2",
  unitCost: 65,
  currency: "USD",
  densityKgM3: 7850,
  laborHoursPerUnit: 1.0,
};

const DEFAULT_ROOF_MATERIAL: Material = {
  id: "mat-default-roofing",
  name: "Metal roof sheeting",
  category: "roofing",
  unit: "m2",
  unitCost: 22,
  currency: "USD",
  laborHoursPerUnit: 0.4,
};

const DEFAULT_SLAB_MATERIAL: Material = {
  id: "mat-default-slab",
  name: "Reinforced concrete slab",
  category: "concrete",
  unit: "m3",
  unitCost: 180,
  currency: "USD",
  densityKgM3: 2400,
  laborHoursPerUnit: 3.2,
};

const DEFAULT_DOOR_MATERIAL: Material = {
  id: "mat-default-door",
  name: "Timber panel door",
  category: "timber",
  unit: "unit",
  unitCost: 150,
  currency: "USD",
  laborHoursPerUnit: 2,
};

const DEFAULT_WINDOW_MATERIAL: Material = {
  id: "mat-default-window",
  name: "Aluminium-framed window",
  category: "glazing",
  unit: "unit",
  unitCost: 220,
  currency: "USD",
  laborHoursPerUnit: 1.5,
};

const DEFAULT_RAILING_MATERIAL: Material = {
  id: "mat-default-railing",
  name: "Metal railing",
  category: "steel",
  unit: "m",
  unitCost: 35,
  currency: "USD",
  laborHoursPerUnit: 0.3,
};

function newId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${rand}`;
}

/** The walls that actually form a room's boundary — matched by shared endpoints, not just "same level". */
function wallsForRoom(room: { levelId: string; boundary: Point2[] }, allWalls: Wall[]): Wall[] {
  return allWalls.filter(
    (w) =>
      w.levelId === room.levelId &&
      room.boundary.some((p) => distance(p, w.start) < 0.05) &&
      room.boundary.some((p) => distance(p, w.end) < 0.05)
  );
}

interface EditableState {
  levels: Level[];
  walls: Wall[];
  openings: Opening[];
  materials: Material[];
  rooms: Room[];
  pendingChain: PendingChain | null;
}

export function useBuildingEditor(initialGraph: BuildingGraph) {
  const [state, setState] = useState<EditableState>(() => {
    const seedDefaults = [
      DEFAULT_MASONRY_MATERIAL,
      DEFAULT_BRICK_MATERIAL,
      DEFAULT_TIMBER_WALL_MATERIAL,
      DEFAULT_STEEL_WALL_MATERIAL,
      DEFAULT_ROOF_MATERIAL,
      DEFAULT_SLAB_MATERIAL,
      DEFAULT_DOOR_MATERIAL,
      DEFAULT_WINDOW_MATERIAL,
      DEFAULT_RAILING_MATERIAL,
    ];
    const existingIds = new Set(initialGraph.materials.map((m) => m.id));

    // Rooms are a newer part of the schema. Projects saved before this existed
    // have rooms: [] even though they clearly have slabs/roofs — migrate those
    // into real Room objects on load instead of silently losing them.
    const rooms =
      initialGraph.rooms.length > 0
        ? initialGraph.rooms
        : initialGraph.slabs.map((s) => {
            const matchingRoof =
              initialGraph.roofs.find((r) => r.id === `roof-${s.id}`) ??
              initialGraph.roofs.find((r) => r.levelId === s.levelId);
            return {
              id: s.id,
              levelId: s.levelId,
              boundary: s.boundary,
              hasFloor: true,
              hasRoof: Boolean(matchingRoof),
              roofType: matchingRoof?.type ?? "flat",
              roofPitchDegrees: matchingRoof?.pitchDegrees ?? 20,
            } satisfies Room;
          });

    return {
      levels: initialGraph.levels,
      walls: initialGraph.walls,
      openings: initialGraph.openings.map((o) => {
        const wall = initialGraph.walls.find((w) => w.id === o.wallId);
        return wall ? { ...o, offset: clampOpeningOffset(o.offset, o.width, wall) } : o;
      }),
      materials: [...initialGraph.materials, ...seedDefaults.filter((d) => !existingIds.has(d.id))],
      rooms,
      pendingChain: null,
    };
  });

  const [currentLevelId, setCurrentLevelId] = useState<string>(
    initialGraph.levels[0]?.id ?? "level-1"
  );

  // Two stacks: history (undo) and future (redo). Every mutating action
  // pushes the pre-mutation state onto history and clears future.
  const historyRef = useRef<EditableState[]>([]);
  const futureRef = useRef<EditableState[]>([]);
  // The exact state object at the time of the last successful save (or load).
  // Comparing by reference against this — rather than a one-way "has anything
  // changed since mount" flag — means undoing back to the saved point
  // correctly clears the "unsaved changes" indicator instead of leaving it
  // stuck on.
  const lastSavedStateRef = useRef<EditableState>(state);

  const applyChange = useCallback((updater: (s: EditableState) => EditableState) => {
    setState((current) => {
      historyRef.current.push(current);
      if (historyRef.current.length > MAX_HISTORY_ENTRIES) historyRef.current.shift();
      futureRef.current = [];
      return updater(current);
    });
  }, []);

  const [tool, setToolRaw] = useState<Tool>("select");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [defaultThickness, setDefaultThickness] = useState(DEFAULT_WALL_THICKNESS);
  const [defaultHeight, setDefaultHeight] = useState(DEFAULT_WALL_HEIGHT);
  const [defaultMaterialId, setDefaultMaterialId] = useState<string | null>(null);

  const { levels, walls, openings, materials, rooms, pendingChain } = state;

  const currentLevelWalls = useMemo(
    () => walls.filter((w) => w.levelId === currentLevelId),
    [walls, currentLevelId]
  );
  const currentLevelOpenings = useMemo(
    () => openings.filter((o) => currentLevelWalls.some((w) => w.id === o.wallId)),
    [openings, currentLevelWalls]
  );
  const currentLevelRooms = useMemo(
    () => rooms.filter((r) => r.levelId === currentLevelId),
    [rooms, currentLevelId]
  );

  const autoWallMaterialId =
    materials.find((m) => m.category === "masonry")?.id ?? materials[0]?.id ?? DEFAULT_MASONRY_MATERIAL.id;
  const effectiveWallMaterialId = defaultMaterialId ?? autoWallMaterialId;

  const selectedWall = useMemo(
    () => (selection?.kind === "wall" ? walls.find((w) => w.id === selection.id) ?? null : null),
    [selection, walls]
  );
  const selectedOpening = useMemo(
    () => (selection?.kind === "opening" ? openings.find((o) => o.id === selection.id) ?? null : null),
    [selection, openings]
  );

  const cancelChain = useCallback(() => {
    applyChange((s) => ({ ...s, pendingChain: null }));
  }, [applyChange]);

  const changeTool = useCallback(
    (nextTool: Tool) => {
      if (pendingChain && nextTool !== "wall" && nextTool !== "fence") cancelChain();
      setToolRaw(nextTool);
    },
    [pendingChain, cancelChain]
  );

  const switchLevel = useCallback(
    (levelId: string) => {
      if (pendingChain) cancelChain();
      setSelection(null);
      setCurrentLevelId(levelId);
    },
    [pendingChain, cancelChain]
  );

  const addLevel = useCallback(() => {
    const newLevelId = newId("level");
    applyChange((s) => {
      const totalHeight = s.levels.reduce((sum, l) => sum + l.height, 0);
      const newLevel: Level = {
        id: newLevelId,
        name: `Floor ${s.levels.length + 1}`,
        elevation: totalHeight,
        height: DEFAULT_WALL_HEIGHT,
      };
      return { ...s, levels: [...s.levels, newLevel] };
    });
    setSelection(null);
    setCurrentLevelId(newLevelId);
  }, [applyChange]);

  const updateLevelHeight = useCallback(
    (levelId: string, height: number) => {
      applyChange((s) => {
        const idx = s.levels.findIndex((l) => l.id === levelId);
        if (idx === -1) return s;
        const updated = s.levels.map((l, i) => (i === idx ? { ...l, height } : l));
        for (let i = idx + 1; i < updated.length; i++) {
          updated[i] = { ...updated[i], elevation: updated[i - 1].elevation + updated[i - 1].height };
        }
        return { ...s, levels: updated };
      });
    },
    [applyChange]
  );

  const undo = useCallback(() => {
    setState((current) => {
      const prev = historyRef.current.pop();
      if (!prev) return current;
      futureRef.current.push(current);
      return prev;
    });
    setSelection(null);
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      const next = futureRef.current.pop();
      if (!next) return current;
      historyRef.current.push(current);
      return next;
    });
    setSelection(null);
  }, []);

  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  const isDirty = state !== lastSavedStateRef.current;

  const markSaved = useCallback(() => {
    lastSavedStateRef.current = state;
  }, [state]);

  const buildWall = useCallback(
    (start: Point2, end: Point2): Wall => ({
      id: newId("wall"),
      levelId: currentLevelId,
      start,
      end,
      height: defaultHeight,
      thickness: defaultThickness,
      materialId: effectiveWallMaterialId,
      loadBearing: true,
      openingIds: [],
    }),
    [currentLevelId, defaultHeight, defaultThickness, effectiveWallMaterialId]
  );

  const handleWallTool = useCallback(
    (rawPoint: Point2) => {
      const point = snapToGrid(rawPoint);

      if (!pendingChain) {
        applyChange((s) => ({ ...s, pendingChain: { points: [point], wallIds: [] } }));
        return;
      }

      const first = pendingChain.points[0];
      const isClosing = pendingChain.points.length >= 3 && distance(point, first) <= CLOSE_LOOP_SNAP_DISTANCE;
      const lastPoint = pendingChain.points[pendingChain.points.length - 1];
      const closingPoint = isClosing ? first : point;

      if (distance(closingPoint, lastPoint) < 0.05) return;

      const wall = buildWall(lastPoint, closingPoint);

      applyChange((s) => ({
        ...s,
        walls: [...s.walls, wall],
        rooms: isClosing
          ? [
              ...s.rooms,
              {
                id: newId("room"),
                levelId: currentLevelId,
                boundary: pendingChain.points,
                hasFloor: true,
                hasRoof: true,
                roofType: "flat",
                roofPitchDegrees: 20,
              },
            ]
          : s.rooms,
        pendingChain: isClosing
          ? null
          : { points: [...pendingChain.points, point], wallIds: [...pendingChain.wallIds, wall.id] },
      }));
    },
    [pendingChain, buildWall, applyChange, currentLevelId]
  );

  /**
   * A standalone fence/railing run: click to place points, same as Draw
   * Wall, but it never becomes a Room even if it happens to close back on
   * itself — no auto floor, no auto roof, never counted in room-area
   * stats. Defaults to railing height/material instead of inheriting the
   * general wall defaults, since a terrace railing isn't "a thin wall."
   */
  const handleFenceTool = useCallback(
    (rawPoint: Point2) => {
      const point = snapToGrid(rawPoint);

      if (!pendingChain) {
        applyChange((s) => ({ ...s, pendingChain: { points: [point], wallIds: [] } }));
        return;
      }

      const lastPoint = pendingChain.points[pendingChain.points.length - 1];
      if (distance(point, lastPoint) < 0.05) return;

      const railingMaterialId =
        materials.find((m) => m.id === "mat-default-railing")?.id ??
        materials.find((m) => m.category === "steel")?.id ??
        effectiveWallMaterialId;

      const wall: Wall = {
        id: newId("wall"),
        levelId: currentLevelId,
        start: lastPoint,
        end: point,
        height: FENCE_DEFAULT_HEIGHT,
        thickness: 0.08,
        materialId: railingMaterialId,
        loadBearing: false,
        openingIds: [],
      };

      applyChange((s) => ({
        ...s,
        walls: [...s.walls, wall],
        pendingChain: { points: [...pendingChain.points, point], wallIds: [...pendingChain.wallIds, wall.id] },
      }));
    },
    [pendingChain, materials, currentLevelId, effectiveWallMaterialId, applyChange]
  );

  /** The one-drag "Rectangle Room" tool: two opposite corners -> four walls, closed immediately. */
  const handleRectangleComplete = useCallback(
    (rawA: Point2, rawB: Point2) => {
      const a = snapToGrid(rawA);
      const b = snapToGrid(rawB);
      if (Math.abs(a.x - b.x) < 0.3 || Math.abs(a.y - b.y) < 0.3) return;

      const corners: Point2[] = [
        { x: a.x, y: a.y },
        { x: b.x, y: a.y },
        { x: b.x, y: b.y },
        { x: a.x, y: b.y },
      ];
      const newWalls = corners.map((corner, i) => buildWall(corner, corners[(i + 1) % corners.length]));

      applyChange((s) => ({
        ...s,
        walls: [...s.walls, ...newWalls],
        rooms: [
          ...s.rooms,
          {
            id: newId("room"),
            levelId: currentLevelId,
            boundary: corners,
            hasFloor: true,
            hasRoof: true,
            roofType: "flat",
            roofPitchDegrees: 20,
          },
        ],
      }));
    },
    [buildWall, applyChange, currentLevelId]
  );

  const handleOpeningTool = useCallback(
    (rawPoint: Point2, openingType: OpeningType) => {
      const nearest = findNearestWall(rawPoint, currentLevelWalls);
      if (!nearest) return;

      const isDoor = openingType === "door";
      const width = isDoor ? 0.9 : 1.2;
      const height = isDoor ? 2.1 : 1.2;
      const sillHeight = isDoor ? 0 : 0.9;
      const offset = clampOpeningOffset(nearest.alongSegment, width, nearest.wall);
      const fallbackCategory = isDoor ? "timber" : "glazing";
      const openingMaterialId = (
        materials.find((m) => m.category === fallbackCategory && m.unit === "unit") ??
        materials.find((m) => m.category === fallbackCategory)
      )?.id;

      const opening: Opening = {
        id: newId("opening"),
        type: openingType,
        wallId: nearest.wall.id,
        offset,
        width,
        height,
        sillHeight,
        materialId: openingMaterialId,
      };

      applyChange((s) => ({
        ...s,
        openings: [...s.openings, opening],
        walls: s.walls.map((w) => (w.id === nearest.wall.id ? { ...w, openingIds: [...w.openingIds, opening.id] } : w)),
      }));
    },
    [currentLevelWalls, materials, applyChange]
  );

  const handleSelectTool = useCallback(
    (rawPoint: Point2) => {
      const openingHit = currentLevelOpenings.find((o) => {
        const wall = currentLevelWalls.find((w) => w.id === o.wallId);
        if (!wall) return false;
        const len = wallLength(wall);
        const t = len === 0 ? 0 : Math.max(0, Math.min(1, o.offset / len));
        const posOnWall: Point2 = {
          x: wall.start.x + (wall.end.x - wall.start.x) * t,
          y: wall.start.y + (wall.end.y - wall.start.y) * t,
        };
        return distance(rawPoint, posOnWall) <= Math.max(o.width / 2, 0.3);
      });
      if (openingHit) {
        setSelection({ kind: "opening", id: openingHit.id });
        return;
      }

      const nearest = findNearestWall(rawPoint, currentLevelWalls, 0.3);
      setSelection(nearest ? { kind: "wall", id: nearest.wall.id } : null);
    },
    [currentLevelWalls, currentLevelOpenings]
  );

  const handleDeleteTool = useCallback(
    (rawPoint: Point2) => {
      const nearest = findNearestWall(rawPoint, currentLevelWalls, 0.3);
      if (!nearest) return;

      applyChange((s) => ({
        ...s,
        walls: s.walls.filter((w) => w.id !== nearest.wall.id),
        openings: s.openings.filter((o) => o.wallId !== nearest.wall.id),
        rooms: s.rooms.filter(
          (room) =>
            !room.boundary.some(
              (p) => distance(p, nearest.wall.start) < 0.01 || distance(p, nearest.wall.end) < 0.01
            )
        ),
      }));
      if (selection?.kind === "wall" && selection.id === nearest.wall.id) setSelection(null);
    },
    [currentLevelWalls, selection, applyChange]
  );

  const handleCanvasClick = useCallback(
    (point: Point2) => {
      if (tool === "wall") return handleWallTool(point);
      if (tool === "fence") return handleFenceTool(point);
      if (tool === "door") return handleOpeningTool(point, "door");
      if (tool === "window") return handleOpeningTool(point, "window");
      if (tool === "select") return handleSelectTool(point);
      if (tool === "delete") return handleDeleteTool(point);
    },
    [tool, handleWallTool, handleFenceTool, handleOpeningTool, handleSelectTool, handleDeleteTool]
  );

  /**
   * Drag an existing wall corner to a new point. Every wall sharing that
   * corner moves with it, and — this used to be missed, which is very
   * likely why a door could end up floating away from its wall — any
   * openings on an affected wall get their offset re-clamped to the wall's
   * new (possibly shorter) length instead of keeping a now-out-of-range value.
   */
  const moveWallVertex = useCallback(
    (oldPoint: Point2, newPoint: Point2, affected: { wallId: string; end: "start" | "end" }[]) => {
      if (affected.length === 0) return;
      applyChange((s) => {
        const nextWalls = s.walls.map((w) => {
          const hit = affected.find((a) => a.wallId === w.id);
          return hit ? { ...w, [hit.end]: newPoint } : w;
        });
        const affectedWallIds = new Set(affected.map((a) => a.wallId));
        const nextOpenings = s.openings.map((o) => {
          if (!affectedWallIds.has(o.wallId)) return o;
          const wall = nextWalls.find((w) => w.id === o.wallId);
          if (!wall) return o;
          return { ...o, offset: clampOpeningOffset(o.offset, o.width, wall) };
        });
        return {
          ...s,
          walls: nextWalls,
          openings: nextOpenings,
          rooms: s.rooms.map((room) => ({
            ...room,
            boundary: room.boundary.map((p) => (distance(p, oldPoint) < 0.02 ? newPoint : p)),
          })),
        };
      });
    },
    [applyChange]
  );

  const moveOpeningAlongWall = useCallback(
    (openingId: string, newOffset: number) => {
      applyChange((s) => ({
        ...s,
        openings: s.openings.map((o) => {
          if (o.id !== openingId) return o;
          const wall = s.walls.find((w) => w.id === o.wallId);
          return { ...o, offset: wall ? clampOpeningOffset(newOffset, o.width, wall) : newOffset };
        }),
      }));
    },
    [applyChange]
  );

  const updateSelectedWall = useCallback(
    (patch: Partial<Pick<Wall, "thickness" | "height" | "materialId" | "loadBearing">>) => {
      if (!selectedWall) return;
      applyChange((s) => ({ ...s, walls: s.walls.map((w) => (w.id === selectedWall.id ? { ...w, ...patch } : w)) }));
    },
    [selectedWall, applyChange]
  );

  const updateSelectedOpening = useCallback(
    (patch: Partial<Pick<Opening, "width" | "height" | "sillHeight">>) => {
      if (!selectedOpening) return;
      applyChange((s) => ({
        ...s,
        openings: s.openings.map((o) => (o.id === selectedOpening.id ? { ...o, ...patch } : o)),
      }));
    },
    [selectedOpening, applyChange]
  );

  const updateRoom = useCallback(
    (roomId: string, patch: Partial<Pick<Room, "hasFloor" | "hasRoof" | "roofType" | "roofPitchDegrees">>) => {
      applyChange((s) => ({ ...s, rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) }));
    },
    [applyChange]
  );

  const deleteSelected = useCallback(() => {
    if (selectedWall) {
      const wallId = selectedWall.id;
      applyChange((s) => ({
        ...s,
        walls: s.walls.filter((w) => w.id !== wallId),
        openings: s.openings.filter((o) => o.wallId !== wallId),
      }));
    } else if (selectedOpening) {
      const openingId = selectedOpening.id;
      applyChange((s) => ({
        ...s,
        openings: s.openings.filter((o) => o.id !== openingId),
        walls: s.walls.map((w) => ({ ...w, openingIds: w.openingIds.filter((id) => id !== openingId) })),
      }));
    }
    setSelection(null);
  }, [selectedWall, selectedOpening, applyChange]);

  /** Assembles a full, schema-valid BuildingGraph from the current editor state. */
  const exportGraph = useCallback(
    (base: BuildingGraph): BuildingGraph => {
      const slabMaterialId = materials.find((m) => m.category === "concrete")?.id ?? DEFAULT_SLAB_MATERIAL.id;
      const roofMaterialId = materials.find((m) => m.category === "roofing")?.id ?? DEFAULT_ROOF_MATERIAL.id;

      return {
        ...base,
        levels,
        walls,
        openings,
        materials,
        rooms,
        slabs: rooms
          .filter((room) => room.hasFloor)
          .map((room) => ({
            id: room.id,
            levelId: room.levelId,
            type: "floor",
            boundary: room.boundary,
            thickness: 0.12,
            materialId: slabMaterialId,
          })),
        roofs: rooms
          .filter((room) => room.hasRoof)
          .map((room) => {
            const level = levels.find((l) => l.id === room.levelId);
            const roomWalls = wallsForRoom(room, walls);
            const wallTopHeight =
              roomWalls.length > 0
                ? Math.max(...roomWalls.map((w) => w.height))
                : level?.height ?? DEFAULT_WALL_HEIGHT;
            const baseHeight = (level?.elevation ?? 0) + wallTopHeight;
            return {
              id: `roof-${room.id}`,
              levelId: room.levelId,
              type: room.roofType,
              boundary: room.boundary,
              baseHeight,
              pitchDegrees: room.roofPitchDegrees,
              overhang: 0.3,
              thickness: 0.15,
              materialId: roofMaterialId,
            };
          }),
        metadata: { ...base.metadata, updatedAt: new Date().toISOString() },
      };
    },
    [levels, walls, openings, materials, rooms]
  );

  const previewGraph = useMemo(() => exportGraph(initialGraph), [exportGraph, initialGraph]);

  const selectWall = useCallback((wallId: string) => setSelection({ kind: "wall", id: wallId }), []);
  const selectOpening = useCallback((openingId: string) => setSelection({ kind: "opening", id: openingId }), []);
  const clearSelection = useCallback(() => setSelection(null), []);

  return {
    tool,
    setTool: changeTool,
    pendingChain,
    cancelChain,
    selection,
    selectedWall,
    selectedOpening,
    selectWall,
    selectOpening,
    clearSelection,
    walls,
    openings,
    materials,
    levels,
    currentLevelId,
    currentLevelWalls,
    currentLevelOpenings,
    currentLevelRooms,
    switchLevel,
    addLevel,
    updateLevelHeight,
    updateRoom,
    handleCanvasClick,
    handleRectangleComplete,
    moveWallVertex,
    moveOpeningAlongWall,
    updateSelectedWall,
    updateSelectedOpening,
    deleteSelected,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSaved,
    exportGraph,
    previewGraph,
    defaultThickness,
    setDefaultThickness,
    defaultHeight,
    setDefaultHeight,
    defaultMaterialId: effectiveWallMaterialId,
    setDefaultMaterialId,
    minWallHeight: MIN_WALL_HEIGHT,
  };
}
