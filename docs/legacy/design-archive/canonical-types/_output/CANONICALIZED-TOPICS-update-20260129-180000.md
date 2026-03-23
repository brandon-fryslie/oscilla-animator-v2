---
command: /canonicalize-architecture Output directory: ./design-docs/canonical-types/_output
Input: .agent_planning/gap-analysis/RESOLUTIONS.md .agent_planning/gap-analysis/SUMMARY.md
files: RESOLUTIONS.md SUMMARY.md
indexed: true
source_files:
  - .agent_planning/gap-analysis/RESOLUTIONS.md
  - .agent_planning/gap-analysis/SUMMARY.md
topics:
  - type-system
---

# Topic Updates: Gap Analysis Integration

## Proposed New Topic

### type-system/t2_inference-types.md (Tier 2 — Structural)

**Justification**: Resolution Q2 explicitly defines inference-only type wrappers. These are not optional — they establish the boundary between inference machinery and canonical types. Without this topic, agents/developers may re-invent inference wrappers or accidentally put var branches into canonical types.

**Content outline**:

1. **Purpose**: Define the inference-only counterparts to CanonicalType components
2. **InferencePayloadType**: `PayloadType | { kind: 'var'; var: PayloadVarId }`
3. **InferenceUnitType**: `UnitType | { kind: 'var'; var: UnitVarId }`
4. **InferenceCanonicalType**: `{ payload: InferencePayloadType; unit: InferenceUnitType; extent: Extent }`
5. **Boundary rule**: These types exist ONLY in:
   - Type solver internals
   - Frontend constraint gathering
   - Type inference UI display (via `tryDeriveKind`)
6. **Escape prohibition**: No `InferencePayloadType` or `InferenceUnitType` in backend IR, runtime, renderer, or any persisted/serialized structure
7. **Relationship to Axis<T,V>**: Extent axes already have var support via `Axis<T,V>`. InferencePayloadType and InferenceUnitType add var support to the other two components of CanonicalType.

## Updates to Existing Topics

### type-system/t2_derived-classifications.md

**Changes**:
1. Add `tryDeriveKind()` function (Resolution Q3)
2. Add note about builder enforcement for eventRead (Resolution Q10)
3. Add note about `deriveKind` totality wording: "total over fully instantiated types"

### type-system/t3_const-value.md

**Changes**:
1. Update cameraProjection variant: `{ kind: 'cameraProjection'; value: CameraProjection }` where `CameraProjection` is closed string enum (Resolution Q8)
2. Remove "4x4 matrix" comment

### validation/t2_axis-validate.md

**Changes**:
1. Update AxisViolation type: `{ nodeKind, nodeIndex, message }` (Resolution Q11)
2. Add deriveKind agreement assertion rule (Resolutions Q4/Q5)
3. Add eventRead type validation note (Resolution Q10)

### validation/t3_diagnostics.md

**Changes**:
1. Update AxisViolation type definition and examples (Resolution Q11)
2. Add BindingMismatchError diagnostic (Resolution Q9)

### migration/t3_definition-of-done.md

**Changes**:
1. Add "CI Gate Test" section with Vitest test specification (Resolution Q13)
2. Add forbidden pattern list with allowlist for migration directories
3. Update DoD to reference CI gates as part of 100% completion (Resolution Q12)

## Updated Topic Dependency Map

```
principles/
  └── t1_single-authority.md ── [no changes]

type-system/
  ├── t1_canonical-type.md ── [add cross-ref to t2_inference-types.md]
  ├── t2_extent-axes.md ── [no changes]
  ├── t2_derived-classifications.md ── [add tryDeriveKind, eventRead enforcement]
  ├── t2_inference-types.md ── [NEW — InferencePayloadType, InferenceCanonicalType]
  └── t3_const-value.md ── [fix cameraProjection]

axes/
  ├── t1_axis-invariants.md ── [no changes]
  ├── t2_cardinality.md ── [no changes]
  ├── t2_temporality.md ── [no changes]
  ├── t2_binding.md ── [no changes]
  ├── t2_perspective.md ── [no changes]
  └── t2_branch.md ── [no changes]

validation/
  ├── t1_enforcement-gate.md ── [no changes]
  ├── t2_axis-validate.md ── [update AxisViolation, add agreement assert]
  └── t3_diagnostics.md ── [update AxisViolation, add BindingMismatchError]

migration/
  ├── t2_value-expr.md ── [no changes]
  ├── t2_unit-restructure.md ── [no changes]
  ├── t2_adapter-restructure.md ── [no changes]
  ├── t3_definition-of-done.md ── [add CI gates]
  └── t3_rules-for-new-types.md ── [no changes]
```
