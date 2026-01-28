# Sprint: port-types - Complete Cardinality Polymorphism

**Generated:** 2026-01-25T16:00:00 (Final - spec aligned)
**Confidence:** HIGH: 4, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION

**Spec Reference:** `design-docs/Polymorphic-Cardinality-Spec.md`

## Sprint Goal

Complete the port type updates for cardinality-generic blocks following the canonical spec, enabling blocks to accept both signals and fields.

## Blocks Classification Per Spec

### PRESERVE (§6.1 + Example A) — Semantically elementwise, no intrinsic dependency:
- GoldenAngle (computes angle from id01 - scalar makes sense)
- AngularOffset (computes offset from phase/spin - scalar makes sense)
- Pulse (computes pulse value - scalar makes sense)
- RadiusSqrt (computes radius * sqrt(id01) - scalar makes sense)
- HueFromPhase (scalar makes sense)
- Jitter2D (scalar makes sense)
- SetZ (sets z component - scalar makes sense)
- FieldPolarToCartesian (coordinate transform - scalar makes sense)
- FieldCartesianToPolar (coordinate transform - scalar makes sense)
- Sin, Cos, Mod (already preserve with dual-path lower)

### FIELDONLY (§6.2) — Requires instance intrinsics:
- **FromDomainId** — uses `fieldIntrinsic(instance, 'normalizedIndex')`, outputs are inherently fields
- **StableIdHash** — uses `fieldIntrinsic(instance, 'randomId')` and `fieldIntrinsic(instance, 'normalizedIndex')`
- **DomainIndex** — uses `fieldIntrinsic(instance, 'normalizedIndex')` and `fieldIntrinsic(instance, 'index')`

## Work Items

### P0: Revert FromDomainId to fieldOnly [HIGH]

The uncommitted changes incorrectly made FromDomainId preserve. Per spec §6.2:
> "FromDomainId is inherently field-producing because it derives per-element IDs."

**Acceptance Criteria:**
- [ ] FromDomainId has `cardinalityMode: 'fieldOnly'`
- [ ] FromDomainId has `broadcastPolicy: 'disallowSignalMix'`
- [ ] FromDomainId output uses `signalTypeField('float', 'default')` (not canonicalType)

### P1: Complete port types for PRESERVE blocks [HIGH]

**Per spec §6.3:** "Main I/O ports must use canonicalType(...) rather than signalTypeField(...)."

| Block | Ports to Update | Current Status |
|-------|-----------------|----------------|
| GoldenAngle | id01, angle | ✅ Already updated |
| AngularOffset | id01, offset | ✅ Already updated |
| Pulse | id01, value | ❌ Still signalTypeField |
| RadiusSqrt | id01, radius, out | ❌ Still signalTypeField |
| Jitter2D | pos, rand, out | ❌ Still signalTypeField |
| HueFromPhase | id01, hue | ❌ Still signalTypeField |
| SetZ | pos, z, out | ❌ Still signalTypeField |
| FieldPolarToCartesian | angle, radius, pos | ❌ Still signalTypeField |
| FieldCartesianToPolar | pos, angle, radius | ❌ Still signalTypeField |

**Acceptance Criteria:**
- [ ] All 7 blocks have main I/O ports changed to `canonicalType()`
- [ ] Control ports (phase, centerX, etc.) remain `canonicalType()` (unchanged)

### P2: Fix non-canonical lower() guards [HIGH]

Per spec §6.4:
> "Any lower() guard like `if (id01.k !== 'field') throw ...` is non-canonical for preserve blocks."

For preserve blocks, the lower() function needs dual-path dispatch (signal vs field).

**Blocks with guards to fix (9 total):**
1. GoldenAngle
2. AngularOffset
3. Pulse
4. RadiusSqrt
5. Jitter2D
6. HueFromPhase
7. SetZ
8. FieldPolarToCartesian
9. FieldCartesianToPolar

**Pattern:** Follow Sin/Cos dual-path pattern — check `input.k` and branch to appropriate IR emission.

**Acceptance Criteria:**
- [ ] All 9 blocks have lower() updated to handle both `k === 'sig'` and `k === 'field'`
- [ ] No guards that throw on signal input

### P3: Verify identity blocks stay fieldOnly [HIGH]

**Acceptance Criteria:**
- [ ] StableIdHash has `cardinalityMode: 'fieldOnly'` (no changes needed)
- [ ] DomainIndex has `cardinalityMode: 'fieldOnly'` (no changes needed)

### P4: Test and commit [HIGH]

**Acceptance Criteria:**
- [ ] `npm run typecheck` passes
- [ ] Run dev server, test GoldenAngle → Add connection compiles and renders
- [ ] Commit with message: "refactor: Make field operation blocks cardinality-polymorphic"

## Dependencies

- Pass 2 type graph fix (committed in 436f5a8) ✅

## Risks

| Risk | Mitigation |
|------|------------|
| Missing signal opcodes for complex operations | Build compound signal paths from primitives (mul, add, sin, cos, etc.) |
| Instance context missing in signal path | Signal path doesn't need instanceContext (return undefined) |
