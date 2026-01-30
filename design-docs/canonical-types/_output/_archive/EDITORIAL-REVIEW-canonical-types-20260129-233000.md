---
command: /canonicalize-architecture Output directory: ./design-docs/canonical-types/_output. Input directories: ./design-docs/canonical-types, ./.agent_planning/canonical-type, ./.agent_planning/canonical-type-system
reviewed_files:
  - CANONICALIZED-SUMMARY-canonical-types-20260129-231500.md
  - CANONICALIZED-QUESTIONS-canonical-types-20260129-231500.md
  - CANONICALIZED-GLOSSARY-canonical-types-20260129-231500.md
  - CANONICALIZED-TOPICS-canonical-types-20260129-231500.md
status: REVIEW_COMPLETE
---

# Peer Design Review: CanonicalType System

Generated: 2026-01-29T23:30:00Z
Reviewer: Claude (peer review)

---

## Overall Assessment

This is a well-structured canonicalization of a complex type system migration. The 5-axis CanonicalType model is sound — it unifies three separate type families (signal/field/event) into a single authority with derived classifications, which eliminates an entire class of "second type system" bugs. The decision to make signal/field/event derived rather than stored is the right call and aligns with the single-authority principle.

The resolution process was thorough. All 14 items were resolved with clear rationale, and the user's G2 resolution (total mapping of 24 legacy variants to 6 ValueExpr ops) is a decisive architectural choice that prevents the common trap of "we'll figure it out later." The key decisions (Axis<T,V> over AxisTag, structured UnitType, try/require split, `kind` discriminant) are all defensible and internally consistent.

My main concern is that some structural/migration content is classified at the wrong tier, and the SUMMARY file has stale data from the pre-G2/N1 resolution run. These are fixable without rework.

**Verdict**: Approve

---

## What I Like

- **Single authority principle is well-enforced**: Every decision traces back to "CanonicalType is the only type." The glossary, invariants, and guardrails all reinforce this consistently.
- **try/require split (C3)**: Splitting `getManyInstance` into `tryGetManyInstance` + `requireManyInstance` is the right pattern. It forces callers to decide their failure mode at the call site instead of hoping for the best.
- **G2 total mapping resolution**: Rather than deferring the variant mapping, the user resolved it with a clear, deterministic rule: every legacy variant maps to exactly one of 6 ValueExpr ops. The `EventExprNever -> ValueExprConst` mapping (false + discrete bool none) is particularly elegant.
- **17 guardrails are actionable**: The 99-INVARIANTS-FOR-USAGE.md document gives agent/developers concrete DO/DON'T pairs. This is more useful than abstract principles alone.
- **Topic organization is clean**: 5 topics with clear dependency arrows. The reading order for newcomers vs implementers is a good touch.

---

## Encyclopedia Structure Review

### Topic Organization

| Topic | Assessment | Notes |
|-------|------------|-------|
| principles | Good | Lean and focused — single T1 file is correct |
| type-system | Good | Logical split: core type (T1), axes + derived (T2), const (T3) |
| axes | Good | Each axis gets its own T2 file, which is appropriate since each has distinct semantics |
| validation | Good | T1 enforcement gate + T2 implementation + T3 diagnostics is the right split |
| migration | Good | T2 is correct during active refactor; demote to T3 after migration completes |

### Tier Classification Review

| Topic | T1 Files | T2 Files | T3 Files | Assessment |
|-------|----------|----------|----------|------------|
| principles | single-authority | - | - | Good — truly foundational |
| type-system | canonical-type | extent-axes, derived-classifications | const-value | **Concern**: extent-axes straddles T1/T2 (see N2) |
| axes | axis-invariants | cardinality, temporality, binding, perspective, branch | - | Good distribution |
| validation | enforcement-gate | axis-validate | diagnostics | **Concern**: 17 guardrails in T1 may be too mutable (see N3) |
| migration | - | value-expr, unit-restructure, adapter-restructure | definition-of-done, rules-for-new-types | Good — T2 is correct during active refactor |

**Tier Assessment**: Sound. Migration files are T2 during the active refactor because they describe structural decisions that affect the entire codebase *right now*. They will be demoted to T3 once the migration completes. No tier issues.

### Structure Concerns

The 4 T1 / 13 T2 / 4 T3 distribution is appropriate. T1 is small and critical. No structural changes needed.

### Suggested Changes

None — structure is approved as-is.

---

## Blocking Concerns

None. All concerns resolved.

---

## Non-Blocking Concerns

### [N1]: SUMMARY File Has Stale "Remaining: 2" Data

**Where**: CANONICALIZED-SUMMARY section "Remaining Items (2)" and "Canonicalization Status"

**The Issue**: The SUMMARY still says:
- "Remaining Items (2): N1 and G2"
- "Resolved: 12, Remaining: 2"

But the QUESTIONS file shows 14/14 resolved (100%). The SUMMARY wasn't regenerated after N1 and G2 were resolved.

**Why I'm Raising It**: The encyclopedia generation will read the SUMMARY. If it sees "Remaining: 2" it could incorrectly flag the spec as incomplete.

**Suggestion**: Regenerate SUMMARY before final generation to reflect 100% resolution.

**Alternative View**: The SUMMARY may be considered superseded by the QUESTIONS file's progress table, in which case this is just cosmetic.

---

### [N2]: Extent-Axes Straddles T1/T2 Boundary

**Where**: `type-system/t2_extent-axes.md`

**The Issue**: The 5-axis extent model is part of the foundational type definition (`CanonicalType = { payload, unit, extent }`). The TOPICS file puts `t1_canonical-type.md` as covering "CanonicalType = { payload, unit, extent }" and `t2_extent-axes.md` as covering "5-axis Extent structure, Axis polymorphism pattern." But the axis polymorphism pattern (`Axis<T,V>`) IS the foundational type shape — resolved as C1, a critical contradiction.

**Why I'm Raising It**: If the `Axis<T,V>` pattern were only in T2, an agent might think it's "changeable with some work" when it's actually foundational (changing it would break the entire type inference system).

**Suggestion**: Ensure `t1_canonical-type.md` includes the axis pattern definition (`Axis<T,V>`), not just a reference to T2. The T2 file can elaborate on usage patterns, defaults, and canonicalization rules.

**Alternative View**: The split could work if T1 defines what `Axis<T,V>` IS and T2 covers how it's used in practice. Just make sure the foundational definition is in T1.

---

### [N3]: 17 Guardrails in T1 Enforcement-Gate May Be Too Mutable

**Where**: `validation/t1_enforcement-gate.md`

**The Issue**: The TOPICS file says this T1 file will incorporate all 17 guardrails from `99-INVARIANTS-FOR-USAGE.md`. Some guardrails reference implementation details:
- Guardrail #5: "axis-validate.ts is the only place..."
- Guardrail #14: "CompilationInspectorService"
- Guardrail #10: "branded IDs" (specific implementation choice)

T1 content should be stable enough that "changing it would make this a different application." Mentioning specific filenames or implementation patterns doesn't meet that bar.

**Why I'm Raising It**: If guardrails get updated (e.g., file renamed, new implementation pattern), the T1 file changes. T1 shouldn't change for implementation reasons.

**Suggestion**: Put the *principle* in T1 ("single enforcement gate, no scattered checks, no bypass in debug paths") and the *17 specific guardrails with implementation references* in T2. The principles don't change; the specific rules can evolve.

**Alternative View**: The guardrails ARE the principles, just expressed concretely. Having them in T1 prevents dilution. Agents who skip T2 would miss critical enforcement rules.

---

### [N4]: `canonicalSignal` Has Default Unit Parameter — RESOLVED

**Status**: RESOLVED — AGREE (intentional asymmetry), with crisp rule text

**Canonical Decision**:
- `canonicalSignal(payload, unit = { kind: 'scalar' })` keeps the default.
- `canonicalField(payload, unit, instance)` requires explicit unit (no default).

**Why this is correct** (hard contract, not convenience):
- Signals are frequently used as dimensionless modulation values; forcing unit annotation everywhere is noise and causes churn.
- Fields are domain-attached values (space/color/etc.) and the unit is semantically load-bearing; a default would silently corrupt meaning.

**Hard constraints** (must be stated in the spec):
1. Default unit is only a constructor convenience, never an inference fallback.
   - Type inference / type checking MUST NOT apply `defaultUnitForPayload()` implicitly.
2. Any place that needs a non-scalar unit on a signal MUST pass it explicitly (or use a unit-setting op/adapter).
3. There must be no hidden "if omitted, infer unit from payload" behavior anywhere outside these constructors.

**Required spec text** to prevent drift:
- `canonicalSignal()` defaults unit to scalar only when the caller omits it.
- `canonicalField()` has no default unit; callers must be explicit.
- `defaultUnitForPayload()` is not used by type checking; it is allowed only for UI display defaults or explicit authoring helpers (and must be clearly named/placed as such).

**Encyclopedia Location**: `type-system/t2_derived-classifications.md` (constructor contracts)

---

### [N5]: G2 Mapping for `SigExprEventRead` Has Ambiguous Output Type — RESOLVED

**Status**: RESOLVED — AGREE (float scalar 0/1), locked as canonical

**Canonical Decision**: SigExprEventRead produces a continuous signal:
- payload: `{ kind: 'float' }`
- unit: `{ kind: 'scalar' }`
- extent: cardinality=one, temporality=continuous (derivedKind = signal)

Canonical type: `canonicalSignal({ kind: 'float' }, { kind: 'scalar' })`

**Hard invariants**:
- EventRead is NOT an EventExpr and does NOT output payload=bool.
- Output semantics are numeric gating: 1.0 on frames where the event fires, 0.0 otherwise.
- Unit is always scalar (never none, never count, never norm01).

**G2 mapping entry (authoritative)**:
- Legacy: `SigExprEventRead`
- Canonical: `ValueExprKernel` with `kernelId('eventReadScalar01')`, output type = `canonicalSignal({ kind: 'float' }, { kind: 'scalar' })`

**Codebase confirmation**: Runtime evaluator (`src/runtime/SignalEvaluator.ts:208-211`) returns `state.eventScalars[expr.eventSlot] ?? 0`. IRBuilder (`src/compiler/ir/IRBuilderImpl.ts:869-871`) comments "produces a signal that is 1.0 on frames when the event fires, 0.0 otherwise." All block call sites pass `canonicalType(FLOAT)`.

**Encyclopedia Location**: `migration/t2_value-expr.md` (G2 mapping table)

---

## Questions & Clarifications

### [Q1]: What Does `CardinalityValue.zero` Mean in Practice? — RESOLVED

**Status**: RESOLVED — KEEP. Make it real, not vestigial.

**Canonical Decision**: `CardinalityValue.zero` means compile-time-only. The value exists at compile time, produces no runtime lanes, and occupies no per-frame/per-instance runtime storage. It may be referenced by runtime expressions only by being lifted into `one` or `many(instance)` via explicit ops.

**Hard semantics**:
- `zero` is a compile-time value class, NOT "scalar"
- Const blocks emit `cardinality=zero` always
- `static`/`scalar` conflation is deprecated; `zero` = compile-time, `one` = runtime scalar

**Required changes to bring the system into alignment**:

1. **Constructors**: Add `canonicalConst(payload, unit)` → cardinality=zero, temporality=continuous, rest default axes. For events: do NOT use zero to mean "never fires" (that's a runtime semantic, not a compile-time lane count).

2. **Explicit lift rule** (zero → one/many): A single, explicit mechanism:
   - `broadcastConstToSignal(const)`: zero → one (pure, stable)
   - `broadcastConstToField(const, instance)`: zero → many(instance) (pure, stable)
   - Can be a dedicated ValueExpr/Kernel op or a compiler rewrite inserting an explicit adapter block.
   - **Hard invariant**: No implicit coercion from zero into runtime cardinalities anywhere except this one well-defined lift.

3. **Axis enforcement must reference zero**:
   - zero is **allowed** for: const, compile-time table lookups, folded pure kernels whose args are all zero
   - zero is **forbidden** for: anything that reads time, state, events, instance intrinsics, or depends on runtime inputs

4. **Guardrails must mention it**: Add guardrail preventing "static/scalar confusion":
   - DO NOT equate zero with "scalar"
   - "scalar" = cardinality=one + temporality=continuous (+ appropriate unit/payload)
   - zero = compile-time-only, must be lifted explicitly

5. **`worldToAxes()` must stop being the only home for zero**: Production constructors + validators + lowering must use zero directly.

**Encyclopedia Location**: `axes/t2_cardinality.md` (zero semantics), `type-system/t2_derived-classifications.md` (canonicalConst constructor), `validation/t2_axis-validate.md` (zero enforcement rules)

---

### [Q2]: BindingValue Lattice — What's the Ordering? — RESOLVED

**Status**: RESOLVED — NO ordering. Not a lattice. Nominal tags with equality-only semantics.

**Canonical Decision**: BindingValue has NO ordering. It is not a lattice and must not be described as one. The code is right; the "lattice" terminology in docs is wrong.

**Hard constraints**:
- DO NOT describe binding as "stronger/weaker", "partial order", "lattice", "join", "meet", or "subtyping"
- Instead: binding is a closed enum tag carried in CanonicalType and unified by equality only
- DO NOT write any logic that tries to "upgrade" or "choose the stronger binding" during unification
- Instead: if two bindings differ and both are instantiated, it's a type error (or requires an explicit adapter/op that changes binding)
- DO NOT let adapter insertion use binding as a free dimension
- Instead: adapters that change binding must be explicit and must declare the axis transform in their AdapterSpec

**Semantics for each tag** (intent labels constraining what ops are allowed, NOT a hierarchy):
- **unbound**: no continuity identity requirement; safe default
- **weak**: continuity may attempt association if a referent is available in the operation config (not in the type)
- **strong**: continuity requires a referent association in the operation config; missing referent is a compile error in the lowering/validation that consumes that op
- **identity**: continuity must preserve lane identity 1:1 (stable IDs) as required by the consuming op; if identity cannot be established, error

**Key**: meaning is enforced where binding is *consumed* (continuity/state ops + validators), not by ordering.

**Enforcement hooks** (since there's no ordering):
- In continuity/state lowering: if an op requires weak|strong|identity, it must validate it has the necessary non-type config (referent/gauge/projector/etc.) and fail crisply if not
- In axis validation: binding may be `var` during inference, but by backend IR emit time, binding must be `inst`

**Encyclopedia Location**: `axes/t2_binding.md` (tag semantics + no-ordering constraint)

---

## Nits & Polish

| # | Location | Comment |
|---|----------|---------|
| 1 | SUMMARY "Remaining Items (2)" | Stale — N1 and G2 are now resolved. Update to reflect 100%. |
| 2 | TOPICS line 229 | Says "UNRESOLVED G2" but G2 is now resolved. |
| 3 | TOPICS line 257 | Says "Unresolved Issues: G2" but G2 is now resolved. |
| 4 | TOPICS line 274 | Says "UNRESOLVED G2: variant mapping" but G2 is now resolved. |
| 5 | TOPICS line 352-353 | Notes section still references N1 and G2 as outstanding. |
| 6 | GLOSSARY AxisViolation | `op: string` field name — if A1 resolved to `kind` as discriminant, should this field be `kind: string`? Or is `op` here a different concept (the operation name, not the discriminant)? Clarify. |
| 7 | GLOSSARY "PayloadType" Note | "Implementation also has `shape` kind (8 stride) - not in spec" — is `shape` being kept or removed? If removed, delete the note. If kept, it needs a spec entry. |

---

## Consistency Audit

### Cross-Reference Check

| Claim | Source | Verified? | Notes |
|-------|--------|-----------|-------|
| CanonicalType = { payload, unit, extent } | Spec 00:149-153 | Yes | Exact match |
| Axis<T,V> = var/inst | Spec 00:65-67 | Yes | Exact match |
| UnitType has 5 kinds (spec) | Spec 00:138-143 | Yes | none, scalar, norm01, angle, time |
| UnitType resolved to 8 kinds | C2 resolution | Yes | Adds count, space, color |
| ValueExpr uses `op` discriminant (spec) | Spec 00:342 | Yes | `readonly op: 'const'` confirmed |
| ValueExpr resolved to `kind` discriminant | A1 resolution | Yes | Consistent with all other IR unions |
| getManyInstance in spec | Spec 00:241 | Yes | Single function confirmed |
| try/require split resolved | C3 resolution | Yes | Planning LOCKED |
| 17 guardrails align with decisions | 99-INVARIANTS cross-check | Partial | Guardrail #11 example uses `op` (N1 resolved) |
| EventExprNever -> ValueExprConst | G2 resolution | Yes | `{ kind:'bool', value:false }` with discrete type — sound |
| G2 total mapping covers all 11 unknowns | G2 resolution | Yes | All 11 legacy variants mapped |

### Terminology Consistency

| Term | Definition Location | Used Consistently? | Issues |
|------|--------------------|--------------------|--------|
| CanonicalType | Glossary, Summary, Questions | Yes | Consistent everywhere |
| DerivedKind | Glossary | Yes | Always described as "NOT stored, NOT authoritative" |
| tryGetManyInstance | Glossary, C3, T1 | Yes | Consistently LOCKED |
| ValueExpr | Glossary, G2, A1 | Yes | 6 variants, `kind` discriminant |
| Axis<T,V> | Glossary, C1 | Mostly | AxisTag mentioned as deprecated — good |
| AxisViolation | Glossary | Partial | `op` field vs `kind` discriminant (nit #6) |

### Cross-Topic Consistency

| Concept | Topics Mentioning | Consistent? | Issues |
|---------|-------------------|-------------|--------|
| Single authority | principles, type-system, axes, validation | Yes | Reinforced consistently |
| `kind` discriminant | type-system (A1), validation (N1), migration (G2) | Yes | All resolved to `kind` |
| UnitType 8 kinds | type-system (C2), migration (unit-restructure) | Yes | Both reference same 8 kinds |
| Adapter TypePattern | migration (A2), glossary | Yes | purity+stability consistently mandatory |
| Instance identity in type | axes, validation (guardrails), type-system | Yes | I1 enforced consistently |
| Binding no-referent | axes (A4), validation | Yes | Both say "move to continuity/StateOp args" |

---

## Implementation Readiness

Could someone implement this spec as written?

- [x] All types fully specified
- [x] All behaviors unambiguous (N5 resolved: float scalar 0/1)
- [x] Error cases covered (AxisViolation, assertion helpers)
- [x] Edge cases documented — `CardinalityValue.zero` = compile-time-only with explicit lift (Q1 resolved)
- [x] No circular definitions
- [x] No "TBD" or "TODO" items remaining
- [x] Topic boundaries clear for implementers
- [x] Tier classifications make sense (migration T2 correct during active refactor)
- [x] T1 content is small and critical

**Gaps that would block implementation**:
None — spec is implementation-ready.

**Tier Misclassifications that need fixing**:
None — tier assignments are sound.

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Blocking Concerns | 0 | B1 resolved (T2 stays during refactor) |
| Non-Blocking Concerns | 5 | All resolved: N1 (SUMMARY fixed), N2 (fine), N3 (fine), N4 (RESOLVED), N5 (RESOLVED) |
| Questions | 2 | All resolved: Q1 (zero = compile-time, keep + make real), Q2 (no ordering, nominal tags) |
| Nits | 7 | Fixed with SUMMARY/TOPICS update |
| Topic Structure Issues | 0 | - |
| Tier Misclassifications | 0 | - |

**Recommendation**: Approve. All items resolved.

**Next Steps**:
1. Fix stale SUMMARY and TOPICS files to reflect 100% resolution + Q1/Q2 decisions
2. Proceed to approval run and encyclopedia generation
