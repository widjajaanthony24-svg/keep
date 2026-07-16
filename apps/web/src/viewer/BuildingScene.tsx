import { useMemo } from "react";
import * as THREE from "three";
import type {
  BuildingGraph,
  Material,
  Opening,
  Point2,
  Roof,
  Slab,
  Wall,
} from "@keep/building-graph";
import { boundingBoxOf, isAxisAlignedRectangle, wallLength } from "@keep/building-graph";
import { centroidOf, pointAlongWall, toWorld, wallNormal, wallRotationY } from "./coordinates";
import { BLUEPRINT_LINE_COLOR, realizedColorForMaterial } from "./materials";

export type ViewerMode = "blueprint" | "realized";

// ---------------------------------------------------------------------------
// Shared "element" renderer: a solid mesh, plus (in blueprint mode) crisp
// cyan edge lines instead of relying on wireframe:true, which draws messy
// triangulation diagonals across flat faces.
// ---------------------------------------------------------------------------
function ElementMesh({
  geometry,
  color,
  mode,
  position,
  rotation,
  doubleSided = false,
  selected = false,
  onClick,
}: {
  geometry: THREE.BufferGeometry;
  color: string;
  mode: ViewerMode;
  position?: [number, number, number];
  rotation?: [number, number, number];
  doubleSided?: boolean;
  selected?: boolean;
  onClick?: (e: { stopPropagation: () => void }) => void;
}) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  const displayColor = selected ? "#5EC8D8" : mode === "blueprint" ? "#0E1B2E" : color;

  return (
    <group position={position} rotation={rotation}>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onClick={
          onClick &&
          ((e) => {
            e.stopPropagation();
            onClick(e);
          })
        }
      >
        <meshStandardMaterial
          color={displayColor}
          transparent={mode === "blueprint"}
          opacity={mode === "blueprint" ? (selected ? 0.35 : 0.12) : 1}
          roughness={0.85}
          metalness={0.05}
          side={doubleSided ? THREE.DoubleSide : THREE.FrontSide}
        />
      </mesh>
      {mode === "blueprint" && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={selected ? "#8ed85e" : BLUEPRINT_LINE_COLOR} />
        </lineSegments>
      )}
    </group>
  );
}

function buildFlatPolygonGeometry(boundary: Point2[], thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  boundary.forEach((pt, i) => {
    if (i === 0) shape.moveTo(pt.x, pt.y);
    else shape.lineTo(pt.x, pt.y);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function worldVec(planPoint: Point2, height: number): THREE.Vector3 {
  const [x, y, z] = toWorld(planPoint, height);
  return new THREE.Vector3(x, y, z);
}

function buildQuadGeometry(
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3]
): THREE.BufferGeometry {
  const positions = new Float32Array(12);
  corners.forEach((c, i) => {
    positions[i * 3] = c.x;
    positions[i * 3 + 1] = c.y;
    positions[i * 3 + 2] = c.z;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function buildTriGeometry(corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.BufferGeometry {
  const positions = new Float32Array(9);
  corners.forEach((c, i) => {
    positions[i * 3] = c.x;
    positions[i * 3 + 1] = c.y;
    positions[i * 3 + 2] = c.z;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Real sloped roof panels for shed, gable, and hip roofs, built as flat
 * quads/triangles with each corner computed directly in world space,
 * rather than a fully custom mesh with hand-derived rotation matrices —
 * much lower-risk to get right, at the cost of the panels not having real
 * thickness yet. Only supports axis-aligned rectangular footprints;
 * anything non-rectangular falls back to the flat plate. Double-sided
 * rendering sidesteps any face-winding assumptions.
 */
function buildPitchedRoofPanels(roof: Roof): THREE.BufferGeometry[] | null {
  if (roof.type === "flat") return null;
  if (!isAxisAlignedRectangle(roof.boundary)) return null;

  const box = boundingBoxOf(roof.boundary);
  const width = box.maxX - box.minX;
  const depth = box.maxY - box.minY;
  const pitchRad = (roof.pitchDegrees * Math.PI) / 180;
  const overhang = roof.overhang;
  const base = roof.baseHeight;
  const ridgeAlongX = width >= depth;

  if (roof.type === "shed") {
    const run = ridgeAlongX ? depth : width;
    const rise = run * Math.tan(pitchRad);
    const corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] = ridgeAlongX
      ? [
          worldVec({ x: box.minX - overhang, y: box.minY - overhang }, base),
          worldVec({ x: box.maxX + overhang, y: box.minY - overhang }, base),
          worldVec({ x: box.maxX + overhang, y: box.maxY + overhang }, base + rise),
          worldVec({ x: box.minX - overhang, y: box.maxY + overhang }, base + rise),
        ]
      : [
          worldVec({ x: box.minX - overhang, y: box.minY - overhang }, base),
          worldVec({ x: box.minX - overhang, y: box.maxY + overhang }, base),
          worldVec({ x: box.maxX + overhang, y: box.maxY + overhang }, base + rise),
          worldVec({ x: box.maxX + overhang, y: box.minY - overhang }, base + rise),
        ];
    return [buildQuadGeometry(corners)];
  }

  const halfShort = (ridgeAlongX ? depth : width) / 2;
  const rise = halfShort * Math.tan(pitchRad);
  const ridgeHeight = base + rise;

  if (roof.type === "gable") {
    // Two symmetric rectangular panels meeting at a full-length ridge along
    // the longer axis. Gable-end walls are left open (no vertical infill) —
    // a documented simplification, not a bug.
    if (ridgeAlongX) {
      const ridgeY = (box.minY + box.maxY) / 2;
      return [
        buildQuadGeometry([
          worldVec({ x: box.minX - overhang, y: box.minY - overhang }, base),
          worldVec({ x: box.maxX + overhang, y: box.minY - overhang }, base),
          worldVec({ x: box.maxX + overhang, y: ridgeY }, ridgeHeight),
          worldVec({ x: box.minX - overhang, y: ridgeY }, ridgeHeight),
        ]),
        buildQuadGeometry([
          worldVec({ x: box.minX - overhang, y: ridgeY }, ridgeHeight),
          worldVec({ x: box.maxX + overhang, y: ridgeY }, ridgeHeight),
          worldVec({ x: box.maxX + overhang, y: box.maxY + overhang }, base),
          worldVec({ x: box.minX - overhang, y: box.maxY + overhang }, base),
        ]),
      ];
    }
    const ridgeX = (box.minX + box.maxX) / 2;
    return [
      buildQuadGeometry([
        worldVec({ x: box.minX - overhang, y: box.minY - overhang }, base),
        worldVec({ x: ridgeX, y: box.minY - overhang }, ridgeHeight),
        worldVec({ x: ridgeX, y: box.maxY + overhang }, ridgeHeight),
        worldVec({ x: box.minX - overhang, y: box.maxY + overhang }, base),
      ]),
      buildQuadGeometry([
        worldVec({ x: ridgeX, y: box.minY - overhang }, ridgeHeight),
        worldVec({ x: box.maxX + overhang, y: box.minY - overhang }, base),
        worldVec({ x: box.maxX + overhang, y: box.maxY + overhang }, base),
        worldVec({ x: ridgeX, y: box.maxY + overhang }, ridgeHeight),
      ]),
    ];
  }

  // Hip: like gable, but the two long faces are trimmed to trapezoids and
  // the short ends become sloped triangular panels instead of vertical
  // gable-end walls — all four faces slope, meeting at hip lines. Each
  // panel is still provably flat: height only ever varies along one axis,
  // same reasoning as the gable case, just clipped at the ends.
  if (ridgeAlongX) {
    const ridgeY = (box.minY + box.maxY) / 2;
    let ridgeX0 = box.minX + halfShort;
    let ridgeX1 = box.maxX - halfShort;
    if (ridgeX0 >= ridgeX1) ridgeX0 = ridgeX1 = (box.minX + box.maxX) / 2; // narrow/square footprint -> pyramid hip

    const panels: THREE.BufferGeometry[] = [
      buildQuadGeometry([
        worldVec({ x: box.minX - overhang, y: box.minY - overhang }, base),
        worldVec({ x: box.maxX + overhang, y: box.minY - overhang }, base),
        worldVec({ x: ridgeX1, y: ridgeY }, ridgeHeight),
        worldVec({ x: ridgeX0, y: ridgeY }, ridgeHeight),
      ]),
      buildQuadGeometry([
        worldVec({ x: ridgeX0, y: ridgeY }, ridgeHeight),
        worldVec({ x: ridgeX1, y: ridgeY }, ridgeHeight),
        worldVec({ x: box.maxX + overhang, y: box.maxY + overhang }, base),
        worldVec({ x: box.minX - overhang, y: box.maxY + overhang }, base),
      ]),
      buildTriGeometry([
        worldVec({ x: box.minX - overhang, y: box.minY - overhang }, base),
        worldVec({ x: ridgeX0, y: ridgeY }, ridgeHeight),
        worldVec({ x: box.minX - overhang, y: box.maxY + overhang }, base),
      ]),
      buildTriGeometry([
        worldVec({ x: box.maxX + overhang, y: box.minY - overhang }, base),
        worldVec({ x: box.maxX + overhang, y: box.maxY + overhang }, base),
        worldVec({ x: ridgeX1, y: ridgeY }, ridgeHeight),
      ]),
    ];
    return panels;
  }

  const ridgeX = (box.minX + box.maxX) / 2;
  let ridgeY0 = box.minY + halfShort;
  let ridgeY1 = box.maxY - halfShort;
  if (ridgeY0 >= ridgeY1) ridgeY0 = ridgeY1 = (box.minY + box.maxY) / 2;

  return [
    buildQuadGeometry([
      worldVec({ x: box.minX - overhang, y: box.minY - overhang }, base),
      worldVec({ x: ridgeX, y: ridgeY0 }, ridgeHeight),
      worldVec({ x: ridgeX, y: ridgeY1 }, ridgeHeight),
      worldVec({ x: box.minX - overhang, y: box.maxY + overhang }, base),
    ]),
    buildQuadGeometry([
      worldVec({ x: ridgeX, y: ridgeY0 }, ridgeHeight),
      worldVec({ x: box.maxX + overhang, y: box.minY - overhang }, base),
      worldVec({ x: box.maxX + overhang, y: box.maxY + overhang }, base),
      worldVec({ x: ridgeX, y: ridgeY1 }, ridgeHeight),
    ]),
    buildTriGeometry([
      worldVec({ x: box.minX - overhang, y: box.minY - overhang }, base),
      worldVec({ x: box.maxX + overhang, y: box.minY - overhang }, base),
      worldVec({ x: ridgeX, y: ridgeY0 }, ridgeHeight),
    ]),
    buildTriGeometry([
      worldVec({ x: box.minX - overhang, y: box.maxY + overhang }, base),
      worldVec({ x: ridgeX, y: ridgeY1 }, ridgeHeight),
      worldVec({ x: box.maxX + overhang, y: box.maxY + overhang }, base),
    ]),
  ];
}

function OpeningMesh({
  wall,
  opening,
  elevation,
  mode,
  roomCentroid,
  selected = false,
  onClick,
}: {
  wall: Wall;
  opening: Opening;
  elevation: number;
  mode: ViewerMode;
  roomCentroid: Point2;
  selected?: boolean;
  onClick?: () => void;
}) {
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(opening.width, opening.height),
    [opening.width, opening.height]
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  const planPoint = pointAlongWall(wall, opening.offset);
  const normal = wallNormal(wall, roomCentroid);
  const pushOut = wall.thickness / 2 + 0.01;
  const pushedPoint = {
    x: planPoint.x + normal.x * pushOut,
    y: planPoint.y + normal.y * pushOut,
  };
  const centerElevation = elevation + opening.sillHeight + opening.height / 2;
  const position = toWorld(pushedPoint, centerElevation);
  const rotationY = wallRotationY(wall);
  const realizedColor = opening.type === "door" ? "#8B5E3C" : "#AEE3EA";

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh
        geometry={geometry}
        onClick={
          onClick &&
          ((e) => {
            e.stopPropagation();
            onClick();
          })
        }
      >
        <meshStandardMaterial
          color={selected ? "#5EC8D8" : mode === "blueprint" ? "#0E1B2E" : realizedColor}
          transparent
          opacity={mode === "blueprint" ? (selected ? 0.5 : 0.2) : opening.type === "window" ? 0.55 : 1}
          side={THREE.DoubleSide}
        />
      </mesh>
      {mode === "blueprint" && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={selected ? "#8ed85e" : BLUEPRINT_LINE_COLOR} />
        </lineSegments>
      )}
    </group>
  );
}

function WallGroup({
  wall,
  elevation,
  material,
  mode,
  openings,
  roomCentroid,
  selection,
  onSelectWall,
  onSelectOpening,
}: {
  wall: Wall;
  elevation: number;
  material: Material | undefined;
  mode: ViewerMode;
  openings: Opening[];
  roomCentroid: Point2;
  selection?: { kind: "wall" | "opening"; id: string } | null;
  onSelectWall?: (wallId: string) => void;
  onSelectOpening?: (openingId: string) => void;
}) {
  const length = wallLength(wall);
  const geometry = useMemo(
    () => new THREE.BoxGeometry(length, wall.height, wall.thickness),
    [length, wall.height, wall.thickness]
  );

  const midpoint: Point2 = {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  };
  const position = toWorld(midpoint, elevation + wall.height / 2);
  const rotationY = wallRotationY(wall);

  return (
    <>
      <ElementMesh
        geometry={geometry}
        color={realizedColorForMaterial(material)}
        mode={mode}
        position={position}
        rotation={[0, rotationY, 0]}
        selected={selection?.kind === "wall" && selection.id === wall.id}
        onClick={onSelectWall ? () => onSelectWall(wall.id) : undefined}
      />
      {openings.map((opening) => (
        <OpeningMesh
          key={opening.id}
          wall={wall}
          opening={opening}
          elevation={elevation}
          mode={mode}
          roomCentroid={roomCentroid}
          selected={selection?.kind === "opening" && selection.id === opening.id}
          onClick={onSelectOpening ? () => onSelectOpening(opening.id) : undefined}
        />
      ))}
    </>
  );
}

function SlabGroup({
  slab,
  elevation,
  material,
  mode,
}: {
  slab: Slab;
  elevation: number;
  material: Material | undefined;
  mode: ViewerMode;
}) {
  const geometry = useMemo(() => buildFlatPolygonGeometry(slab.boundary, slab.thickness), [slab]);
  return (
    <ElementMesh
      geometry={geometry}
      color={realizedColorForMaterial(material)}
      mode={mode}
      position={[0, elevation, 0]}
    />
  );
}

function RoofGroup({
  roof,
  material,
  mode,
}: {
  roof: Roof;
  material: Material | undefined;
  mode: ViewerMode;
}) {
  const pitchedPanels = useMemo(() => buildPitchedRoofPanels(roof), [roof]);
  const flatGeometry = useMemo(() => buildFlatPolygonGeometry(roof.boundary, roof.thickness), [roof]);

  if (pitchedPanels) {
    return (
      <>
        {pitchedPanels.map((geom, i) => (
          <ElementMesh key={i} geometry={geom} color={realizedColorForMaterial(material)} mode={mode} doubleSided />
        ))}
      </>
    );
  }

  // Flat, and non-rectangular footprints of any pitched type: flat plate.
  return (
    <ElementMesh
      geometry={flatGeometry}
      color={realizedColorForMaterial(material)}
      mode={mode}
      position={[0, roof.baseHeight, 0]}
    />
  );
}

export function BuildingScene({
  graph,
  mode,
  hideRoof = false,
  selection = null,
  onSelectWall,
  onSelectOpening,
}: {
  graph: BuildingGraph;
  mode: ViewerMode;
  hideRoof?: boolean;
  selection?: { kind: "wall" | "opening"; id: string } | null;
  onSelectWall?: (wallId: string) => void;
  onSelectOpening?: (openingId: string) => void;
}) {
  const levelElevation = (levelId: string): number =>
    graph.levels.find((l) => l.id === levelId)?.elevation ?? 0;

  const materialOf = (materialId: string): Material | undefined =>
    graph.materials.find((m) => m.id === materialId);

  const openingsById = useMemo(() => {
    const map = new Map<string, Opening>();
    graph.openings.forEach((o) => map.set(o.id, o));
    return map;
  }, [graph.openings]);

  const centroidByLevel = useMemo(() => {
    const pointsByLevel = new Map<string, Point2[]>();
    graph.walls.forEach((wall) => {
      const list = pointsByLevel.get(wall.levelId) ?? [];
      list.push(wall.start, wall.end);
      pointsByLevel.set(wall.levelId, list);
    });
    const map = new Map<string, Point2>();
    pointsByLevel.forEach((points, levelId) => map.set(levelId, centroidOf(points)));
    return map;
  }, [graph.walls]);

  return (
    <group>
      {graph.walls.map((wall) => (
        <WallGroup
          key={wall.id}
          wall={wall}
          elevation={levelElevation(wall.levelId)}
          material={materialOf(wall.materialId)}
          mode={mode}
          roomCentroid={centroidByLevel.get(wall.levelId) ?? { x: wall.start.x, y: wall.start.y }}
          openings={wall.openingIds
            .map((id) => openingsById.get(id))
            .filter((o): o is Opening => Boolean(o))}
          selection={selection}
          onSelectWall={onSelectWall}
          onSelectOpening={onSelectOpening}
        />
      ))}
      {graph.slabs.map((slab) => (
        <SlabGroup
          key={slab.id}
          slab={slab}
          elevation={levelElevation(slab.levelId)}
          material={materialOf(slab.materialId)}
          mode={mode}
        />
      ))}
      {!hideRoof &&
        graph.roofs.map((roof) => (
          <RoofGroup key={roof.id} roof={roof} material={materialOf(roof.materialId)} mode={mode} />
        ))}
    </group>
  );
}
