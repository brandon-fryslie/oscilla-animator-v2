# Sprint: Port Annotations - Correct Unit Semantics on Block Ports
Generated: 2026-02-01
Updated: 2026-02-01 (ChatGPT review feedback)
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Fix 18 block port unit annotations to match the normalized-units design philosophy: hue values→phase01, saturation/lightness/alpha→norm01, smoothing→norm01, normalizedIndex→norm01. Keep hue shift as scalar (signed offset).

## Scope
**Deliverables:**
- Correct all color block h/s/l/a port units
- Correct lag smoothing and array t port units
- Standardize CircleLayoutUV to use unitPhase01() helper
- Verify no test or compilation regressions

## Work Items

### P0: Fix color block hue VALUE ports to unitPhase01()
**Acceptance Criteria:**
- [ ] `make-color-hsl.ts` hue input uses `unitPhase01()`
- [ ] `split-color-hsl.ts` hue output uses `unitPhase01()`
- [ ] `color-picker.ts` hue port uses `unitPhase01()`
- [ ] `hue-shift.ts` shift port STAYS as `unitScalar()` (signed offset, not cyclic value)

**Technical Notes:**
- Hue *values* are cyclic [0,1) with wrap semantics → phase01
- Hue *shift* is a signed offset (can be negative for "shift left on color wheel") → stays scalar
- The blocks already wrap hue values internally (Wrap01 opcode), so runtime behavior is unchanged
- Adapter auto-insertion may now trigger for edges from scalar→phase01 (desired behavior)

### P1: Fix color block s/l/a ports to unitNorm01()
**Acceptance Criteria:**
- [ ] `make-color-hsl.ts` s, l, a inputs use `unitNorm01()`
- [ ] `split-color-hsl.ts` s, l, a outputs use `unitNorm01()`
- [ ] `color-picker.ts` s, l, a ports use `unitNorm01()`
- [ ] `alpha-multiply.ts` alpha input uses `unitNorm01()`
- [ ] `field-const-color.ts` r, g, b, a inputs use `unitNorm01()`

**Technical Notes:**
- All are clamped [0,1] values — norm01 semantics
- field-const-color currently uses `canonicalType(FLOAT)` with no unit at all (defaults to scalar)
- Runtime behavior unchanged (clamping already happens in kernel)

### P2: Fix other norm01 ports
**Acceptance Criteria:**
- [ ] `lag.ts` smoothing input uses `unitNorm01()`
- [ ] `array.ts` t output uses `unitNorm01()` (currently unitScalar)
- [ ] `circle-layout-uv.ts` uses `unitPhase01()` helper instead of raw literal
- [ ] All tests pass: `npm run test`
- [ ] Type check passes: `npm run typecheck`

**Technical Notes:**
- Lag smoothing is a lerp weight [0,1] — definitively norm01
- Array t is documented as "T (0-1)" — explicitly normalized index

## Dependencies
- None (standalone changes)

## Risks
- Changing unit annotations could cause adapter auto-insertion where none existed before (scalar→norm01 edges). This is **correct behavior** — it means the system now enforces unit semantics. But it could cause new compilation diagnostics on user graphs.
- Mitigation: The existing `Adapter_ScalarToNorm01Clamp` adapter handles scalar→norm01 conversion already.
