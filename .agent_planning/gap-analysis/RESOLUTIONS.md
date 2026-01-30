---
generated: 2026-01-29
status: CANONICAL
approved_by: User
---

# Gap Analysis Resolutions

These are the user's canonical decisions on all P3 (to-review) design questions.
Each resolution states what becomes true in the spec + codebase.

---

## Q2: PayloadType var variant — SPLIT TYPES

**Decision**: Split inference types from canonical types.

- `CanonicalType` is backend-safe. Must never contain payload variables.
- Define `InferencePayloadType` (includes `{ kind: 'var'; var: PayloadVarId }`).
- Define `PayloadType` (concrete-only, no var).
- Define `InferenceCanonicalType = { payload: InferencePayloadType; unit: InferenceUnitType; extent: Extent }`.
- Only frontend/type solver may use inference forms.
- Backend IR and any "authoritative" stored types use `CanonicalType` only.

---

## Q3: deriveKind() totality — BOTH helper + fix wording

**Decision**: Add `tryDeriveKind()` and fix spec wording.

- Spec wording: "total over fully instantiated types".
- `deriveKind(t: CanonicalType): DerivedKind` — requires instantiated cardinality+temporality; throws otherwise.
- `tryDeriveKind(t): DerivedKind | null` — returns null when axes are var.
- Rule: UI/inference paths must use `tryDeriveKind`; backend/lowered paths must only call strict `deriveKind`.

---

## Q4: LoweredOutput/ValueRefPacked kind — KEEP with derived check

**Decision**: Keep discriminant tags; add agreement assertion.

- Discriminant tags allowed only as: (1) TypeScript narrowing tags, and/or (2) variants that lack `.type`.
- Invariant: whenever a variant has `.type`, the tag must agree with `deriveKind(type)` at construction/validation time.
- Action: add assert in lowering boundary: `if hasType(v) then tag === deriveKind(v.type)`.

---

## Q5: DebugService kind — SAME AS Q4

**Decision**: Keep `kind` for discriminated unions. Enforce agreement when `.type` exists.

---

## Q6: shape payload — REMOVE FROM PayloadType

**Decision**: Shape is a resource, not a payload.

- PayloadType represents numeric/bool-ish value lanes with clear stride and GPU/storage semantics.
- Shape is a resource/reference, not a lane value.
- Remove `{ kind: 'shape' }` from PayloadType.
- Shapes live in a parallel resource graph; kernels consume `ShapeRef` via block params, not ValueExpr lanes.
- Spec update: "shape/topology/path data is not a PayloadType; it is a resource."

---

## Q7: Stride on payload — REMOVE STORED STRIDE

**Decision**: One path only. Stride is derived, never stored.

- Delete `stride` field from all ConcretePayloadType variants.
- Keep `payloadStride(payload)` as the only authority.
- Delete `strideOf()` or make it call `payloadStride()`.

---

## Q8: cameraProjection ConstValue — CLOSED ENUM

**Decision**: cameraProjection is a closed enum, not a matrix.

- `CameraProjection` is a closed string union (e.g., `'orthographic' | 'perspective' | ...`).
- `ConstValue` stores `{ kind: 'cameraProjection'; value: CameraProjection }`.
- If 4x4 matrix needed later, that's a different payload kind (`mat4`) or a resource.

---

## Q9: Binding unification diagnostics — STRUCTURED ERRORS REQUIRED

**Decision**: Replace generic throws with typed diagnostics.

- Replace `AxisUnificationError` for binding mismatches with:
  `BindingMismatchError { left: BindingValue; right: BindingValue; location: ...; remedy: 'insert-state-op' | 'insert-continuity-op' | 'rewire' }`
- Type solver still throws internally; frontend catches and emits typed diagnostic entries.
- No "needs adapter" for binding unless an explicit binding-changing op is registered.

---

## Q10: eventRead output type — LOCKED IN BUILDER

**Decision**: Builder must not accept caller-provided type for eventRead.

- `eventRead` produces a signal float scalar (0/1), always.
- Builder sets: `canonicalSignal({ kind: 'float' }, { kind: 'scalar' })`.
- Add axis validator rule: eventRead must be continuous signal.

---

## Q11: AxisViolation field naming — nodeIndex + nodeKind

**Decision**: Standardize on generic naming.

- `AxisViolation { nodeKind: 'ValueExpr' | 'CanonicalType' | ...; nodeIndex: number; message: string }`
- Spec should not hardcode `exprIndex`.

---

## Q12: Definition-of-done — CHANGE IMPL, NOT SPEC

**Decision**: Implementation must match spec, not vice versa.

- DoD checklists refer to concrete gates only:
  - "No AxisTag" grep gate
  - "No payload var in CanonicalType" type-level compile gate
  - "No old IR unions referenced" grep gate
  - "Axis validate wired into frontend output" integration test gate

---

## Q13: Governance enforcement — ADD CI NOW

**Decision**: Add Vitest test for forbidden patterns.

- Grep-based test that fails CI for:
  - `AxisTag<` anywhere
  - `payload: { kind: 'var'` outside inference modules
  - `UnitType` containing any var variant
  - Legacy type names (SignalType, old SigExpr/FieldExpr/EventExpr) from backend after cutoff
  - `instanceId` fields on FieldExpr/ValueExpr nodes
- Small allowlist for migration directories until cutover complete.

---

## Spec Edits Implied

1. Canonical vs inference types explicitly split (payload/unit vars banned from CanonicalType)
2. deriveKind "totality" wording fixed + tryDeriveKind added
3. "Kind tags" allowed only for TS narrowing / typeless variants, with agreement checks
4. shape removed from payload domain, reclassified as resource
5. stride stored fields removed
6. cameraProjection is closed enum, not matrix
7. eventRead output type locked in builder
8. Axis validation error schema normalized (nodeKind + nodeIndex)
9. CI grep gates required as part of DoD
