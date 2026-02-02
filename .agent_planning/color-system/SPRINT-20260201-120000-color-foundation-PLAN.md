# Sprint: color-foundation - Color Type System Foundation
Generated: 2026-02-01
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Add HSL unit to the type system, implement HSL→RGB conversion, and fix the broken FieldConstColor block.

## Scope
**Deliverables:**
- HSL unit variant in UnitType
- HSL→RGB conversion (either opcode or multi-step lowering)
- Fixed FieldConstColor block using `construct` intrinsic

## Work Items

### P0: Add HSL unit to UnitType
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] `UnitType` union includes `{ kind: 'color'; unit: 'rgba01' | 'hsl' }`
- [ ] `unitHsl()` constructor exists and returns `{ kind: 'color', unit: 'hsl' }`
- [ ] `unitsEqual()` already handles this correctly (it compares `.unit` field — verify with test)
- [ ] `isTypeCompatible` rejects `color+hsl` wired to `color+rgba01` (existing exact-match behavior)

**Technical Notes:**
- File: `src/core/canonical-types/units.ts`
- Change line 22 from `readonly unit: 'rgba01'` to `readonly unit: 'rgba01' | 'hsl'`
- Add `unitHsl()` constructor function
- `unitsEqual` already compares `.unit` field for `kind: 'color'` — no change needed
- Check `defaultUnitForPayload()` if it exists — should default to `rgba01` for color

### P1: Implement HSL→RGB conversion
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] HSL→RGB conversion produces correct float RGBA output for standard test vectors
- [ ] Conversion handles edge cases: s=0 (achromatic), h at boundaries (0, 1/3, 2/3)
- [ ] Unit tests verify conversion correctness with known HSL→RGB pairs

**Technical Notes:**
- **Recommended approach**: Lower HSL→RGB entirely into existing opcodes (no new runtime support needed)
- The algorithm from the spec uses: conditionals (ternary via clamp/step tricks), mul, add, sub
- This is complex but keeps the runtime simple — all math is component-wise opcodes
- Alternative: Add an `HslToRgb` opcode to OpcodeInterpreter — simpler lowering, one new runtime operation
- The block `HslToRgba` will call this; it doesn't need to be a standalone utility yet
- Implement as a helper function in the HslToRgba block's lowering code

### P2: Fix FieldConstColor block
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] FieldConstColor no longer throws "kernel removed" error
- [ ] Block uses `ctx.b.construct([r, g, b, a], colorType)` to build color output
- [ ] Block compiles and produces correct color field values
- [ ] Unit test verifies FieldConstColor compilation succeeds

**Technical Notes:**
- File: `src/blocks/field/field-const-color.ts`
- Replace the `throw new Error(...)` with `ctx.b.construct(...)` call
- The `construct` intrinsic already exists and handles stride-4 payloads
- Keep the existing input signal resolution (r, g, b, a from inputs or defaults)
- Consider updating unit from `scalar` to `rgba01` on the output type

## Dependencies
- P1 depends on P0 (HSL unit must exist for HslToRgba block types)
- P2 is independent of P0/P1

## Risks
- HSL→RGB lowering into existing opcodes is verbose but well-understood math. No unknowns.
