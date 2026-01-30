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
  - migration
---

# Update Questions: Gap Analysis Integration

> Items that must be resolved before integration can proceed.

---

## CRITICAL (T1 Contradictions)

*None found.* The gap analysis resolutions are fully aligned with all foundational content.

---

## HIGH (T2 Contradictions)

### UQ1: ConstValue cameraProjection representation

**Tag**: CONTRADICTION-T2

**Canonical** (type-system/t3_const-value.md line 27):
```typescript
| { kind: 'cameraProjection'; value: number[] };  // 4x4 matrix
```

**Resolution Q8**:
> cameraProjection is a closed enum, not a matrix.
> `CameraProjection` is a closed string union (e.g., `'orthographic' | 'perspective' | ...`).
> `ConstValue` stores `{ kind: 'cameraProjection'; value: CameraProjection }`.

**Analysis**: The canonical T3 file says cameraProjection ConstValue stores a 4x4 matrix (number[]). Resolution Q8 says it's a closed string enum. These are structurally incompatible. The resolution is a user-approved design decision.

**Recommendation**: Accept Resolution Q8. Update t3_const-value.md.

**Status**: RESOLVED (Resolution Q8 is user-approved; canonical was underspecified here)

**Resolution**: CameraProjection is a closed string enum. ConstValue stores `{ kind: 'cameraProjection'; value: CameraProjection }` where `CameraProjection = 'orthographic' | 'perspective' | ...`. If 4x4 matrix needed later, that's a separate payload kind (mat4) or a resource.

**Impact**: type-system/t3_const-value.md, GLOSSARY (CameraProjection entry)

---

### UQ2: AxisViolation field names

**Tag**: CONTRADICTION-T2

**Canonical** (validation/t2_axis-validate.md, t3_diagnostics.md, GLOSSARY):
```typescript
type AxisViolation = {
  readonly exprIndex: number;
  readonly kind: string;
  readonly message: string;
};
```

**Resolution Q11**:
> Standardize on generic naming: `AxisViolation { nodeKind: 'ValueExpr' | 'CanonicalType' | ...; nodeIndex: number; message: string }`

**Analysis**: Resolution Q11 replaces `exprIndex` with `nodeIndex` and replaces the violation `kind` with `nodeKind` (the type of the node that failed). This is a structural field rename plus semantic change — the `kind` field changes from "violation type identifier" to "node type identifier."

**Recommendation**: Accept Resolution Q11. This is a user-approved decision. Note: the original `kind` field (violation type identifier like `'eventPayloadMismatch'`) may still be needed for programmatic handling. Q11 doesn't explicitly address whether the violation identifier is kept.

**Status**: RESOLVED (Resolution Q11 is user-approved)

**Resolution**: AxisViolation uses `{ nodeKind, nodeIndex, message }`. If violation-type identifiers are needed for programmatic handling, they can be encoded in message or added as a separate field later.

**Impact**: validation/t2_axis-validate.md, validation/t3_diagnostics.md, GLOSSARY (AxisViolation)

---

### UQ3: Inference types — new topic needed

**Tag**: CONTRADICTION-T2 / NEW-TOPIC

**Canonical**: Says "No var in PayloadType" and "No var in UnitType" but does not define the inference-only wrappers.

**Resolution Q2**:
> Split inference types from canonical types.
> Define `InferencePayloadType` (includes `{ kind: 'var'; var: PayloadVarId }`).
> Define `InferenceCanonicalType = { payload: InferencePayloadType; unit: InferenceUnitType; extent: Extent }`.
> Only frontend/type solver may use inference forms.

**Analysis**: The canonical spec correctly excludes var from PayloadType and UnitType. Resolution Q2 defines the inference-only counterparts. This is genuinely new content that needs a canonical home.

**Recommendation**: Create new T2 topic file: `type-system/t2_inference-types.md`.

**Status**: RESOLVED (Resolution Q2 is user-approved; new topic created during integration)

**Resolution**: New T2 file defines InferencePayloadType, InferenceUnitType, InferenceCanonicalType. Cross-references from t1_canonical-type.md. Clear boundary: these types are inference-only and MUST NOT appear in backend/runtime/renderer.

**Impact**: New file type-system/t2_inference-types.md, cross-ref from t1_canonical-type.md

---

## NORMAL (T3 Contradictions)

### UQ4: Definition of Done — CI gates

**Tag**: CONTRADICTION-T3

**Canonical** (migration/t3_definition-of-done.md): Lists manual grep commands for verification.

**Resolutions Q12/Q13**:
> Add Vitest test for forbidden patterns.
> Grep-based test that fails CI for: AxisTag, payload var outside inference, UnitType var, legacy names, instanceId fields.
> Small allowlist for migration directories.

**Analysis**: The canonical DoD checklist has manual grep commands. Resolutions Q12/Q13 require automated Vitest CI gates. Not contradictory but the T3 file needs updating to reflect the higher automation standard.

**Status**: RESOLVED (Resolutions Q12/Q13 are user-approved)

**Resolution**: Add "CI Gate Test" section to t3_definition-of-done.md specifying the Vitest test requirements.

**Impact**: migration/t3_definition-of-done.md

---

## COMPLEMENTARY (Enhancements to existing topics)

### UQ5: tryDeriveKind function

**Tag**: COMPLEMENT

Resolution Q3 adds `tryDeriveKind(t): DerivedKind | null` for inference paths.

**Status**: RESOLVED (auto-integrate — no contradiction)

**Impact**: type-system/t2_derived-classifications.md, GLOSSARY

---

### UQ6: Builder enforcement for eventRead

**Tag**: COMPLEMENT

Resolution Q10 specifies that the IR builder must not accept caller-provided type for eventRead.

**Status**: RESOLVED (auto-integrate)

**Impact**: type-system/t2_derived-classifications.md, validation/t2_axis-validate.md

---

### UQ7: BindingMismatchError diagnostic

**Tag**: COMPLEMENT

Resolution Q9 defines structured binding unification error.

**Status**: RESOLVED (auto-integrate)

**Impact**: validation/t3_diagnostics.md, GLOSSARY

---

### UQ8: deriveKind agreement assertion

**Tag**: COMPLEMENT

Resolutions Q4/Q5 require `tag === deriveKind(v.type)` assertion at lowering/debug boundaries.

**Status**: RESOLVED (auto-integrate)

**Impact**: validation/t2_axis-validate.md

---

### UQ9: Shape payload removal confirmation

**Tag**: OVERLAP

Resolution Q6 confirms shape is NOT a payload kind (resource, not lane value). Canonical already excludes shape from PayloadType.

**Status**: RESOLVED (canonical already correct; note in RESOLUTION-LOG)

**Impact**: RESOLUTION-LOG only

---

### UQ10: Stride removal confirmation

**Tag**: OVERLAP

Resolution Q7 confirms stride is derived-only. Canonical already states this.

**Status**: RESOLVED (canonical already correct; note in RESOLUTION-LOG)

**Impact**: RESOLUTION-LOG only

---

## Resolution Summary

| # | Tag | Status | Action Required |
|---|-----|--------|----------------|
| UQ1 | CONTRADICTION-T2 | RESOLVED | Update t3_const-value.md |
| UQ2 | CONTRADICTION-T2 | RESOLVED | Update t2_axis-validate.md, t3_diagnostics.md, GLOSSARY |
| UQ3 | NEW-TOPIC | RESOLVED | Create t2_inference-types.md |
| UQ4 | CONTRADICTION-T3 | RESOLVED | Update t3_definition-of-done.md |
| UQ5 | COMPLEMENT | RESOLVED | Update t2_derived-classifications.md, GLOSSARY |
| UQ6 | COMPLEMENT | RESOLVED | Update t2_derived-classifications.md |
| UQ7 | COMPLEMENT | RESOLVED | Update t3_diagnostics.md, GLOSSARY |
| UQ8 | COMPLEMENT | RESOLVED | Update t2_axis-validate.md |
| UQ9 | OVERLAP | RESOLVED | RESOLUTION-LOG note only |
| UQ10 | OVERLAP | RESOLVED | RESOLUTION-LOG note only |

**All items are pre-resolved** because the source gap analysis resolutions were user-approved decisions. No blocking questions remain. Integration can proceed immediately.
