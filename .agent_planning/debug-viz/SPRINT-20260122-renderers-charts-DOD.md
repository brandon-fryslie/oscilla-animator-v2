# Definition of Done: renderers-charts

## Acceptance Tests

### ValueRenderer Registry
- [ ] `getValueRenderer(canonicalType('float'))` returns FloatValueRenderer
- [ ] `getValueRenderer(canonicalType('color'))` returns ColorValueRenderer
- [ ] `getValueRenderer(canonicalType('int'))` falls through to GenericNumericRenderer (category: numeric)
- [ ] Unknown payload falls through to category fallback (never throws)

### FloatValueRenderer
- [ ] Scalar mode: formats 0.12345 as "0.1235" (4 sig digits)
- [ ] Scalar mode: formats 0.000001 as "1.000e-6" (compact scientific)
- [ ] Scalar mode: formats NaN as red badge, not "NaN" string
- [ ] Scalar mode: formats Infinity as red badge
- [ ] Unit norm01: shows warning when value > 1 or < 0
- [ ] Unit phase01: shows "phase" label, NO wrap glyph
- [ ] Unit scalar: no range indicator
- [ ] Aggregate mode: shows min/max/mean formatted with count badge
- [ ] Inline mode: compact one-line representation

### ColorValueRenderer
- [ ] Aggregate mode: renders swatch with correct rgba background
- [ ] Aggregate mode: shows per-channel range bars (R/G/B/A)
- [ ] Aggregate mode: shows hex representation (#RRGGBB + alpha)
- [ ] Swatch shows checkerboard behind for alpha visibility
- [ ] Inline mode: small swatch only
- [ ] Edge case: all-zero color renders as black swatch (not invisible)
- [ ] Edge case: alpha=0 shows checkerboard clearly

### Sparkline
- [ ] Draws 128 data points as continuous line on canvas
- [ ] Auto-scales Y axis to data min/max
- [ ] Flat-line (min≈max): renders centered horizontal line (no crash)
- [ ] Empty history (filled=0): renders blank canvas
- [ ] NaN in data: shows red badge, gaps in line
- [ ] Phase wrap markers: appear only when unit.kind === 'phase01'
- [ ] Phase wrap markers: detect history discontinuity (>0.9 → <0.1)
- [ ] Scale markers: min/max values shown at corners
- [ ] Canvas uses 2x DPR for retina

### DistributionBar
- [ ] Min→max bar fills width proportionally
- [ ] Mean tick positioned correctly between min and max
- [ ] Min label left, max label right
- [ ] min=max: shows centered tick (no crash, no division by zero)
- [ ] count=0: shows "no data" text

### WarmupIndicator
- [ ] Shows "history: N/128" when filled < 128
- [ ] Returns null (renders nothing) when filled >= 128

## Verification Commands

```bash
npx tsc --noEmit
npx vitest run src/ui/debug-viz/
```
