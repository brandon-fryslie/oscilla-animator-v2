# Handoff: Debug Field Visualization Polish & Renderer Gaps

**Created**: 2026-02-19
**For**: Next agent session
**Status**: in-progress

---

## Objective

Fix visual quality issues in the new field debug visualization (spiky charts, overflow clipping, missing color renderer on some ports) and fill renderer gaps for vec3/vec4/int payload types so all field edges get meaningful visualization.

## Current State

### What's Been Done (This Session, 2026-02-19)
- `FieldStatsAccumulator` created: per-slot accumulated stats (allTimeMin/Max, EMA mean) + 256-frame ring buffer of per-frame snapshots (min/p25/mean/p75/max)
- `FieldValueResult` changed from scalar stats to `{ stats: AggregateFieldStats, buffer: Float32Array }`
- `trackField()` now takes `CanonicalType` to derive stride for the accumulator
- `ColorPalette.tsx` created: canvas-based sorted color strip for color fields
- `FieldBandChart.tsx` created: canvas-based temporal distribution chart (outer min-max band, inner IQR band, mean line)
- `FieldValueSection` rewritten with two paths: color fields (palette + mean swatch) and numeric fields (renderer + band chart)
- `ColorValueRenderer` aggregate mode simplified (removed per-channel bars, shows mean swatch + hex + count)
- All 155 debug-viz tests + 38 DebugService tests pass. Typecheck clean.

### What's Broken / Needs Fixing
1. **Spiky charts** — FieldBandChart shows extreme spikiness that appears uniform across all ports/patches
2. **Chart overflow** — After a few seconds the 256-frame chart becomes a compressed solid block. Container clips content.
3. **Color renderer not triggering** — Some ports explicitly typed as `color` don't show the color palette visualization
4. **Missing renderers** — vec3, vec4, int, cameraProjection have no dedicated renderers (fall through to GenericNumericRenderer which shows raw numbers)

---

## Issue Analysis

### Issue 1: Spiky Charts

**Screenshot evidence**: First screenshot shows extreme high-frequency zig-zag pattern in the FieldBandChart, uniform across all ports.

**Root cause candidates** (investigate in this order):

1. **Frame-to-frame min/max oscillation**: The accumulator computes per-frame min and max from all lanes. If lanes have different values (which they always will in a field of 400 instances), the per-frame min/max will be relatively stable. But the CHART auto-scales globally across ALL visible snapshots. The ring buffer holds 256 snapshots, so the Y range is set by the absolute min and max ever seen in those 256 frames. This means small frame-to-frame variation gets amplified against a wide Y range.

2. **Snapshot pre-allocation issue**: `FieldStatsAccumulator` pre-allocates 256 snapshot objects (line 108-117). When the ring buffer wraps, old snapshots get overwritten. But the chart reads ALL 256 slots regardless — including potentially stale pre-allocated zeros from the initial creation. Check: are zero-filled initial snapshots being read as valid data?
   - Look at `FieldStatsAccumulator.ts:108-117` — snapshots are initialized with `count: 0`
   - Look at `FieldBandChart.tsx:77` — it skips `snap.count === 0`, so this should be fine
   - BUT: the chart still tries to plot `sampleCount` entries. If `filled=false` and `writeIndex=50`, it reads 50 snapshots. Once `filled=true`, it reads all 256. The transition from 50→256 could create a visual spike.

3. **Per-frame sort instability**: The percentile computation uses `Float32Array.sort()` which is not guaranteed stable for equal elements. If many lanes have the same value, p25/p75 could jitter between adjacent indices. This could cause micro-spikes in the IQR band.

4. **Actual data variation**: The min/max bands SHOULD track the actual per-frame extremes. If the data genuinely varies frame-to-frame (e.g., animation), this is expected. But the user says it's "uniform across every port" which suggests it's a rendering/data artifact, not real variation.

**Recommended fix approach**:
- **Reduce visible window**: Instead of showing all 256 frames, show only the most recent N frames (e.g., 64 = ~1s). The chart already has the ring buffer; just limit `sampleCount` to `Math.min(sampleCount, visibleWindow)` and adjust `startIdx` accordingly.
- **Add smoothing**: Apply a simple 3-point moving average to the min/max/mean/p25/p75 values before rendering. This removes frame-to-frame noise while preserving trends.
- **Or**: Switch to rendering at a lower temporal resolution (skip every other frame, average pairs, etc.)

### Issue 2: Chart Overflow / Compression

**Screenshot evidence**: Second screenshot shows the FieldBandChart compressed to a solid teal block after running for a while. Also shows content being clipped at the bottom of the debug panel.

**Root causes**:

1. **Container maxHeight too small**: `debugMiniViewStyles.container` has `maxHeight: '220px'` and `overflow: 'hidden'` (`DebugMiniView.tsx:37-38`). The new FieldValueSection adds more content (renderer + band chart + count), which exceeds 220px. Fix: increase `maxHeight` to ~320px, or add `overflow-y: auto` for scrolling.

2. **256 data points in 280px width**: Each frame gets <1.1 pixel. At 60fps this fills in ~4.3 seconds. After that, every frame overwrites old data and the chart just shows the full temporal range compressed into 280px. Fix: reduce the visible window to 64-128 frames (1-2 seconds), not the full ring buffer capacity.

**File to modify**: `DebugMiniView.tsx:37-38` (container styles)
**File to modify**: `FieldBandChart.tsx` (limit visible sample count)

### Issue 3: Color Renderer Not Triggering

**Key code path**: `FieldValueSection` at `DebugMiniView.tsx:248`:
```typescript
const isColor = meta.type.payload.kind === 'color';
```

**Possible causes**:

1. **Port type is not resolved to `color`**: The `meta.type` comes from `EdgeMetadata` which is set by the compiler's debug index. If the compiler resolves the port type as something other than `{ kind: 'color' }` (e.g., still a payload variable, or a vec4 that represents color but isn't the `color` payload kind), the check fails.

2. **The edge is a signal, not a field**: `FieldValueSection` is only rendered when `data.meta.cardinality === 'field'`. If the color edge is signal cardinality, it goes through `SignalValueSection` instead, which uses the `ValueRenderer` registry. The `color` renderer IS registered there, but `SignalValueSection` creates a scalar sample `{ type: 'scalar', components: new Float32Array([value.value]), stride: 1 }` — this only passes 1 component, but color has stride 4. The color renderer's scalar path falls through to `genericNumericRenderer`.

3. **Debug investigation needed**: To diagnose, the agent should:
   - Load a patch with known color field edges
   - Check what `meta.type.payload.kind` resolves to for those edges
   - Add `console.log` in `FieldValueSection` to verify the code path
   - Check if the issue is on signal-cardinality color edges (which would need multi-component signal history — a known gap)

### Issue 4: Missing Renderers

**Current renderer coverage** (from `register.ts`):

| Payload | Registered? | Key | Renderer |
|---------|-------------|-----|----------|
| float | Yes | `float` | FloatValueRenderer |
| int | No | falls to `category:numeric` | GenericNumericRenderer |
| bool | Yes | `bool` | BoolEventValueRenderer |
| vec2 | Yes | `vec2` | Vec2ValueRenderer |
| **vec3** | **No** | falls to `category:numeric` | GenericNumericRenderer |
| **vec4** | **No** | falls to `category:numeric` | GenericNumericRenderer |
| color | Yes | `color` | ColorValueRenderer |
| cameraProjection | No | falls to `category:numeric` | GenericNumericRenderer |

**GenericNumericRenderer** (`GenericNumericRenderer.tsx`) shows all components as formatted floats. Works but provides no spatial/semantic visualization.

**Recommended new renderers**:

1. **Vec3ValueRenderer** — Priority: HIGH (most common multi-component type after vec2)
   - Scalar mode: show `(x, y, z)` formatted + magnitude
   - Aggregate mode: per-component min/mean/max rows + avg magnitude
   - Optional: simple 3D arrow or axis-aligned bar chart
   - Model after `Vec2ValueRenderer.tsx` which already exists

2. **Vec4ValueRenderer** — Priority: MEDIUM
   - Same pattern as Vec3 but with 4 components (x, y, z, w)
   - Aggregate mode: per-component stats

3. **IntValueRenderer** — Priority: LOW (int fields are rare in Oscilla)
   - Integer formatting (no decimal places)
   - Aggregate: integer min/max/mean (round mean)

4. **cameraProjection** — Priority: VERY LOW (single value, rare)
   - Can stay as GenericNumericRenderer fallback

**Implementation pattern**: See `src/ui/debug-viz/renderers/Vec2ValueRenderer.tsx` for the established pattern. New renderers need:
1. Create `src/ui/debug-viz/renderers/Vec3ValueRenderer.tsx`
2. Register in `src/ui/debug-viz/renderers/register.ts`
3. Add test in `src/ui/debug-viz/renderers/Vec3ValueRenderer.test.tsx`

---

## Key Files

### Core Data Flow
- `src/ui/debug-viz/FieldStatsAccumulator.ts` — Accumulator class (ring buffer, EMA, all-time stats)
- `src/services/DebugService.ts` — Service layer (trackField, updateFieldValue, queryFieldValue)
- `src/ui/debug-viz/useDebugMiniView.ts` — React hook that resolves MiniViewData including fieldHistory

### Visualization Components
- `src/ui/debug-viz/DebugMiniView.tsx` — Main component + `FieldValueSection` + container styles
- `src/ui/debug-viz/charts/FieldBandChart.tsx` — Temporal distribution canvas chart
- `src/ui/debug-viz/charts/ColorPalette.tsx` — Sorted color strip canvas
- `src/ui/debug-viz/charts/Sparkline.tsx` — Signal history line chart (reference for patterns)

### Renderer Registry
- `src/ui/debug-viz/ValueRenderer.ts` — 3-tier fallback registry
- `src/ui/debug-viz/renderers/register.ts` — All registrations happen here
- `src/ui/debug-viz/renderers/Vec2ValueRenderer.tsx` — Reference for new vec3/vec4 renderers
- `src/ui/debug-viz/renderers/ColorValueRenderer.tsx` — Color renderer (recently simplified)
- `src/ui/debug-viz/renderers/GenericNumericRenderer.tsx` — Fallback for unregistered types

### Tests
- `src/services/DebugService.test.ts` — 38 tests including accumulator integration
- `src/ui/debug-viz/FieldStatsAccumulator.test.ts` — 10 unit tests
- `src/ui/debug-viz/DebugMiniView.test.tsx` — 11 component tests
- `src/ui/debug-viz/renderers/ColorValueRenderer.test.tsx` — 11 tests (updated this session)

### Existing Plans
- `.agent_planning/debug-viz/SPRINT-20260122-future-renderers-PLAN.md` — Original plan for additional renderers

---

## Acceptance Criteria

- [ ] FieldBandChart is not spiky — shows smooth bands representing actual data distribution
- [ ] FieldBandChart shows a reasonable time window (~1-2s) not the full 256-frame buffer
- [ ] Debug panel container does not clip content — all elements visible
- [ ] Color field edges show the ColorPalette visualization (debug: identify which edges are failing)
- [ ] vec3 payload type has a dedicated renderer with per-component display
- [ ] vec4 payload type has a dedicated renderer with per-component display
- [ ] All existing tests continue to pass
- [ ] Visual validation: load golden-spiral.hcl, hover field edges, verify charts look reasonable

---

## Recommended Implementation Order

1. **Fix spiky charts + window size** (FieldBandChart.tsx + FieldStatsAccumulator.ts)
   - Limit visible window to 64 frames
   - Add 3-point moving average smoothing
   - This is the highest-impact visual fix

2. **Fix container overflow** (DebugMiniView.tsx)
   - Increase maxHeight to ~320px or use `overflow-y: auto`
   - Quick fix, high impact

3. **Debug color renderer issue** (investigation)
   - Add console.log to FieldValueSection to trace meta.type.payload.kind
   - Determine if issue is signal-cardinality color edges vs type resolution
   - Fix accordingly

4. **Add Vec3ValueRenderer** (new file + register)
   - Model after Vec2ValueRenderer
   - Show (x,y,z) + magnitude for scalar, per-component stats for aggregate

5. **Add Vec4ValueRenderer** (new file + register)
   - Same pattern as Vec3

---

## Testing Strategy

### Existing Tests (must continue passing)
- `npx vitest run src/services/DebugService.test.ts` — 38 tests
- `npx vitest run src/ui/debug-viz/` — 155 tests across 12 files

### Visual Testing
- `npm run dev` → load golden-spiral.hcl → hover field edges → verify:
  - Band chart shows smooth distribution over ~1s window
  - Color fields show palette strip
  - No content clipping in debug panel
  - Vec3 edges show per-component display

### New Tests Needed
- Vec3ValueRenderer: scalar + aggregate + inline modes
- Vec4ValueRenderer: same
- FieldBandChart visible window limiting test (optional — visual component)

---

## Next Steps for Agent

**Immediate actions**:
1. Read this handoff document
2. Fix FieldBandChart spikiness: limit visible window + add smoothing
3. Fix container maxHeight overflow
4. Investigate color renderer issue
5. Create Vec3ValueRenderer + Vec4ValueRenderer
