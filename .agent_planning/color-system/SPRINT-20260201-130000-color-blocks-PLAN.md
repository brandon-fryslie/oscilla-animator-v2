# Sprint: color-blocks - Color Block Suite
Generated: 2026-02-01
Confidence: HIGH: 6, MEDIUM: 1, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Implement all 7 color blocks from the design spec, providing a complete HSL color workflow.

## Scope
**Deliverables:**
- 6 new color blocks: ColorPicker, MakeColorHSL, SplitColorHSL, HueShift, MixColor, AlphaMultiply
- 1 adapter block: HslToRgba
- Tests for all blocks

## Work Items

### P0: ColorPicker (source block)
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] Block outputs `color` payload with unit `hsl`
- [ ] Parameters h, s, l, a are UI-controlled (not graph inputs)
- [ ] Output is a ConstValue color with h wrapped, s/l/a clamped
- [ ] Optional convenience outputs (h, s, l, a as individual floats) — extract from color

**Technical Notes:**
- Simplest block: emits a constant color from UI parameters
- Lower: `construct([wrap01(h), clamp01(s), clamp01(l), clamp01(a)], colorHslType)`
- Parameters stored as block instance data, not as input ports
- File: `src/blocks/color/color-picker.ts` (new file)

### P1: MakeColorHSL (pack block)
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] Takes 4 float inputs (h, s, l, a), outputs color+hsl
- [ ] h is wrapped via Wrap01, s/l/a are clamped via Clamp(x,0,1)
- [ ] Cardinality-polymorphic (signal or field)
- [ ] a defaults to 1.0 if not connected

**Technical Notes:**
- This is the **enforcement point** for color validity per spec
- Lower: wrap h, clamp s/l/a, then `construct([h', s', l', a'], colorHslType)`
- File: `src/blocks/color/make-color-hsl.ts` (new file)

### P2: SplitColorHSL (unpack block)
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] Takes color+hsl input, outputs 4 float channels (h, s, l, a)
- [ ] Uses `extract(color, 0..3)` intrinsic
- [ ] No additional clamping/wrapping (assumes upstream enforced)

**Technical Notes:**
- Inverse of MakeColorHSL
- Lower: 4x `extract(input, i, floatType)` for i in 0..3
- File: `src/blocks/color/split-color-hsl.ts` (new file)

### P3: HueShift
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] Takes color+hsl and float shift, outputs color+hsl
- [ ] Hue shifted by offset with wrapping: `wrap01(h + shift)`
- [ ] s/l/a pass through unchanged
- [ ] Cardinality-polymorphic

**Technical Notes:**
- Lower: extract h → add shift → wrap01 → construct with original s,l,a
- File: `src/blocks/color/hue-shift.ts` (new file)

### P4: AlphaMultiply
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] Takes color+hsl and float alpha, outputs color+hsl
- [ ] Alpha multiplied and clamped: `clamp01(a * alpha')`
- [ ] h/s/l pass through unchanged

**Technical Notes:**
- Lower: extract a → clamp01(alpha input) → mul → clamp01 → construct
- File: `src/blocks/color/alpha-multiply.ts` (new file)

### P5: MixColor (shortest-arc hue blend)
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] Takes two color+hsl inputs and float t, outputs color+hsl
- [ ] Hue uses shortest-arc interpolation (not linear lerp)
- [ ] s/l/a use standard linear lerp
- [ ] t clamped to [0,1]

**Technical Notes:**
- Shortest-arc hue: `dh = wrapSigned(bh - ah)`, `h = wrap01(ah + dh * t')`
- `wrapSigned(x) = ((x + 0.5) - floor(x + 0.5)) - 0.5`
- This requires: Sub, Add, Floor, Mul, Wrap01 — all available as opcodes
- s/l/a: `lerp(a_val, b_val, t')` — Lerp opcode exists
- File: `src/blocks/color/mix-color.ts` (new file)

### P6: HslToRgba (adapter block)
**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] Takes color+hsl input, outputs color+rgba01
- [ ] Registered as adapter block (adapterSpec) for auto-insertion
- [ ] HSL→RGB conversion is correct per test vectors from Sprint 1 DOD
- [ ] Alpha passes through unchanged

#### Unknowns to Resolve
- How to implement HSL→RGB in the IR depends on Sprint 1's decision (opcode vs lowering)
- If new opcode: block lowering is simple (single opcode call)
- If pure lowering: block lowering is verbose but uses only existing opcodes

#### Exit Criteria
- Sprint 1 P1 (HSL→RGB conversion) is complete and approach is decided

**Technical Notes:**
- This is the only unit-conversion adapter for colors
- Must have `adapterSpec` for auto-insertion between hsl→rgba01 wiring
- File: `src/blocks/color/hsl-to-rgba.ts` (new file, or `src/blocks/adapter/hsl-to-rgba.ts`)

## Dependencies
- **Depends on Sprint: color-foundation** — HSL unit must exist, HSL→RGB conversion approach must be decided
- P0-P5 can be implemented in parallel once Sprint 1 P0 (HSL unit) is done
- P6 depends on Sprint 1 P1 (HSL→RGB conversion)

## Risks
- MixColor shortest-arc hue logic is the most complex lowering — needs careful testing with edge cases (hue near 0/1 boundary, colors on opposite sides of the wheel)
- HslToRgba adapter auto-insertion: verify the adapter system handles `{ kind: 'color' }` units correctly
