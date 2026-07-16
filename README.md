# Keep

Civil engineering + architecture platform. Design a building (Creative Mode)
or hand it a constrained brief (Contract Mode); Keep turns the design into a
structured **Building Graph**, and generates the estimation, quantities, and
a shareable blueprint from it.

This repo is a monorepo:

```
keep/
├── packages/
│   └── building-graph/   # The shared data model + math. Everything else reads/writes this.
├── apps/
│   ├── api/              # Express + Prisma + Postgres. Auth and project CRUD.
│   └── web/              # React + Vite + react-three-fiber. Auth pages, project list, 3D viewer.
```

## Phase 0 — what's here

The goal of Phase 0 is narrow on purpose: **prove the full pipeline works
end to end**, so every later phase builds on solid ground instead of
guessing.

- [x] `BuildingGraph` schema (`packages/building-graph`) — walls, slabs,
      roofs, columns, beams, openings, a material catalog, levels, and site
      data, validated at runtime with `zod`.
- [x] A hardcoded sample building (`sampleBuilding`) that exercises every
      element type.
- [x] API: email/password auth (JWT) + project CRUD, storing each project's
      `BuildingGraph` as JSON in Postgres via Prisma.
- [x] Web: sign in, see your projects, open one, and **see it rendered in
      3D** — fetched live from the API, not a hardcoded scene in the
      frontend.
- [x] The viewer's signature feature: a **Blueprint / Realized** toggle —
      Blueprint mode renders the model as cyan line-work on a dark ground,
      literally the "new kind of blueprint" the product is about; Realized
      mode shows it with material-accurate shading.

**Not yet in scope** (later phases, see the roadmap you and Claude discussed):
manual editing of the model, AI generation (text or image), the actual
quantity/cost/labor estimation engine, Contract Mode's constraint locking,
and real pitched-roof geometry (roofs currently render as a flat plate —
see the comment in `BuildingScene.tsx`).

## Design direction

The visual language is drawn from the subject itself rather than a generic
template: **cyanotype blueprints** (the actual historical meaning of
"blueprint" — white/cyan line-work on deep blue) for the 3D viewer, warm
drafting-paper white for the surrounding app chrome, and a monospace face
for anything numeric or technical (dimensions, metadata, labels), paired
with a geometric display face for headings. Amber and a muted ledger-green
are reserved, unused in Phase 0, for **Contract Mode's "hold" state** and
**money/estimate figures** respectively once Phase 2 and 4 land — so those
concepts get a consistent visual identity from day one instead of being
retrofitted.

## Running it locally

Prerequisites: Node 18+, a Postgres database (a free one on
[Railway](https://railway.app) works fine, or `docker run -p 5432:5432 -e POSTGRES_PASSWORD=keep postgres`).

```bash
git clone <this-repo>
cd keep
npm install

# apps/api
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env — set DATABASE_URL to your Postgres instance, and JWT_SECRET
npm run prisma:migrate --workspace apps/api
npm run seed --workspace apps/api      # creates demo@keep.local / keep-demo-1234 with a sample project
npm run dev:api

# apps/web (separate terminal)
cp apps/web/.env.example apps/web/.env
npm run dev:web
```

Open http://localhost:5173, sign in with the seeded demo account (or sign
up), and open the sample project.

## Deploying to Railway

This is an **npm-workspaces monorepo with shared code** (`apps/api` and
`apps/web` both depend on `packages/building-graph`) — Railway treats this
differently from an "isolated" monorepo where each app is fully
self-contained. Two rules matter, confirmed against Railway's current docs:

- **Do not set Root Directory to `apps/api` or `apps/web` on either
  service.** Root Directory controls what gets copied into the build —
  point it at a subfolder and Railway throws away everything outside it,
  including the repo root `package.json` (which defines the workspaces)
  and `packages/building-graph`. Leave Root Directory as `/` (the
  default) on **both** services.
- Because Root Directory stays at `/`, Railway won't auto-discover
  `apps/api/railway.json` / `apps/web/railway.json` on its own — **Config
  File Path is a separate setting from Root Directory** and has to be set
  explicitly per service, as an absolute path from the repo root.

Steps:

1. **New Project → Deploy from GitHub repo**, pick this repo. Railway may
   offer to auto-detect the workspaces and stage services for you — if
   the auto-detected commands look wrong, delete what it made and
   continue manually below.
2. **Add a Postgres plugin** to the project (`+ New` → `Database` →
   `Postgres`).
3. **Create a service for the API**: connect the same repo.
   In **Settings → Source**, leave Root Directory as `/` and set
   **Config File Path** to `apps/api/railway.json`.
   In **Variables**, add:
   - `JWT_SECRET` — a long random string
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (a *reference*
     variable — Railway doesn't auto-link the Postgres plugin to other
     services, you wire it explicitly like this)
   - `CORS_ORIGIN` — leave a placeholder for now, fixed in step 5
   In **Settings → Networking**, click **Generate Domain** so this
   service has a public URL.
4. **Create a service for the web app**: same repo, Root Directory `/`,
   **Config File Path** = `apps/web/railway.json`. In **Variables**:
   - `VITE_API_URL` = `https://${{<api-service-name>.RAILWAY_PUBLIC_DOMAIN}}`
     (replace `<api-service-name>` with whatever you named the API
     service in step 3 — Railway's variable editor autocompletes this).
     Vite bakes this in at **build** time, so it must be set before the
     first deploy.
   Also **Generate Domain** for this service under Networking.
5. Go back to the API service's `CORS_ORIGIN` variable and set it to
   `https://${{<web-service-name>.RAILWAY_PUBLIC_DOMAIN}}`, then redeploy
   the API so it picks up the real value.

Both `railway.json` files already encode the right build/start commands
(a root-level `npm install` so workspace linking works, then a scoped
`npm run ... --workspace <app>` for the build/start) — once Root
Directory and Config File Path are set correctly per service, Railway
just runs them.

## Phase 1 — manual 3D authoring

A single-canvas editor (`/projects/:id/edit`, reachable from the "Edit"
button on a project's viewer page) toggling between a 2D plan and the
Phase 0 3D viewer — not a fixed split screen, matching how Hypar's editor
works rather than a generic side-by-side drawing tool.

**Drawing:**
- [x] **Rectangle Room** — drag from one corner to the opposite corner for
      an instant closed room (four walls + floor + roof). This is the
      primary, first-listed tool; point-by-point drawing is more error-prone
      for a first attempt, so the default nudges toward the forgiving option.
- [x] **Draw Wall** — click to place points, click back near the first point
      to close the loop. Hold **Shift** to lock the current segment to the
      nearest 0/45/90°.
- [x] **Door** / **Window** — click on a wall to place one, with sensible
      default sizes.
- [x] Closing a loop auto-generates a floor slab and a roof spanning it.

**Editing:**
- [x] **Select** — click a wall or opening to edit height, thickness,
      material (walls) or width/height/sill (openings) in a floating
      properties panel; Delete/Backspace removes the selection.
- [x] **Drag-to-reshape** — in Select mode, drag an existing wall's corner
      to move it; every wall sharing that corner moves with it, so the room
      stays closed. Doors/windows drag along their wall the same way.
- [x] **Undo / Redo** — Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z), a proper
      two-stack history. Mid-chain wall drawing undoes one point at a time.
- [x] **Fit View** button frames the whole current floor.

**Structure:**
- [x] **Multi-floor** — a floor switcher (tabs + "Add Floor"); each floor is
      independently editable in 2D, and all floors render stacked at the
      correct elevation in 3D. Editing a floor's height re-stacks every
      floor above it automatically.
- [x] **Real roof geometry** for gable and shed roofs — actual sloped
      panels, chosen per-room from a small roof panel under the toolbar.
      This covers axis-aligned rectangular rooms; anything else (or hip,
      not yet implemented) falls back to a flat plate, deliberately rather
      than silently.
- [x] **Hide roof** toggle in the 3D viewer, so you can orbit down and see
      inside a Realized-mode building.
- [x] Doors/windows render correctly on the *outside* face of a wall in
      every direction — fixed a real bug where a fixed-rotation normal
      calculation happened to point inward for some wall windings.
- [x] Four default wall materials (concrete block, brick veneer, timber
      stud, steel-framed) seeded into every project, merged into whatever
      materials a project already has rather than replacing them.
- [x] **Save** writes back through the same `PUT /projects/:id` endpoint
      from Phase 0 — no backend changes were needed, since it already
      validates whatever `BuildingGraph` it's given.

**Known limitations, stated plainly rather than left to be discovered:**
- One closed exterior loop per room (no interior room subdivision within a
  single loop yet).
- A lower floor's roof isn't automatically suppressed when a floor above
  covers the same footprint — build directly above an existing room and
  you'll get an overlapping roof plate and floor slab. Needs footprint-
  overlap detection between floors; deferred rather than rushed.
- Hip roofs still render as the flat plate.
- Dragging/reshaping only works in the 2D view. 3D-view dragging needs
  raycasting and on-screen gizmos — a meaningfully bigger feature, sequenced
  for later rather than bolted on quickly.
- No furniture placement, no stairs between floors yet.

**Round 3 — design review fixes:**
- **Fixed a real bug**: switching to the 3D view left the 2D drawing toolbar (tool buttons, "drag to draw a rectangle" hint) visibly active even though none of it applies in 3D. The toolbar now shows only Undo/Redo/Save in 3D mode.
- Wall length labels are now always visible in 2D (not just while drawing), plus a room name + area label centered on each closed room.
- A door/window color legend and a "1 grid square = 1 m" scale note, both in the 2D view.
- Project title is now click-to-rename, in the editor header — this was already supported by the API (`PUT /projects/:id` already accepted a `name` field), it just had no UI.
- An "Unsaved changes" indicator, and a note that the 3D preview always reflects live edits regardless of save state.
- 3D viewer: an orientation gizmo (bottom-right), a camera-control hint, a small stats panel (footprint area, floor count), working shadows (meshes now actually cast/receive), and a "Concept render" badge in Realized mode to set material-fidelity expectations honestly.
- Toolbar button labels switched from the monospace font to the body font for readability — mono stays reserved for actual measurements.
- **Onion-skin floor reference**: when editing floor 2+, the floor directly below renders as a faded gray outline underneath the current floor, purely visual (not selectable/draggable), so aligning stacked rooms doesn't require memorizing coordinates.
- The roof panel's empty state now explains itself ("close a room and its roof will appear here automatically") instead of just disappearing — roofs were already automatic on loop-close, this just makes that discoverable.

**Round 4 — a real regression fix, plus wall defaults and delete:**
- **Fixed a real bug**: the floating 3D footprint tooltip only ever read `graph.slabs[0]` — a leftover from Phase 0 when there was always exactly one room. With multiple rooms, it showed one arbitrary room's area labeled just "footprint," while the stats panel correctly summed all of them — two conflicting numbers with identical labels on screen at once. Now every room gets its own correctly-labeled floating tag ("Room 1 · 57.2 m²", etc.), and the summed panel stat is relabeled "Total floor area" (accurate for what it actually computes — a sum across every level, not a ground-floor footprint, which is a different number architecturally).
- **Fixed the doubled/ghosted dimension-label text**: the label halo's stroke width scaled with 2D zoom instead of staying a constant screen size, which could visually read as a second, offset copy of the text at some zoom levels. Now pinned to a constant pixel width regardless of zoom.
- Project title's rename pencil icon is now always faintly visible instead of fully invisible until hover — the rename feature was already there, just not discoverable in a static view.
- **Wall defaults**: a new "New walls" control (thickness + material) next to the roof panel. Previously every new wall was hardcoded to 0.2m concrete block regardless of what you needed — now that's a setting, applied to walls drawn from that point on. Existing walls are unaffected, same as they already were via the properties panel.
- **Delete project**, with a confirmation prompt — the backend already supported it, this was a missing button.
- The Projects page now explains "Failed to fetch" errors inline (almost always means the API dev server isn't running) instead of showing a bare, unexplained error.

## Round 6 — a real architectural fix, plus six direct bug reports

**The foundational fix:** rooms are now a real, first-class part of the Building Graph (`graph.rooms`), instead of being inferred purely from whether a floor slab happened to exist. That inference was the root cause of several bugs at once — there was no way to represent "these four walls form a loop but have neither a floor nor a roof," which is exactly what a fence is. Slabs and roofs are now *generated from* each room's `hasFloor`/`hasRoof` flags, not the other way around. Existing saved projects migrate automatically on load (rooms are inferred from their existing slabs/roofs once, the same way as before, then saved as real Room data going forward).

**Your six points, addressed directly:**

1. **Labor rate not saving, always back to 25 on refresh** — real bug, confirmed: the rate was local component state on the viewer page, never part of the saved project. It's now part of the graph's metadata, saved to the server (debounced slightly so rapid edits don't spam requests), and reloads with whatever you last set it to.
2. **Can't make a wall shorter than 2m** — that limit is gone (down to 0.1m), both when editing an existing wall and, new, as a default you can set *before* drawing (a "New walls: Height" field next to thickness/material) — so a fence-height run of walls doesn't mean editing each one afterward.
3. **Building a fence becomes a room with a roof** — this is what the rooms architecture fix above was for. Every room's panel now has independent **Floor** and **Roof** checkboxes. Uncheck both and you get exactly four walls with nothing else — a real fence, not a room in disguise.
4. **Room labels** — moved back to room center (previously offset toward the top edge to dodge interior walls); now there's a lightweight decluttering pass instead, so two nearby room labels nudge apart rather than overlapping into unreadable text. The viewer's room breakdown is also now grouped by floor name instead of one flat "Room 1–4" list that didn't say which floor was which.
5. **Roof types still not working** — the rooms fix above should resolve any case where this was a matching bug (a room's roof settings were previously looked up through a fragile id-matching path when reloading; now `room.roofType` is read directly, no matching involved). Also: **hip roofs are now real geometry** (four sloped panels meeting at hip lines, not the flat-plate fallback) — if what you were seeing was specifically hip roofs looking unchanged, that's now fixed too.
6. **Different materials look the same in Realized mode** — confirmed bug: colors were assigned by material *category*, and brick + concrete block are both "masonry," so switching between them was a no-op visually. Materials now get their own distinct color where it matters (concrete grey, brick terracotta, timber warm wood-brown, steel cool blue-grey), falling back to category color only for materials without a specific one.

**From the review, also fixed:**
- The Undo-disabled-while-Unsaved-changes-shown contradiction: "unsaved changes" was a one-way flag that never cleared even if you undid back to exactly your last save. It's now a direct reference comparison against the saved state, so undoing all the way back correctly clears it.
- The floating/detached door: very likely explained by dragging a wall's endpoint (reshaping a room) without re-checking whether openings on that wall still fit — a door's offset could end up beyond the wall's new, shorter length. Reshaping a wall now re-clamps any openings on it to the new geometry.
- Camera-hint text unreadable in Realized mode: it was semi-transparent white, fine on the dark Blueprint background, invisible on the light one. Now a small dark pill regardless of scene color.

## Round 7 — the doors bug, the fence tool, the share link, and 3D editing

**Confirmed and fixed: doors were being silently miscounted as a wall material.** When an opening's material was picked automatically (category "timber" for doors), the lookup matched by category alone — and "Timber stud wall" (an area-priced wall material) happened to sit earlier in the material list than "Timber panel door" (the actual door material), so a door's count of 1 was being added into the wall's area-based quantity instead of appearing as its own line item. That's exactly why the cost table showed a "Timber stud wall" entry on projects that don't actually have any timber walls, and no door line at all. Fixed by requiring the fallback match to also have `unit: "unit"` — doors and windows can no longer land on an area/volume-priced material by accident.

**Shareable public link** — the biggest single gap called out across all three reviews, now built: a **Share** button on the project viewer generates a public, unauthenticated link (`/share/:slug`); anyone with the link sees a read-only 3D model and the same estimate, no login required. **Stop sharing** flips it back to private without invalidating the link (sharing again reuses the same URL). No database migration was needed — `shareSlug`/`visibility` fields existed since Phase 0, they just had no UI or public route wired to them yet.

**Fence/railing tool** — a real, separate tool now, not "Rectangle Room with the roof turned off." Draws an open run of walls (never closes into a room, no matter what shape it traces), defaults to 1.1m height and a per-linear-metre "Metal railing" material instead of a full-height wall — closer to what a terrace railing actually is, cost-wise and geometrically.

**3D editing, as asked** — click a wall or opening directly in the 3D view (inside the editor, not the read-only viewer) to select it; the same properties panel that already worked in 2D now works in 3D too, so you can change height/thickness/material/dimensions while looking at the model instead of only in plan. Clicking empty space deselects. This does not yet include *dragging* geometry directly in 3D (moving a wall's corner by grabbing it in the 3D view) — that needs raycasting-driven gizmos, a meaningfully bigger feature, and is the natural next step here, not bundled in this round.

**On the elevated-window orientation bug**: I worked through the wall/opening rotation math by hand for a concrete non-ground-floor example, and it checks out correctly — I could not find a rotation bug through code review. What I *did* find and fix: opening offsets weren't being validated on load, only after a live reshape, so a project edited before that fix shipped could have carried a bad offset forward invisibly. Every project now gets its openings' offsets re-checked against their actual wall on load, self-healing legacy data rather than requiring a manual fix. If windows still misbehave specifically on non-ground-level walls after this, that's a real, reproducible bug I haven't found yet — the most useful next report would be the exact project, floor, and wall, since I wasn't able to reproduce it from the description alone.

**Estimate transparency, per the reviews' "confidence indicator" and "no silent gaps" asks:**
- A labor-hours column per line item, not just an aggregate total.
- An explicit exclusions line ("Excludes: plumbing, electrical, HVAC, finishes, paint/plaster, rebar, foundations, permits, site work — covers only the structural shell").
- A typical-range hint next to the labor rate field (15–50, varies by region) — a guardrail without forcing a number on you.
- The legal/preliminary disclaimer is now visually smaller and separated from the functional controls, instead of competing with them for attention.

**Deliberately not done, so it's clear rather than silent:** region-configurable unit-cost tables (still the built-in defaults), floor-by-floor cost breakdown (costs are grouped by material across the whole building, not per floor), rebar and paint/plaster as their own line items (would need a proper takeoff formula per item, not just "another material"), and geometry validation at draw-time (overlapping rooms, zero-length walls) — none of these are wired in yet.

## Phase 2 — estimation, first slice

- [x] **`computeEstimate()`** in `packages/building-graph` — a pure function, `BuildingGraph` in, a full quantity + cost breakdown out. Deterministic: same graph, same numbers, every time. Walls (net of their own openings), slabs, roofs (pitched roofs get a simple slope-area correction), and now-priceable doors/windows (openings gained an optional `materialId`, with a sensible category fallback for older data that predates the field) all feed into it, grouped and costed by material.
- [x] An estimate panel on the project viewer page, below the 3D view: a line-item table (quantity, unit cost, material cost, labor cost, total per material), a grand total, and an editable labor rate.
- [x] The disclaimer is explicit about what this is: geometry-derived quantities (trustworthy) combined with default unit costs (not trustworthy for a real market) — a rough order-of-magnitude number, not a quote.

**Deliberately not built yet, so it's clear what's still missing:** a materials-catalog UI to edit unit costs per project (right now they're the built-in defaults — the estimate panel says so rather than implying otherwise), and the shareable public blueprint link that was the other half of the original Phase 2 plan. Contract Mode hasn't been started.

**Not yet in scope at all:** AI generation (text or image) and Contract
Mode's constraint locking.

## What to build next (Phase 2, continued)

Two pieces left from the original Phase 2 plan: a materials-catalog UI
(edit unit costs per project instead of relying on the built-in defaults —
the estimate panel already says plainly that this doesn't exist yet), and
the shareable public blueprint page (a permissioned read-only view of a
project's model + its estimate, reachable via a link, no login required).
The estimate panel's `computeEstimate()` call is already structured to be
reusable as-is for that page — it's a pure function over a `BuildingGraph`,
not tied to any UI state — so the public page is mostly new routing/auth
work, not new calculation logic.
