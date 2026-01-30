I couldn’t apply edits via the file-edit tool (it errored), so here are exact, copy/paste-able patches you can apply manually.

Patch 1: CANONICALIZED-QUESTIONS-canonical-types-20260129-225309.md

1) Quick Wins table: mark L1/L2 resolved

Replace the two rows:

| L1 | Spec uses `getManyInstance` but planning locks `tryGetManyInstance` + `requireManyInstance` | Update spec to match planning (LOCKED) | UNRESOLVED | |
| L2 | Spec omits `count` from UnitType; planning adds it | Add `{ kind: 'count' }` to canonical UnitType | UNRESOLVED | |

with:

| L1 | Spec uses `getManyInstance` but planning locks `tryGetManyInstance` + `requireManyInstance` | Update spec to match planning (LOCKED) | RESOLVED | AGREE |
| L2 | Spec omits `count` from UnitType; planning adds it | Add `{ kind: 'count' }` to canonical UnitType | RESOLVED | AGREE |


⸻

2) C1: replace Options+Suggested Resolution, and resolve it

Inside C1, replace the entire - **Options**: block and the - **Suggested Resolution**: paragraph with:

- **Resolution (CANONICAL)**: Adopt spec-style axis polymorphism.

  Canonical axis representation:
    - `Axis<T, V> = { kind: 'var'; var: V } | { kind: 'inst'; value: T }`

  Constraints:
    - `AxisTag<T>` (`default`/`instantiated`) is deprecated and must not be used in core type definitions.
    - Any "default" semantics must be expressed via constructors/helpers that return an `Axis<...>` value (never a third axis variant).

Then change:

- **Status**: UNRESOLVED
- **Resolution**:

to:

- **Status**: RESOLVED
- **Resolution**: AGREE


⸻

3) C2: replace Options with canonical statement, and resolve it

Inside C2, replace the entire - **Options**: block with:

- **Resolution (CANONICAL)**: Use the planning's structured UnitType (8 kinds) and forbid unit variables inside `CanonicalType`.

  Canonical UnitType kinds:
    - `none`
    - `scalar`
    - `norm01`
    - `count`
    - `angle(radians|degrees|phase01)`
    - `time(ms|seconds)`
    - `space(ndc|world|view, dims:2|3)`
    - `color(rgba01)`

  Constraints:
    - No `{ kind: 'var' }` (or equivalent) is allowed inside canonical `UnitType`.
    - Unit variables (if needed) live only in inference-only wrappers.

Then change status+resolution to:

- **Status**: RESOLVED
- **Resolution**: AGREE


⸻

4) C3: replace Options+Suggested Resolution, and resolve it

Inside C3, replace the entire - **Options**: block and - **Suggested Resolution**: paragraph with:

- **Resolution (CANONICAL)**: Replace `getManyInstance` with two explicit helpers.

    - `tryGetManyInstance(t): InstanceRef | null` (never throws)
    - `requireManyInstance(t): InstanceRef` (throws crisp error)

  Constraint:
    - `getManyInstance` is deprecated; do not keep it as an alias.

Then set:

- **Status**: RESOLVED
- **Resolution**: AGREE


⸻

5) A1: enforce kind discriminant, and resolve it

Inside A1, replace the - **Suggested Resolution**: paragraph with:

- **Resolution (CANONICAL)**: Use `kind` as the discriminant for ValueExpr variants.

  Constraint:
    - All IR discriminated unions use `kind` (SigExpr/FieldExpr/EventExpr/Step/etc.). ValueExpr must match.

Then set:

- **Status**: RESOLVED
- **Resolution**: AGREE


⸻

6) A2: adopt full adapter restructure now, and resolve it

Inside A2, replace the - **Suggested Resolution**: block (the phased plan) with:

- **Resolution (CANONICAL)**: Adopt the full TypePattern/ExtentPattern/ExtentTransform adapter spec now.

  Canonical constraints:
    - Adapter matching is defined purely over CanonicalType patterns (payload/unit/extent).
    - Adapter metadata must not "permit" any type that fails axis rules; it only describes insertion of already-valid blocks.
    - `purity: 'pure'` and `stability: 'stable'` are mandatory fields (even if all current adapters satisfy them) to prevent future non-conforming adapters.
    - Adapter spec types live with block definitions (`src/blocks/`), not in graph normalization.

Then set:

- **Status**: RESOLVED
- **Resolution**: AGREE


⸻

7) A3: resolve

Set:

- **Status**: RESOLVED
- **Resolution**: AGREE


⸻

8) A4: specify referent landing zone, and resolve it

Inside A4, replace the - **Suggested Resolution**: paragraph with:

- **Resolution (CANONICAL)**: Referent data must not live in CanonicalType; it moves to state/continuity configuration.

  Landing zones:
    - **Continuity policies**: any "what prior thing am I preserving against" reference is expressed as explicit continuity config (e.g., `gauge`/`projector`/`post` args), not as an axis value.
    - **State/continuity ops**: any binding target/reference needed by stateful evaluation is carried as explicit args on `state` operations (or their lowering inputs), never embedded in the type lattice.

  Constraint:
    - Binding axis remains a closed lattice (`unbound | weak | strong | identity`) with no IDs, pointers, or referents.

Then set:

- **Status**: RESOLVED
- **Resolution**: AGREE


⸻

9) Terminology table: resolve T1/T2

Change the two rows’ Status to RESOLVED and Resolution to AGREE.

⸻

10) G1: resolve

Set:

- **Status**: RESOLVED
- **Resolution**: AGREE

(Leave G2 unresolved.)

⸻

11) Low-impact L1/L2 sections: resolve

In both L1 and L2 sections, set:

- **Status**: RESOLVED
- **Resolution**: AGREE


⸻

12) Cross-Reference Matrix table updates

Edit these rows:
•	Axis pattern row: change earlier planning cell to Adopt Axis<T,V> var/inst and set Agreement to AGREE (C1 resolved).
•	UnitType structure row: make it 8 structured in planning and set Agreement AGREE (C2 resolved).
•	ValueExpr discriminant row: set both spec/planning to kind and Agreement AGREE (A1 resolved).

⸻

13) Resolution Progress table: update counts

Set it to:

| Critical Contradictions | 3 | 3 | 0 |
| High-Impact Ambiguities | 4 | 4 | 0 |
| Terminology | 2 | 2 | 0 |
| Gaps | 2 | 1 | 1 |
| Low-Impact | 2 | 2 | 0 |
| **Total** | **13** | **12** | **1** |

And update the final line to:

**Progress: 92%**


⸻

Patch 2: CANONICALIZED-GLOSSARY-canonical-types-20260129-225309.md

1) Fix corrupted source_files entry

Find:

- <user__selection></user__selection>.agent_planning/canonical-type-system/SPRINT-20260129-012100-constructors-helpers-PLAN.md

Replace with:

- .agent_planning/canonical-type-system/SPRINT-20260129-012100-constructors-helpers-PLAN.md


⸻

2) UnitType: remove ⚠️ and mark resolved

Change heading:

### UnitType ⚠️

to:

### UnitType

Replace the **See**: line (or any “See QUESTIONS C2” line) with:

**Status**: RESOLVED (C2)

Keep the LOCKED line.

⸻

3) Axis Pattern: remove ⚠️ and mark resolved

Change:

## Axis Pattern ⚠️

to:

## Axis Pattern

In the Axis entry, replace:

**Implementation**: `AxisTag<T> = { kind: 'default' } | { kind: 'instantiated'; value: T }`
**See**: QUESTIONS C1 for resolution

with:

**Implementation**: `AxisTag<T>` is deprecated; canonical is `Axis<T, V>` (C1).
**Status**: RESOLVED (C1)


⸻

4) ValueExpr: remove ⚠️ and fix discriminant note

Change:

### ValueExpr ⚠️

to:

### ValueExpr

Replace:

**Note**: Uses `op` discriminant (not `kind`) — see QUESTIONS A1

with:

**Note**: Uses `kind` discriminant for consistency across IR unions (A1).


⸻

These edits make the “questions” doc internally consistent with the canonical decisions, and make the glossary stop advertising already-resolved contradictions as open ambiguity, while leaving the one genuinely unresolved mapping gap (G2) intact and explicit.