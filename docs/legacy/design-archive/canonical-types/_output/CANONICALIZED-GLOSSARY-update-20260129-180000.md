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
  - validation
---

# Glossary Updates: Gap Analysis Integration

## NEW Terms

### BindingMismatchError
**Definition**: Structured diagnostic produced when binding axes fail to unify. Replaces generic AxisUnificationError for binding-specific cases.
**Type**: type
**Canonical Form**: `BindingMismatchError = { left: BindingValue; right: BindingValue; location: ...; remedy: 'insert-state-op' | 'insert-continuity-op' | 'rewire' }`
**Source**: Resolution Q9, [Diagnostics](./CANONICAL-canonical-types-20260129-235000/validation/t3_diagnostics.md)

### CameraProjection
**Definition**: Closed string enum for camera projection modes. NOT a 4x4 matrix.
**Type**: type
**Canonical Form**: `CameraProjection = 'orthographic' | 'perspective' | ...` (closed set)
**Related**: [PayloadType](#payloadtype), [ConstValue](#constvalue)
**Source**: Resolution Q8, [ConstValue](./CANONICAL-canonical-types-20260129-235000/type-system/t3_const-value.md)

### InferenceCanonicalType
**Definition**: Inference-only type wrapper that allows payload and unit variables. MUST NOT escape frontend/solver boundary.
**Type**: type
**Canonical Form**: `InferenceCanonicalType = { payload: InferencePayloadType; unit: InferenceUnitType; extent: Extent }`
**Related**: [CanonicalType](#canonicaltype), [InferencePayloadType](#inferencepayloadtype)
**Source**: Resolution Q2, [Inference Types](./CANONICAL-canonical-types-20260129-235000/type-system/t2_inference-types.md)

### InferencePayloadType
**Definition**: Inference-only payload type that includes a var branch for type variables. Only used by frontend/type solver.
**Type**: type
**Canonical Form**: `InferencePayloadType = PayloadType | { kind: 'var'; var: PayloadVarId }`
**Related**: [PayloadType](#payloadtype), [InferenceCanonicalType](#inferencecanonicaltype)
**Source**: Resolution Q2

### InferenceUnitType
**Definition**: Inference-only unit type that includes a var branch. Only used by frontend/type solver.
**Type**: type
**Canonical Form**: `InferenceUnitType = UnitType | { kind: 'var'; var: UnitVarId }`
**Related**: [UnitType](#unittype), [InferenceCanonicalType](#inferencecanonicaltype)
**Source**: Resolution Q2

### tryDeriveKind
**Definition**: Partial helper that returns DerivedKind or null when axes contain variables. Safe for UI/inference paths.
**Type**: function
**Canonical Form**: `tryDeriveKind(t: CanonicalType | InferenceCanonicalType): DerivedKind | null`
**Related**: [DerivedKind](#derivedkind), [deriveKind](#derivekind)
**Source**: Resolution Q3, [Derived Classifications](./CANONICAL-canonical-types-20260129-235000/type-system/t2_derived-classifications.md)

## CONFLICTING Terms (updates to existing)

### AxisViolation (UPDATED)
**Old**: `AxisViolation = { exprIndex: number, kind: string, message: string }`
**New**: `AxisViolation = { nodeKind: 'ValueExpr' | 'CanonicalType' | ...; nodeIndex: number; message: string }`
**Rationale**: Resolution Q11 — generic naming, not expression-specific.

### ConstValue — cameraProjection variant (UPDATED)
**Old**: `{ kind: 'cameraProjection'; value: number[] }` (4x4 matrix)
**New**: `{ kind: 'cameraProjection'; value: CameraProjection }` (closed enum)
**Rationale**: Resolution Q8 — cameraProjection is a selection, not matrix data.

## COMPLEMENTARY Additions (existing terms enhanced)

### deriveKind (enhanced)
**Addition**: Spec wording updated to "total over fully instantiated types." UI/inference paths must use `tryDeriveKind` instead. Backend/lowered paths must use strict `deriveKind`.
**Source**: Resolution Q3

### payloadStride (confirmed)
**Confirmation**: stride is ALWAYS derived, never stored. `strideOf()` must be deleted or made to call `payloadStride()`.
**Source**: Resolution Q7
