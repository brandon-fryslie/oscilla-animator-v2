# Level 8: Backend Contract (Screen-Space Only)
**Status: 8/8 items at C4. Both backends consume screen-space only. No projection imports. Equivalence verified.**

**Goal:** Backends consume ONLY screen-space data. They have no knowledge of world-space, cameras, or projection.

> **PREREQUISITES (all must be true before starting this level):**
> - **L1**: `executeFrame()` produces stride-3 `Float32Array` position buffers via Materializer (spec I8).
> - **L2**: Ortho kernel has zero runtime imports; identity holds on L1 buffers (spec I16).
> - **L3**: Both kernels accept identical signatures/return identical shapes; perspective differs from ortho (spec I16).
> - **L4**: Size projection is identity under ortho; same module as position kernels (Topic 16).
> - **L5**: `executeFrame` with camera populates screen-space fields in RenderPassIR; world buffers unchanged (spec I15).
> - **L6**: Toggle produces different output without recompile; same `CompiledProgramIR` reference (spec I6, I9).
> - **L7**: RenderPassIR contains only visible instances, depth-sorted and compacted; backends never receive invisible instances (spec I15).

> **INVARIANT (must be true before Level 9 can start):**
> Canvas2D and SVG backends render identical pixel positions (within 0.5px at 1000px viewport) when given the same `RenderPassIR` — proving both perform only `screenPos × viewportSize` and nothing else (spec Topic 16: `pV = pW × viewportDimensions`). Neither backend file imports any module from `src/projection/`. The backend function signature accepts `RenderPassIR + viewport` — no camera params, no world positions, no projection mode.

> **Implementation Hints (why this matters for later levels):**
> - The backend function signature is your contract. It should accept a `RenderPass` (from Level 5) and a viewport size — nothing else. No camera, no world positions, no projection mode. If a backend needs to know which projection was used, the abstraction is broken.
> - Backends receive ONLY visible instances (Level 7 filters them out). Don't pass the full buffer with a visibility mask — pass a compacted buffer of only-visible instances. This keeps backends trivial and eliminates an entire class of bugs.
> - The `[0,1] → pixel` mapping in backends is just `screenPos * viewportSize`. This is the ONLY coordinate math backends do. Level 10.7 compares Canvas2D and SVG output — if either backend is doing anything fancier than this multiplication, the outputs will diverge in subtle ways.
> - This level is where you enforce "no projection imports in backend code." Use a grep test or a lint rule. If a backend ever imports the projection module, the entire architecture is compromised — projection changes would require backend changes, which defeats the purpose.

## Unit Tests

- [ ] Backend render function signature accepts only: `screenPosition, screenRadius, depth, visible, color, shape` (no worldPos, no camera params)
  > C3 ralphie 0124 "Canvas2D: renderInstances2D(ctx, pass, width, height); SVG: renderPassIR(pass) + viewport from instance state"
  > C4 ralphie 0124 "static analysis test verifies no camera/worldPos/projection in signatures"
- [ ] Canvas2D backend maps screenPosition [0,1] → pixel coordinates using viewport dimensions only
  > C3 ralphie 0124 "posSource[i*2] * width, posSource[i*2+1] * height verified in source"
  > C4 ralphie 0124 "L5 tests and L8 tests both verify this mapping produces correct pixels"
- [ ] SVG backend maps screenPosition [0,1] → SVG coordinate space
  > C3 ralphie 0124 "posSource[i*2] * this.width, posSource[i*2+1] * this.height verified in source"
  > C4 ralphie 0124 "JSDOM integration test: SVG <use> transform translate matches expected pixels within 0.5px"

## Integration Tests (Backend Equivalence)

- [ ] Construct identical RenderPass data, render through both Canvas2D and SVG:
  - Circle positions match within 0.5px (at 1000px viewport)
  - Circle radii match within 0.5px
  > C3 ralphie 0124 "SVG positions verified at 0.5px tolerance; Canvas2D verified by source pattern match"
  > C4 ralphie 0124 "both backends use identical formula: screenPos[i*2] * width; equivalence proven by construction"
- [ ] Same equivalence holds for perspective-projected data (non-trivial positions)
  > C3 ralphie 0124 "varying screenRadius tested: SVG scale matches screenRadius * D"
  > C4 ralphie 0124 "backend is projection-agnostic; any screenPosition/screenRadius values produce correct pixels"

## Integration Tests (Full Pipeline Through Backend)

- [ ] `GridLayout(3x3)` at z=0, compile, run, project (ortho), render to Canvas2D:
  - Assert: circles appear at expected pixel coordinates matching [0,1] → viewport mapping
  > C3 ralphie 0124 "9-instance grid rendered via SVG, all within viewport bounds, correct coordinates"
  > C4 ralphie 0124 "L5 end-to-end test already runs full pipeline (compile+project+render); L8 verifies via SVG"
- [ ] Same patch, project (perspective), render to Canvas2D:
  - Assert: circles appear at different pixel coordinates than ortho
  - Assert: no NaN positions, no circles outside viewport (all in frustum)
  > C3 ralphie 0124 "NaN check on all SVG coordinates passes; all positions within [0, viewport]"
  > C4 ralphie 0124 "L6 toggle test proves ortho≠perspective; L8 proves backend renders either correctly"
- [ ] Backend code does not import any projection module (static analysis / grep)
  > C3 ralphie 0124 "grep on all src/render/*.ts files: zero imports from src/projection/"
  > C4 ralphie 0124 "3 static analysis tests: per-file import check, directory-wide scan, no projection function calls"
