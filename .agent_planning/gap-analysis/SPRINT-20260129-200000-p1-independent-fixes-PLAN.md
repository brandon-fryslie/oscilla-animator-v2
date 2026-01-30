# Sprint: p1-independent-fixes — All P1 Items (No Dependencies)
Generated: 2026-01-29T20:00:00Z
Confidence: HIGH: 13, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Complete all 13 P1 gap analysis items that have no dependencies. These are independent fixes that can be done in any order.

## Scope
**Deliverables:**
- Fix 6 broken canonical type tests (stale discriminants)
- Fix DEFAULTS_V0 perspective/branch types
- Wire constValueMatchesPayload() into IR builder
- Fix payloadStride() return type and values
- Delete AxisTag alias
- Remove stride field from ConcretePayloadType
- Remove shape from PayloadType (reclassify as resource)
- Change cameraProjection ConstValue to closed enum
- Add tryDeriveKind() helper
- Lock eventRead output type in builder
- Rename AxisViolation fields to nodeKind + nodeIndex
- Add deriveKind agreement asserts at boundaries
- Add CI forbidden-pattern Vitest test

## Work Items

### P0-1: Fix 6 broken canonical type tests (#1 / T03-C-5)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] All assertions in `canonical-types.test.ts` use `'inst'` instead of `'instantiated'` or `'default'` for axis `.kind`
- [ ] `npx vitest run src/core/__tests__/canonical-types.test.ts` — all gap-analysis-related tests pass
- [ ] Tests failing from unrelated causes (e.g., unitVar) commented out with TODO

**Technical Notes:**
- File: `src/core/__tests__/canonical-types.test.ts` lines 190, 290-291, 328-329, 353, 359, 365, 367, 382, 388, 404
- Replace `'instantiated'` → `'inst'`, `'default'` (when checking axis.kind) → `'inst'`
- Line 190: `canonicalType(FLOAT).extent.cardinality.kind` should expect `'inst'`

### P0-2: Fix DEFAULTS_V0 perspective/branch (#2 / T03-C-3)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] `DEFAULTS_V0.perspective` is `{ kind: 'default' }` typed as `PerspectiveValue`
- [ ] `DEFAULTS_V0.branch` is `{ kind: 'default' }` typed as `BranchValue`
- [ ] Tests updated to assert new values
- [ ] Consumers compile without error

**Technical Notes:**
- File: `src/core/canonical-types.ts` lines 890-905
- Consumers: `src/ui/reactFlowEditor/typeValidation.ts:78-79,110-111,199-202`, `src/compiler/frontend/analyze-type-graph.ts:56-59,183-186`
- Most consumers only use cardinality/temporality from DEFAULTS_V0, so impact should be limited

### P0-3: Wire constValueMatchesPayload (#3 / T03-C-4)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] `IRBuilderImpl.sigConst()` calls `constValueMatchesPayload()` and throws on mismatch
- [ ] `IRBuilderImpl.fieldConst()` calls `constValueMatchesPayload()` and throws on mismatch
- [ ] Test: constructing a const with mismatched payload/value throws

**Technical Notes:**
- `constValueMatchesPayload()` defined at `src/core/canonical-types.ts:315-320`
- Wire into `src/compiler/ir/IRBuilderImpl.ts:118` (sigConst) and `:282` (fieldConst)

### P0-4: Fix payloadStride() return type and values (#4 / T02-C-4)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] Return type is `number` (not `1|2|3|4`)
- [ ] Explicit case for every PayloadType kind (no default fall-through)
- [ ] shape returns 8 (if still present), cameraProjection returns 1 (closed enum)
- [ ] Exhaustive switch with never check

**Technical Notes:**
- File: `src/core/canonical-types.ts:815-826`
- Current: returns `1|2|3|4`, shape and cameraProjection fall through to default returning 1

### P0-5: Delete AxisTag alias (#5 / Q1)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] `AxisTag<T>` removed from `src/compiler/ir/bridges.ts`
- [ ] All usages replaced with `Axis<T, never>` or appropriate alternative
- [ ] `grep -r 'AxisTag' src/` returns 0 results

**Technical Notes:**
- Defined at `src/compiler/ir/bridges.ts:36`
- May have usages in bridges.ts itself — replace with direct Axis usage

### P0-6: Remove stride field from ConcretePayloadType (#6 / Q7)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] No `stride` field on any ConcretePayloadType variant
- [ ] `strideOf()` either deleted or delegates to `payloadStride()`
- [ ] `payloadStride()` is the single authority for stride
- [ ] All consumers of `.stride` updated to call `payloadStride()`

**Technical Notes:**
- File: `src/core/canonical-types.ts:163-171` (ConcretePayloadType variants all have `readonly stride: N`)
- `strideOf()` at `:382-389` reads `.stride` from object
- `payloadStride()` at `:815-826` uses switch on kind
- After removal, only `payloadStride()` path exists

### P0-7: Remove shape from PayloadType (#7 / Q6)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] No `{ kind: 'shape' }` variant in PayloadType/ConcretePayloadType
- [ ] SHAPE constant removed
- [ ] Consumers updated (shape data modeled differently — comment with TODO for resource graph)
- [ ] `payloadStride()` no longer needs shape case

**Technical Notes:**
- `src/core/canonical-types.ts:170` — SHAPE constant
- `src/blocks/render-blocks.ts` uses SHAPE for render block ports — replace with TODO/comment
- Per resolution Q6: "shape is a resource, not a payload"

### P0-8: cameraProjection to closed enum (#8 / Q8)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] `CameraProjection` type defined as `'orthographic' | 'perspective'` (or similar closed union)
- [ ] ConstValue cameraProjection variant uses `value: CameraProjection`
- [ ] `cameraProjectionConst()` accepts `CameraProjection` not `string`
- [ ] payloadStride for cameraProjection returns 1

**Technical Notes:**
- File: `src/core/canonical-types.ts:298` (ConstValue), `:369-371` (constructor)
- Per resolution Q8: closed enum, not matrix

### P0-9: Add tryDeriveKind() (#9 / Q3)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] `tryDeriveKind(t: CanonicalType): DerivedKind | null` exported from canonical-types.ts
- [ ] Returns null when any axis is var
- [ ] Returns same result as `deriveKind()` when all axes are inst
- [ ] Unit test covers var-axis case and all inst cases

**Technical Notes:**
- Add near `deriveKind()` at `src/core/canonical-types.ts:696-715`
- Rule: UI/inference paths use tryDeriveKind; backend paths use strict deriveKind

### P0-10: Lock eventRead output type (#10 / Q10)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] `sigEventRead` in IRBuilderImpl no longer accepts caller-provided `type` parameter
- [ ] Builder internally sets type to `canonicalSignal({ kind: 'float' }, { kind: 'scalar' })`
- [ ] All callers updated (no longer pass type)

**Technical Notes:**
- File: `src/compiler/ir/IRBuilderImpl.ts:869`
- Per resolution Q10: eventRead always produces signal float scalar (0/1)

### P0-11: Rename AxisViolation fields (#11 / Q11)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] `AxisViolation` has `nodeKind` and `nodeIndex` fields (not `typeIndex`)
- [ ] All consumers updated

**Technical Notes:**
- File: `src/compiler/frontend/axis-validate.ts:26-30`
- Per resolution Q11: `AxisViolation { nodeKind: 'ValueExpr' | 'CanonicalType' | ...; nodeIndex: number; message: string }`

### P0-12: Add deriveKind agreement asserts (#12 / Q4/Q5)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] At lowering boundary: assert `tag === deriveKind(v.type)` when variant has `.type`
- [ ] At debug service boundary: same assert
- [ ] Tests verify assert fires on mismatch

**Technical Notes:**
- Per resolution Q4/Q5: discriminant tags allowed for TS narrowing, but must agree with deriveKind when .type exists
- Add asserts in lowering output construction and debug service entry points

### P0-13: CI forbidden-pattern test (#13 / Q13)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] Vitest test file exists that greps for forbidden patterns
- [ ] Fails if: `AxisTag<` found anywhere, `payload: { kind: 'var'` outside inference modules, legacy type names in backend
- [ ] Small allowlist for migration directories
- [ ] Test passes on current codebase (after other Sprint 1 fixes)

**Technical Notes:**
- Per resolution Q13: grep-based enforcement
- Patterns: AxisTag, payload var outside inference, UnitType var, legacy SignalType/ResolvedPortType, instanceId on FieldExpr/ValueExpr

## Dependencies
- None — all items are independent

## Risks
- Shape removal (#7) may break render blocks. If so, comment out affected code with TODO for resource graph system.
- Tests failing from causes outside gap analysis scope: comment out with TODO, do not fix.
