# Sprint: renderers-charts - ValueRenderer Registry + Chart Primitives

Generated: 2026-01-22
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Build the ValueRenderer registry with fallback ladder, implement float and color renderers, and create the Sparkline and DistributionBar chart primitives.

## Scope

**Deliverables:**
1. ValueRenderer interface + registry with fallback ladder
2. GenericNumericValueRenderer (category fallback)
3. FloatValueRenderer (unit-aware formatting)
4. ColorValueRenderer (swatch + channel stats)
5. Sparkline canvas component
6. DistributionBar component
7. WarmupIndicator component

## Work Items

### P0: ValueRenderer Registry

**File:** `src/ui/debug-viz/ValueRenderer.ts`

**Acceptance Criteria:**
- [ ] `ValueRenderer` interface: `renderFull(sample: RendererSample): React.ReactElement` and `renderInline(sample: RendererSample): React.ReactElement`
- [ ] `getValueRenderer(type: SignalType): ValueRenderer` — implements 3-tier fallback: exact(payload+unit) → payload-only → category
- [ ] `registerRenderer(key: string, renderer: ValueRenderer)` — module-level registration
- [ ] Lookup uses `type.payload` and `type.unit?.kind` directly (no resolveUnit, no resolveExtent)
- [ ] Category fallbacks map: `{ numeric: genericNumericRenderer, color: colorRenderer, shape: genericRenderer }`
- [ ] Payload-to-category mapping is explicit and exhaustive
- [ ] Tests: fallback ladder resolves correctly for each tier
- [ ] Tests: unknown payload+unit falls through to category

**Technical Notes:**
- Registry is module-level Map (not class, not provider)
- Registration happens at import time via side-effect calls
- Category mapping: float→numeric, int→numeric, vec2→numeric, color→color, shape→shape, bool→numeric

### P1: GenericNumericValueRenderer

**File:** `src/ui/debug-viz/renderers/GenericNumericRenderer.tsx`

**Acceptance Criteria:**
- [ ] Handles both scalar and aggregate RendererSample modes
- [ ] Scalar: displays all components (up to stride) as formatted numbers
- [ ] Aggregate: displays per-component min/max/mean
- [ ] Uses monospace font, muted styling
- [ ] Inline mode: compact single-line representation
- [ ] Handles NaN/Inf gracefully (red badge, not crash)

### P2: FloatValueRenderer

**File:** `src/ui/debug-viz/renderers/FloatValueRenderer.tsx`

**Acceptance Criteria:**
- [ ] Scalar mode: large formatted value using formatFloat rules
- [ ] formatFloat: 4 sig digits for [0.001, 9999], compact scientific outside, exact 0 as "0.000"
- [ ] NaN shown as red "NaN" badge, Inf as red "Inf" badge
- [ ] Unit-aware decorations (metadata only, not value modification):
  - `unit.kind === 'norm01'`: show range indicator, warn badge if value < 0 or > 1
  - `unit.kind === 'phase01'`: show "phase" label (NO wrap glyph — that's Sparkline's job)
  - `unit.kind === 'scalar'`: no range indicator
  - All other units: show unit label, no range indicator
- [ ] Aggregate mode: min/max/mean row with formatFloat, count badge
- [ ] Inline mode: `formatFloat(components[0])` for scalar, `formatFloat(mean[0]) (n=count)` for aggregate
- [ ] Tests: formatting edge cases (very small, very large, NaN, Inf, negative zero)
- [ ] Tests: unit-specific decorations appear only for correct units

**Technical Notes:**
- This renderer handles ALL float variants (scalar, phase, normalized, ms, etc.)
- Future: register `float:phase` as a separate exact-match renderer if phase needs significantly different display
- No access to history — rendering current value only

### P3: ColorValueRenderer

**File:** `src/ui/debug-viz/renderers/ColorValueRenderer.tsx`

**Acceptance Criteria:**
- [ ] Aggregate mode (primary path): large average color swatch (32x32px), per-channel R/G/B/A range bars, hex representation of mean, count badge
- [ ] ColorSwatch component: div with rgba background, border for visibility, checkerboard pattern for alpha
- [ ] Per-channel range bars: horizontal bars showing min→max per channel, colored by channel (R=red, G=green, B=blue, A=gray)
- [ ] Hex display: `#RRGGBB` from mean[0..2] * 255, `(α=X.XX)` from mean[3]
- [ ] Scalar mode: falls through to GenericNumericRenderer (color signals not emitted by SampleSource in v1)
- [ ] Inline mode: small ColorSwatch (14x14px) for aggregate, generic for scalar
- [ ] Tests: color swatch renders correct rgba from Float32Array components
- [ ] Tests: hex conversion correct for edge values (0.0, 1.0, 0.5)
- [ ] Tests: alpha checkerboard pattern visible

**Technical Notes:**
- All color values are float RGBA [0,1] (canonical encoding locked by architect)
- No u8 conversion at renderer level — CSS rgba() accepts 0-255, so multiply at render time only
- Alpha checkerboard: use CSS linear-gradient or background-image pattern

### P4: Sparkline Canvas Component

**File:** `src/ui/debug-viz/charts/Sparkline.tsx`

**Acceptance Criteria:**
- [ ] Props: `history: HistoryView`, `width: number`, `height: number`, `unit?: NumericUnit`
- [ ] Reads `filled` samples from ring buffer using safe modulo, plots oldest→newest (left→right)
- [ ] Auto-scale: min/max from visible samples, maps to full height
- [ ] Flat-line handling: if `max - min < epsilon` (1e-10), render centered horizontal line at 50% height
- [ ] NaN/Inf handling: show red "invalid" badge overlay, skip invalid samples (gap in line path)
- [ ] Phase wrap markers (only when `unit?.kind === 'phase01'`): small vertical dotted line where `prev > 0.9 && curr < 0.1` or vice versa
- [ ] Scale markers: min/max values as tiny labels (9px monospace, muted color) at top-right/bottom-right
- [ ] Uses `<canvas>` element with 2x DPR for retina
- [ ] Renders via requestAnimationFrame or direct canvas 2D context (not React re-render per frame)
- [ ] Performance: O(capacity=128) per draw — trivial
- [ ] Tests: auto-scale produces correct Y mapping
- [ ] Tests: wrap markers only appear for phase unit
- [ ] Tests: flat-line doesn't produce division-by-zero or invisible line
- [ ] Tests: empty history (filled=0) renders blank canvas

**Technical Notes:**
- Canvas context: strokeStyle for line, fillStyle for wrap markers
- Line width: 1.5px (DPR-adjusted)
- Color scheme: match existing debug panel (teal/cyan for line, red for invalid, muted for scale)
- No React state for canvas — use useRef + useEffect for imperative drawing

### P5: DistributionBar

**File:** `src/ui/debug-viz/charts/DistributionBar.tsx`

**Acceptance Criteria:**
- [ ] Props: `stats: AggregateStats`, `width: number`, `height: number` (default ~12px)
- [ ] Horizontal bar: full width represents min→max range
- [ ] Solid fill between min and max (semi-transparent fill color)
- [ ] Mean tick: vertical line at proportional position within bar
- [ ] Min label left, max label right (tiny monospace, 9px)
- [ ] Handles degenerate cases: min=max → centered tick, count=0 → "no data" text
- [ ] Uses stride-aware access: reads stats.min[0], stats.max[0], stats.mean[0] for stride=1
- [ ] Tests: mean tick positioned correctly for known values
- [ ] Tests: degenerate min=max doesn't crash

**Technical Notes:**
- Simple div-based layout (no canvas needed for a bar)
- Future: extend to per-component bars for stride > 1 (color channels)

### P6: WarmupIndicator

**File:** `src/ui/debug-viz/charts/WarmupIndicator.tsx`

**Acceptance Criteria:**
- [ ] Props: `filled: number`, `capacity: number`
- [ ] Shows `history: ${filled}/${capacity}` text when `filled < capacity`
- [ ] Returns null when `filled >= capacity` (fully warmed up)
- [ ] Muted styling, small font (11px)
- [ ] Tests: shows text when filled < capacity, null when filled >= capacity

## Dependencies

- Sprint 1 (core-types-history) must be complete: types.ts, HistoryService, DebugService integration
- React (JSX components)
- Canvas API (for Sparkline)

## Risks

| Risk | Mitigation |
|------|-----------|
| Canvas rendering in test environment | Use vitest-canvas or mock canvas context in tests |
| Color swatch not visible on dark/light backgrounds | Border + checkerboard pattern handles both |
| formatFloat precision differences across environments | Use explicit toFixed/toPrecision, not locale-dependent |
