import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
  type WheelEvent,
} from "react";
import type { Opening, Point2, Wall } from "@keep/building-graph";
import { centroidOf, polygonArea, wallLength } from "@keep/building-graph";
import {
  CLOSE_LOOP_SNAP_DISTANCE,
  boundingBoxOf,
  distance,
  findCoincidentVertices,
  findNearestVertex,
  openingPositionOnWall,
  snapToGrid,
  snapToOrtho,
} from "./geometry2d";
import type { PendingChain, Selection, Tool } from "./types";

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_VIEW: ViewBox = { x: -3, y: -3, width: 18, height: 13 };
const VERTEX_RADIUS = 0.1; // metres — small on purpose; these are snap-point markers, not room labels
const DRAG_THRESHOLD = 0.05; // metres of movement before a mousedown counts as a drag rather than a click

function screenToPlan(svg: SVGSVGElement, clientX: number, clientY: number): Point2 {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

export interface PlanCanvasHandle {
  fitToView: () => void;
}

interface VertexDragState {
  anchor: Point2;
  current: Point2;
  affected: { wallId: string; end: "start" | "end" }[];
}

interface OpeningDragState {
  openingId: string;
  wall: Wall;
  currentOffset: number;
}

export const PlanCanvas = forwardRef<
  PlanCanvasHandle,
  {
    tool: Tool;
    walls: Wall[];
    openings: Opening[];
    rooms: { id: string; boundary: Point2[] }[];
    belowWalls?: Wall[];
    belowLevelName?: string;
    pendingChain: PendingChain | null;
    selection: Selection | null;
    onPointClick: (p: Point2) => void;
    onRectangleComplete: (a: Point2, b: Point2) => void;
    onVertexDragComplete: (oldPoint: Point2, newPoint: Point2, affected: { wallId: string; end: "start" | "end" }[]) => void;
    onOpeningDragComplete: (openingId: string, newOffset: number) => void;
  }
>(function PlanCanvas(
  {
    tool,
    walls,
    openings,
    rooms,
    belowWalls = [],
    belowLevelName,
    pendingChain,
    selection,
    onPointClick,
    onRectangleComplete,
    onVertexDragComplete,
    onOpeningDragComplete,
  },
  ref
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewBox>(DEFAULT_VIEW);
  const [hover, setHover] = useState<Point2 | null>(null);
  const [rectDrag, setRectDrag] = useState<{ start: Point2; end: Point2 } | null>(null);
  const [vertexDrag, setVertexDrag] = useState<VertexDragState | null>(null);
  const panState = useRef<{ startClientX: number; startClientY: number; startView: ViewBox } | null>(null);
  const rectDragging = useRef(false);
  const [openingDrag, setOpeningDrag] = useState<OpeningDragState | null>(null);
  const dragMoved = useRef(false);
  const shiftHeld = useRef(false);

  useEffect(() => {
    rectDragging.current = false;
    setRectDrag(null);
    setVertexDrag(null);
    setOpeningDrag(null);
  }, [tool]);

  const fitToView = useCallback(() => {
    if (walls.length === 0) {
      setView(DEFAULT_VIEW);
      return;
    }
    const points = walls.flatMap((w) => [w.start, w.end]);
    const box = boundingBoxOf(points);
    const pad = 2;
    setView({
      x: box.minX - pad,
      y: box.minY - pad,
      width: Math.max(4, box.maxX - box.minX + pad * 2),
      height: Math.max(3, box.maxY - box.minY + pad * 2),
    });
  }, [walls]);

  useImperativeHandle(ref, () => ({ fitToView }), [fitToView]);

  const handleClick = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (tool === "rectangle") return; // rectangle completes on mouse-up, not click
      if (dragMoved.current) return; // a real drag just finished; don't also fire a click-select
      if (!svgRef.current) return;
      const raw = screenToPlan(svgRef.current, e.clientX, e.clientY);
      const point =
        (tool === "wall" || tool === "fence") && pendingChain && e.shiftKey
          ? snapToOrtho(pendingChain.points[pendingChain.points.length - 1], raw)
          : raw;
      onPointClick(point);
    },
    [onPointClick, tool, pendingChain]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const planPoint = screenToPlan(svgRef.current, e.clientX, e.clientY);
      shiftHeld.current = e.shiftKey;

      if (panState.current) {
        const { startClientX, startClientY, startView } = panState.current;
        const ctm = svgRef.current.getScreenCTM();
        const scale = ctm ? 1 / ctm.a : 1;
        setView({
          ...startView,
          x: startView.x - (e.clientX - startClientX) * scale,
          y: startView.y - (e.clientY - startClientY) * scale,
        });
        return;
      }

      if (rectDragging.current) {
        setRectDrag((prev) => (prev ? { ...prev, end: snapToGrid(planPoint) } : prev));
      }

      if (vertexDrag) {
        const snapped = snapToGrid(planPoint);
        if (distance(snapped, vertexDrag.anchor) > DRAG_THRESHOLD) dragMoved.current = true;
        setVertexDrag((prev) => (prev ? { ...prev, current: snapped } : prev));
      }

      if (openingDrag) {
        const wall = openingDrag.wall;
        const wx = wall.end.x - wall.start.x;
        const wy = wall.end.y - wall.start.y;
        const len2 = wx * wx + wy * wy || 1;
        const t = ((planPoint.x - wall.start.x) * wx + (planPoint.y - wall.start.y) * wy) / len2;
        const newOffset = t * Math.hypot(wx, wy);
        if (Math.abs(newOffset - openingDrag.currentOffset) > DRAG_THRESHOLD) dragMoved.current = true;
        setOpeningDrag((prev) => (prev ? { ...prev, currentOffset: newOffset } : prev));
      }

      setHover(planPoint);
    },
    [vertexDrag, openingDrag]
  );

  const handleMouseDown = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (e.button === 1) {
        e.preventDefault();
        panState.current = { startClientX: e.clientX, startClientY: e.clientY, startView: view };
        return;
      }
      if (e.button !== 0 || !svgRef.current) return;

      dragMoved.current = false;
      const planPoint = screenToPlan(svgRef.current, e.clientX, e.clientY);

      if (tool === "rectangle") {
        rectDragging.current = true;
        setRectDrag({ start: snapToGrid(planPoint), end: snapToGrid(planPoint) });
        return;
      }

      if (tool === "select") {
        const vertex = findNearestVertex(planPoint, walls);
        if (vertex) {
          const affected = findCoincidentVertices(vertex.point, walls);
          setVertexDrag({ anchor: vertex.point, current: vertex.point, affected });
          return;
        }

        const openingHit = openings.find((o) => {
          const wall = walls.find((w) => w.id === o.wallId);
          if (!wall) return false;
          const pos = openingPositionOnWall(wall, o.offset);
          return distance(planPoint, pos) <= Math.max(o.width / 2, 0.3);
        });
        if (openingHit) {
          const wall = walls.find((w) => w.id === openingHit.wallId);
          if (wall) setOpeningDrag({ openingId: openingHit.id, wall, currentOffset: openingHit.offset });
        }
      }
    },
    [view, tool, walls, openings]
  );

  const handleMouseUp = useCallback(() => {
    panState.current = null;

    if (rectDragging.current && rectDrag) {
      onRectangleComplete(rectDrag.start, rectDrag.end);
    }
    rectDragging.current = false;
    setRectDrag(null);

    if (vertexDrag) {
      if (dragMoved.current) {
        onVertexDragComplete(vertexDrag.anchor, vertexDrag.current, vertexDrag.affected);
      }
      setVertexDrag(null);
    }

    if (openingDrag) {
      if (dragMoved.current) {
        onOpeningDragComplete(openingDrag.openingId, openingDrag.currentOffset);
      }
      setOpeningDrag(null);
    }
  }, [rectDrag, onRectangleComplete, vertexDrag, onVertexDragComplete, openingDrag, onOpeningDragComplete]);

  const handleWheel = useCallback((e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    setView((v) => {
      const newWidth = Math.max(3, Math.min(80, v.width * factor));
      const newHeight = Math.max(2, Math.min(60, v.height * factor));
      return {
        x: v.x - (newWidth - v.width) / 2,
        y: v.y - (newHeight - v.height) / 2,
        width: newWidth,
        height: newHeight,
      };
    });
  }, []);

  const lastChainPoint = pendingChain?.points[pendingChain.points.length - 1];
  const rawHoverForChain = hover;
  const chainPreviewPoint =
    lastChainPoint && rawHoverForChain && shiftHeld.current
      ? snapToOrtho(lastChainPoint, rawHoverForChain)
      : rawHoverForChain;
  const willClose =
    tool === "wall" &&
    !!pendingChain &&
    pendingChain.points.length >= 3 &&
    !!chainPreviewPoint &&
    distance(chainPreviewPoint, pendingChain.points[0]) <= CLOSE_LOOP_SNAP_DISTANCE;
  const previewLength = lastChainPoint && chainPreviewPoint ? distance(lastChainPoint, chainPreviewPoint) : null;
  const previewMid =
    lastChainPoint && chainPreviewPoint
      ? { x: (lastChainPoint.x + chainPreviewPoint.x) / 2, y: (lastChainPoint.y + chainPreviewPoint.y) / 2 }
      : null;

  // While a vertex is being dragged, show walls at their live (not-yet-committed) positions.
  const displayWalls = vertexDrag
    ? walls.map((w) => {
        const hit = vertexDrag.affected.find((a) => a.wallId === w.id);
        return hit ? { ...w, [hit.end]: vertexDrag.current } : w;
      })
    : walls;

  return (
    <div className="plan-canvas-wrap">
      <svg
      ref={svgRef}
      className="plan-canvas"
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <pattern id="plan-grid" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e2dccc" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>

      <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="#f7f5f0" />
      <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="url(#plan-grid)" />

      {/* Ghost outline of the floor directly below, for alignment — purely visual, not interactive */}
      {belowWalls.length > 0 && (
        <g className="below-floor-ghost" opacity={0.65}>
          {belowWalls.map((wall) => (
            <line
              key={`ghost-${wall.id}`}
              x1={wall.start.x}
              y1={wall.start.y}
              x2={wall.end.x}
              y2={wall.end.y}
              stroke="#c7c0ae"
              strokeWidth={5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      )}

      {/* Finished walls (or their live drag position) */}
      {displayWalls.map((wall) => {
        const isSelected = selection?.kind === "wall" && selection.id === wall.id;
        const isDragging = vertexDrag?.affected.some((a) => a.wallId === wall.id);
        return (
          <line
            key={wall.id}
            x1={wall.start.x}
            y1={wall.start.y}
            x2={wall.end.x}
            y2={wall.end.y}
            stroke={isDragging ? "#8ed85e" : isSelected ? "#5ec8d8" : "#2b2e33"}
            strokeWidth={isSelected || isDragging ? 7 : 5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {/* A subtle handle on every wall endpoint when selecting, hinting they're draggable */}
      {tool === "select" &&
        displayWalls.flatMap((wall) => [
          <circle key={`${wall.id}-s`} cx={wall.start.x} cy={wall.start.y} r={VERTEX_RADIUS * 0.8} fill="#b8b2a3" />,
          <circle key={`${wall.id}-e`} cx={wall.end.x} cy={wall.end.y} r={VERTEX_RADIUS * 0.8} fill="#b8b2a3" />,
        ])}

      {/* Wall length labels — always on, not just while drawing. Offset perpendicular to
          the wall so the text sits beside the stroke instead of underneath it. */}
      {displayWalls.map((wall) => {
        const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
        const dx = wall.end.x - wall.start.x;
        const dy = wall.end.y - wall.start.y;
        const len = Math.hypot(dx, dy) || 1;
        const perp = { x: -dy / len, y: dx / len };
        const labelOffset = 0.3;
        const pos = { x: mid.x + perp.x * labelOffset, y: mid.y + perp.y * labelOffset };
        return (
          <text
            key={`${wall.id}-len`}
            x={pos.x}
            y={pos.y}
            fontSize={0.28}
            fill="#6b6f76"
            stroke="#f7f5f0"
            strokeWidth={2}
            paintOrder="stroke"
            vectorEffect="non-scaling-stroke"
            textAnchor="middle"
          >
            {wallLength(wall).toFixed(2)} m
          </text>
        );
      })}

      {/* Room name + area, centered in each room — with a light decluttering pass:
          if two room centers are close enough that their labels would merge
          (e.g. small nested/adjacent rooms), nudge the later one down a bit. */}
      {(() => {
        const placed: Point2[] = [];
        return rooms.map((room, i) => {
          const center = centroidOf(room.boundary);
          const area = polygonArea(room.boundary);
          let pos = { ...center };
          const collisionThreshold = 2.2; // metres — roughly one label's worth of width
          let attempts = 0;
          while (placed.some((p) => distance(p, pos) < collisionThreshold) && attempts < 6) {
            pos = { x: center.x, y: center.y + 0.45 * (attempts + 1) };
            attempts++;
          }
          placed.push(pos);
          return (
            <text
              key={room.id}
              x={pos.x}
              y={pos.y}
              fontSize={0.4}
              fontWeight={600}
              fill="#8a8474"
              stroke="#f7f5f0"
              strokeWidth={3}
              paintOrder="stroke"
              vectorEffect="non-scaling-stroke"
              textAnchor="middle"
            >
              Room {i + 1} · {area.toFixed(1)} m²
            </text>
          );
        });
      })()}

      {/* Openings, shown as markers along their wall */}
      {openings.map((opening) => {
        const wall = displayWalls.find((w) => w.id === opening.wallId);
        if (!wall) return null;
        const effectiveOffset = openingDrag?.openingId === opening.id ? openingDrag.currentOffset : opening.offset;
        const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
        const t = effectiveOffset / len;
        const pos: Point2 = {
          x: wall.start.x + (wall.end.x - wall.start.x) * t,
          y: wall.start.y + (wall.end.y - wall.start.y) * t,
        };
        const isSelected = selection?.kind === "opening" && selection.id === opening.id;
        const isDragging = openingDrag?.openingId === opening.id;
        const dx = ((wall.end.x - wall.start.x) / len) * (opening.width / 2);
        const dy = ((wall.end.y - wall.start.y) / len) * (opening.width / 2);
        return (
          <line
            key={opening.id}
            x1={pos.x - dx}
            y1={pos.y - dy}
            x2={pos.x + dx}
            y2={pos.y + dy}
            stroke={isDragging ? "#8ed85e" : isSelected ? "#5ec8d8" : opening.type === "door" ? "#8b5e3c" : "#3f8ea8"}
            strokeWidth={9}
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {/* Rectangle Room drag preview */}
      {rectDrag && (
        <rect
          x={Math.min(rectDrag.start.x, rectDrag.end.x)}
          y={Math.min(rectDrag.start.y, rectDrag.end.y)}
          width={Math.abs(rectDrag.end.x - rectDrag.start.x)}
          height={Math.abs(rectDrag.end.y - rectDrag.start.y)}
          fill="rgba(94, 200, 216, 0.15)"
          stroke="#5ec8d8"
          strokeWidth={3}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* In-progress wall chain: placed points + rubber-band preview to the cursor */}
      {pendingChain && (
        <>
          {pendingChain.points.map((p, i) => {
            const isStart = i === 0;
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={isStart && willClose ? VERTEX_RADIUS * 2.2 : VERTEX_RADIUS}
                fill={isStart && willClose ? "#8ed85e" : "#5ec8d8"}
              />
            );
          })}
          {chainPreviewPoint && (
            <>
              <line
                x1={lastChainPoint!.x}
                y1={lastChainPoint!.y}
                x2={willClose ? pendingChain.points[0].x : chainPreviewPoint.x}
                y2={willClose ? pendingChain.points[0].y : chainPreviewPoint.y}
                stroke={willClose ? "#8ed85e" : "#5ec8d8"}
                strokeWidth={3}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
              {previewLength !== null && previewMid && (
                <text
                  x={previewMid.x}
                  y={previewMid.y}
                  fontSize={0.35}
                  fill="#2b2e33"
                  stroke="#f7f5f0"
                  strokeWidth={2}
                  paintOrder="stroke"
                  vectorEffect="non-scaling-stroke"
                  textAnchor="middle"
                >
                  {previewLength.toFixed(2)} m
                </text>
              )}
            </>
          )}
        </>
      )}
    </svg>
      <div className="plan-canvas__legend">
        <span className="plan-canvas__legend-item">
          <span className="legend-swatch legend-swatch--door" /> Door
        </span>
        <span className="plan-canvas__legend-item">
          <span className="legend-swatch legend-swatch--window" /> Window
        </span>
        <span className="plan-canvas__legend-item plan-canvas__legend-scale">1 grid square = 1 m</span>
        {belowWalls.length > 0 && (
          <span className="plan-canvas__legend-item plan-canvas__legend-ghost-note">
            <span className="legend-swatch legend-swatch--ghost" /> {belowLevelName ?? "Floor below"} (reference only)
          </span>
        )}
      </div>
    </div>
  );
});
