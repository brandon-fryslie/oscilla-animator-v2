Sprint: valueexpr-adapter-deferred — ValueExpr Unification + Adapter Restructure + Zero-Cardinality (Appendix-only)

Generated: 2026-01-30T00:00:00Z
Confidence: HIGH: 5, MEDIUM: 2, LOW: 0
Status: READY (no research gates)

Sprint Goal
1.	Introduce ValueExpr as the single canonical expression authority (even if not yet fully adopted),
2.	Restructure adapter specs to match CanonicalType on all 5 axes,
3.	Formalize zero-cardinality as a real, enforced part of CanonicalType (compile-time constants) without inventing a second runtime lane model,
4.	Keep all migration-only notes in appendix only.

⸻

Scope

Deliverables (in-sprint)
- D1: src/compiler/ir/value-expr.ts defines ValueExpr union (canonical table)
- D2: Canonical discriminant name is kind everywhere (ValueExpr included)
- D3: Field instance identity duplicated in nodes is removed (derive from type.extent.cardinality)
- D4: AdapterSpec moves to blocks layer and matches CanonicalType patterns (payload/unit/extent; per-axis)
- D5: Zero-cardinality is real: Const blocks emit cardinality=zero values; explicit lift rules exist and are enforced
- D6: Const literal representation uses ConstValue (payload-keyed discriminated union)
- D7: Migration appendix documents legacy→ValueExpr mapping and incremental adoption targets (appendix only)

Explicitly out of scope (but must remain type-safe)
- Branch-keyed runtime state
- v1+ perspective/branch variants beyond default-only constructors
- Full evaluator/backend conversion to ValueExpr (only “first consumer” proof)

Appendix-only rule (hard)

All “one-time transition” steps, rollout notes, sequencing, and back-compat scaffolding go into:
design-docs/canonical-types/APPENDIX-migration.md (or equivalent), not into T1/T2/T3 core sections.

⸻

Hard Constraints (must hold throughout sprint)
- canonicalType() returns CanonicalType only. No inference widening.
- Inference types stay inference-only (block defs / solver input) via separate constructors/types.
- No node-level fields may duplicate information derivable from CanonicalType (instance, sig/field/event kind, etc.).
- No adapter insertion bypasses rules: it only inserts explicit blocks whose I/O types already satisfy CanonicalType validity rules.
- ValueExpr discriminant is kind, not op.
- Zero-cardinality never creates runtime lanes; it is compile-time-only and must be lifted explicitly when entering runtime evaluation.

⸻

Work Items

P0-1: Create canonical ValueExpr table (D1, D2)

Confidence: HIGH
Files
- NEW: src/compiler/ir/value-expr.ts
- (optional) NEW: src/compiler/ir/value-expr-map.ts (appendix helper, not required)

Acceptance Criteria
- ValueExpr union exists with variants:
- const, external, intrinsic, kernel, state, time
- Every variant has:
- readonly kind: <literal>
- readonly type: CanonicalType
- ValueExprId references are via branded IDs from src/core/ids.ts
- No op discriminant anywhere in ValueExpr
- No axis-derived “sig/field/event” tags stored in ValueExpr

Notes
- This is a canonical definition table, not a forced full migration.
- Mapping of legacy variants is documented in appendix (see P1-6).

⸻

P0-2: Fix SigExprEventRead output type (D? – correctness lock)

Confidence: HIGH
Decision (locked)
- Output type is canonicalSignal(float, scalar).
- Runtime produces 0.0/1.0 number, never boolean.

Acceptance Criteria
- Any spec/docs implying BOOL output are corrected
- IRBuilder signatures and call sites treat it as float signal
- A single helper exists (optional): canonicalEventScalarSignal(): CanonicalType returning float/scalar signal

⸻

P0-3: AdapterSpec restructure into blocks layer (D4)

Confidence: HIGH
Files
- MOVE/NEW: src/blocks/adapter-spec.ts (canonical)
- Deprecate: src/graph/adapters.ts (migration wrapper allowed; appendix must document)
- Update: src/blocks/registry.ts to attach adapterSpec metadata to BlockDef

Acceptance Criteria
- Adapter metadata lives on BlockDef (adapterSpec)
- Adapter matching is defined over:
- payload pattern
- unit pattern (structured UnitType)
- per-axis extent patterns
- AdapterSpec requires:
- purity: 'pure'
- stability: 'stable'
- AdapterSpec never introduces unit vars or payload vars
- Broadcast is expressed via extent transform (cardinality one→many(instance)) with correct instance rules

Decisions
- “Auto-insert” remains UX policy; technical layer only inserts explicit blocks that are already type-correct.

⸻

P0-4: Remove duplicated field instance identity from expression nodes (D3)

Confidence: HIGH
Decision (locked)
- Field instance identity lives only in type.extent.cardinality = many(instanceRef).

Acceptance Criteria
- Remove instanceId fields from all FieldExpr nodes where present
- Replace call sites with:
- requireManyInstance(expr.type) (or equivalent locked helper)
- No “optional instanceId” remains on map/zip nodes
- If any Step types keep instanceId, it must be documented explicitly as runtime scheduling/materialization data (not type authority)

⸻

P0-5: Zero-cardinality becomes real and enforced (D5)

Confidence: MEDIUM (because this is currently unused in prod)
Decision (locked)
- CardinalityValue.zero is used for compile-time constants (“no runtime lanes”).
- Const blocks must emit zero-cardinality values before any lift.

What counts as compile-time constant (v0)
- Const blocks (literal constants)
- Any expression whose arguments are all zero-cardinality and whose op is pure+stable can be folded to zero-cardinality (optional in this sprint; folding can be deferred, but typing must allow it)

Acceptance Criteria
- Canonical constructors exist (or are documented) for zero-cardinality:
- canonicalConst(payload, unit) => cardinality=zero, temporality=continuous (default)
- canonicalConstEvent() is not allowed in v0 (events are runtime observations; do not make “constant events” unless explicitly designed)
- Explicit lift rules exist and are enforced in ONE place:
- zero→signal (one) when entering runtime signal evaluation
- zero→field (many(instance)) when broadcasting into a domain
- Axis validator recognizes and permits zero-cardinality only where allowed:
- const expressions
- folded pure expressions (if you implement folding now)
- never for “time” reads, event reads, or stateful ops unless explicitly allowed
- No runtime lane allocator ever sees cardinality=zero

Mechanics (strict)
- If an op expects a signal/field input and receives cardinality=zero, you must insert an explicit lift:
- either as a ValueExprKernel (canonical “lift kernel”) or as a dedicated ValueExpr variant (lift)
- pick ONE and make it the only allowed lifting mechanism

(Choose one now; don’t leave it ambiguous.)

Canonical choice for v0
- Add ValueExprLift variant:
- kind: 'lift'
- type: CanonicalType (post-lift type)
- from: ValueExprId
- toCardinality: 'one' | { many: InstanceRef }
This makes the lift unforgeable and visible to validators.

⸻

P0-6: ConstValue shape is canonical (D6)

Confidence: HIGH
Decision (locked)
- Literal storage is a discriminated union keyed by payload kind (not number|string|boolean).

Acceptance Criteria
- ConstValue exists in core (src/core/canonical-types.ts or a core constants module)
- ValueExprConst.value is ConstValue
- Validator enforces expr.type.payload.kind === expr.value.kind

Specific locked corrections
- cameraProjection const is string enum name, not matrix.
- If you later introduce projection matrices, that is a different payload (mat4 or similar), not cameraProjection.

⸻

P1-7: Appendix-only: legacy→ValueExpr mapping and staged adoption (D7)

Confidence: MEDIUM
Location
- design-docs/canonical-types/APPENDIX-migration.md

Acceptance Criteria
- Full mapping table from 24 legacy variants → ValueExpr forms
- Identify the first consumer to migrate in-sprint as proof:
- Choose exactly one: type validator, inspector display, or a minimal evaluator path
- Migration notes, sequencing, deprecations, temporary aliases live ONLY here

⸻

Resolutions to the specific open items you raised (baked into sprint)
- N4 canonicalSignal default unit asymmetry: KEEP AS-IS. Signals default to scalar unit. Fields require explicit unit. Do not use defaultUnitForPayload() as fallback.
- N5 SigExprEventRead type: float scalar signal (0/1). Update spec/mapping accordingly.
- Q1 CardinalityValue.zero: KEEP, and start using it in prod via Const blocks this sprint.
- Q2 Binding ordering: Binding is nominal tags (equality-only) in v0. No ordering/lattice ops until explicitly added later.
- Q2 Payload var variant: Remove var from concrete PayloadType. Introduce InferencePayloadType separately (inference-only) if needed. CanonicalType.payload is concrete-only.
- Q3 deriveKind totality: Add tryDeriveKind() + keep deriveKind() strict. Spec wording: “total over instantiated types.”
- Q4/Q5 kind tags in LoweredOutput/DebugService: Allowed as TypeScript discriminants only when a variant lacks .type (instance/scalar). If .type exists, do not add redundant sig/field/event tags.
- Q6 shape payload: Add shape as a real payload kind in spec only if you commit to it being a value (stride semantics defined). Otherwise move it to a resource/ref system. (Make a single decision; don’t keep it “implementation-specific” in core.)
- Q7 stride stored on payload singletons: Remove stored stride fields; use payloadStride() only. One source of truth.
- Q8 cameraProjection const: Enum string (locked).
- Q10 eventRead caller typing: enforce float scalar.
- B1 migration tier: irrelevant; migration content goes to appendix only (locked).

⸻

Dependencies
- Requires UnitType restructure already landed (structured kinds, no unit vars in canonical UnitType).
- Requires axis representation Axis<T,V> (var/inst) already decided.
- Requires try/require many-instance helpers already decided.

⸻

Risks (real ones)
- Introducing zero-cardinality without a single explicit lift mechanism will create silent bugs. Pick one mechanism (this plan picks ValueExprLift) and enforce it centrally.
- Adapter restructure touches normalization; make sure adapter matching runs only on canonical types and never introduces inference vars.

⸻

Definition of Done (sprint)
- ValueExpr canonical file exists and compiles
- AdapterSpec moved + per-axis matching works + broadcast expressed correctly
- Field node instanceId removed; all consumers derive from type
- ConstValue is payload-keyed and validated
- Zero-cardinality is emitted by Const blocks and lifted explicitly to runtime lanes
- All migration notes are moved into appendix; core spec contains only enduring rules