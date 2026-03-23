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
  - axes
---

# Update Summary: Gap Analysis Integration

## New Sources Analyzed

| File | Type | Content |
|------|------|---------|
| `.agent_planning/gap-analysis/RESOLUTIONS.md` | Resolved design decisions | 12 design questions (Q1-Q13, no Q14) with canonical decisions |
| `.agent_planning/gap-analysis/SUMMARY.md` | Gap analysis results | 31 prioritized work items across 5 priority levels, dependency graph |

## Findings Overview

| Category | Count | Details |
|----------|-------|---------|
| CONTRADICTION-T1 | 0 | No foundational contradictions |
| CONTRADICTION-T2 | 3 | ConstValue cameraProjection shape, AxisViolation field naming, InferenceType split |
| CONTRADICTION-T3 | 1 | Definition of Done needs CI gates update |
| OVERLAP | 7 | Many resolutions confirm/extend existing canonical content |
| COMPLEMENT | 6 | New information that enhances existing topics |
| NEW-TOPIC | 1 | Inference types (InferencePayloadType, InferenceCanonicalType) |
| GAP | 0 | All gaps already tracked in work queue |

## Affected Existing Topics

| Topic | Files Affected | Nature of Change |
|-------|---------------|------------------|
| type-system | t1_canonical-type.md, t3_const-value.md, t2_derived-classifications.md | Shape payload removal, cameraProjection enum, tryDeriveKind, stride removal |
| validation | t2_axis-validate.md, t3_diagnostics.md | AxisViolation field rename, eventRead type locking |
| migration | t3_definition-of-done.md | CI gate checklist additions |
| axes | (no file changes) | Confirmed, no contradictions |
| principles | (no file changes) | Confirmed, no contradictions |

## Proposed New Topics

| Topic | Tier | Description |
|-------|------|-------------|
| type-system/t2_inference-types.md | T2 (Structural) | InferencePayloadType, InferenceCanonicalType — inference-only type wrappers that carry var branches |

## Detailed Analysis

### CONTRADICTION-T2-1: ConstValue cameraProjection

**Canonical says** (t3_const-value.md): `{ kind: 'cameraProjection'; value: number[] }` (4x4 matrix)
**Resolution Q8 says**: cameraProjection is a closed enum (`'orthographic' | 'perspective' | ...`), NOT a matrix.

**Impact**: t3_const-value.md must update cameraProjection variant.

### CONTRADICTION-T2-2: AxisViolation field naming

**Canonical says** (t2_axis-validate.md, t3_diagnostics.md, GLOSSARY): `AxisViolation = { exprIndex: number, kind: string, message: string }`
**Resolution Q11 says**: Standardize on `{ nodeKind: string, nodeIndex: number, message: string }` — generic, not expression-specific.

**Impact**: t2_axis-validate.md, t3_diagnostics.md, GLOSSARY AxisViolation definition must update.

### CONTRADICTION-T2-3: No InferenceType concept in canonical

**Canonical says**: PayloadType has no var; UnitType has no var. Mentioned in passing but no dedicated topic.
**Resolution Q2 says**: Explicitly define `InferencePayloadType = PayloadType | { kind: 'var'; var: PayloadVarId }` and `InferenceCanonicalType = { payload: InferencePayloadType; unit: InferenceUnitType; extent: Extent }`.

**Impact**: New T2 topic file needed. Also update t1_canonical-type.md to cross-reference.

### CONTRADICTION-T3-1: Definition of Done missing CI gates

**Canonical says** (t3_definition-of-done.md): grep-based verification commands listed.
**Resolution Q12/Q13 says**: Add Vitest-based CI gate test for forbidden patterns, not just manual grep commands. Specific patterns: AxisTag, payload var outside inference, UnitType var, legacy names, instanceId on expressions.

**Impact**: t3_definition-of-done.md needs CI gate section with Vitest test specification.

### OVERLAP-1: Shape payload removal (Q6)

Resolution Q6 removes `{ kind: 'shape' }` from PayloadType. Current canonical t1_canonical-type.md already does NOT list shape in PayloadType (it was already absent from the canonical spec). Resolution confirms the canonical spec is correct.

**Action**: No change needed to canonical. Note in RESOLUTION-LOG that implementation must also remove it.

### OVERLAP-2: Stride removal (Q7)

Resolution Q7 removes stored stride. Canonical already says "Stride is ALWAYS derived from payload, never stored separately." Resolution confirms canonical is correct.

**Action**: No change needed. Note in RESOLUTION-LOG.

### OVERLAP-3: AxisTag deletion (Q1)

Resolution Q1 deletes AxisTag. Canonical already lists AxisTag as deprecated. Resolution confirms implementation must complete deletion.

**Action**: No change needed. Note in RESOLUTION-LOG.

### OVERLAP-4: eventRead output type (Q10)

Resolution Q10 locks eventRead to float signal. Canonical already documents this under N5 and temporality. Resolution adds builder enforcement.

**Action**: Add note to t2_derived-classifications.md about builder enforcement.

### OVERLAP-5: Kind tag agreement (Q4/Q5)

Resolution Q4/Q5 allows kind tags for TS narrowing with deriveKind agreement assertion. Canonical Guardrail 2 already covers this. Resolution adds explicit assert requirement.

**Action**: Add assertion requirement to validation topic.

### OVERLAP-6: Binding not a lattice (Q2 in RESOLUTIONS overlaps Q2 in RESOLUTION-LOG)

Both confirm binding is NOT a lattice. Resolution Q9 adds structured BindingMismatchError.

**Action**: Add BindingMismatchError to validation/diagnostics.

### OVERLAP-7: deriveKind totality (Q3)

Resolution Q3 adds tryDeriveKind(). Canonical already documents deriveKind as total. Resolution adds partial helper for inference paths.

**Action**: Add tryDeriveKind to t2_derived-classifications.md.

### COMPLEMENT-1: tryDeriveKind function

New function `tryDeriveKind(t): DerivedKind | null` for UI/inference paths where axes may still be var.
**Target**: type-system/t2_derived-classifications.md

### COMPLEMENT-2: Builder enforcement for eventRead

Builder must not accept caller-provided type for eventRead. Sets type internally.
**Target**: type-system/t2_derived-classifications.md, validation/t2_axis-validate.md

### COMPLEMENT-3: BindingMismatchError diagnostic

Structured error: `{ left: BindingValue, right: BindingValue, location: ..., remedy: string }`.
**Target**: validation/t3_diagnostics.md

### COMPLEMENT-4: deriveKind agreement assertion

At lowering/debug boundaries: `if hasType(v) then tag === deriveKind(v.type)`.
**Target**: validation/t2_axis-validate.md or new section in enforcement gate

### COMPLEMENT-5: CI forbidden-pattern test specification

Vitest test checking: AxisTag, payload var outside inference, UnitType var, legacy names, instanceId fields.
**Target**: migration/t3_definition-of-done.md

### COMPLEMENT-6: Priority work queue integration

31 work items with dependency graph. This is operational content (not spec content), but the SUMMARY.md references are valuable for tracking what canonical topics each work item affects.
**Target**: Not canonical content — belongs in .agent_planning/ only. No encyclopedia change.
