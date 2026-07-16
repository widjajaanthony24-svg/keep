# Viewer coordinate convention

The Building Graph describes plan geometry as `{ x, y }` in metres, looking
straight down (a floor plan). three.js is y-up. Every mesh builder in this
folder must go through the same mapping, defined once in `coordinates.ts`:

```
world.x = plan.x
world.y = elevation   (an explicit height passed in separately)
world.z = -plan.y
```

Two independent code paths produce this same mapping, and they agree:

**Walls, openings** (`coordinates.ts` → `toWorld`): applied directly to
positions computed in plan space.

**Slabs, roofs** (`BuildingScene.tsx` → `buildFlatPolygonGeometry`): a
`THREE.Shape` is authored directly in plan `(x, y)`, extruded along local
`z` by the element's thickness, then `geometry.rotateX(-Math.PI / 2)` is
applied. Rotating a point `(x, y, z)` by -90° about X sends it to
`(x, z, -y)` — so the shape's plan `y` also ends up at `-world.z`, and the
extrusion's local `z` (0..thickness) becomes `world.y`, matching the wall
convention exactly.

**Wall rotation**: `wallRotationY` returns `atan2(dy, dx)` using the wall's
plan-space delta directly (not a world-space delta). This looks like it
skips a step, but it's the result of working through three.js's Y-rotation
matrix combined with the `plan.y -> -world.z` mapping above — the two
negations cancel. If you ever change the mapping direction, re-derive this
angle rather than assuming it still holds.

If you add a new element type, do the position/direction math in plan space
first (it's simpler to reason about) and call `toWorld()` only at the very
end, or reuse `buildFlatPolygonGeometry` if it's a flat polygon. Don't invent
a third way to get into world space.
