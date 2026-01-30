---
scope: full
spec_source: design-docs/canonical-types/
impl_source: src/
generated: 2026-01-29T00:13:08Z
previous_run: 2026-01-29T00:03:26Z — added reference docs
topics_audited: 8
totals: { trivial: 3, critical: 8, to-review: 0, unimplemented: 5, done: 6 }
---

# Gap Analysis: CanonicalType System Migration (FINAL)

## Reference Documents

**Read these during implementation planning:**

| Doc | Path | Purpose |
|-----|------|---------|
| Exhaustive Type System | `design-docs/canonical-types/00-exhaustive-type-system.md` | **AUTHORITATIVE** — complete reference implementation |
| Core Spec | `design-docs/canonical-types/01-CanonicalTypes.md` | CanonicalType as the whole truth |
| Migration Path | `design-docs/canonical-types/02-How-To-Get-There.md` | Phased migration without rewrite |
| Current Analysis | `design-docs/canonical-types/03-Types-Analysis.md` | Analysis of current types.ts |
| Consolidation | `design-docs/canonical-types/04-CanonicalTypes-Analysis.md` | How to combine overlapping types |
| Definition of Done | `design-docs/canonical-types/06-DefinitionOfDone-90%.md` | 90% complete checklist |
| Naming Convention | `design-docs/canonical-types/09-NamingConvention.md` | How to name new types (ValueExpr*, not Signal*) |
| Rules for New Types | `design-docs/canonical-types/10-RulesForNewTypes.md` | 12 rules to prevent "old world" leakage |
| **5-Axes Conclusion** | `design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md` | **FINAL CONTRACT** — axis semantics, hard invariants, traps to avoid |

## Executive Summary

The CanonicalType infrastructure is **mostly in place** but the system is not yet axis-complete. Critical corrections:

1. **Don't duplicate authority** — instanceId on FieldExpr nodes must be REMOVED. Derive via canonical helper `getManyInstance(type)`.
2. **Fix layering** — branded IDs in `core/ids.ts` is THE source of truth. Any other import path is migration smell.
3. **EventExpr invariants are hard rules** — payload=bool, unit=none, temporality=discrete.
4. **Axis validation is a pure checker** — only axis-shape validity, nothing else. Produces `AxisInvalid` diagnostic.
5. **ConstValue is a discriminated union** — keyed by payload kind, NOT `number|string|boolean`.

## Axis Meanings (5-Axes Summary)

**Reference**: `design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md` lines 18-51

| Axis | Values | Meaning |
|------|--------|---------|
| **Cardinality** | `zero \| one \| many(instanceRef)` | How many lanes/elements. Instance identity lives ONLY here. |
| **Temporality** | `continuous \| discrete` | Which evaluation clock. Discrete = "present only on ticks" |
| **Binding** | `unbound \| weak \| strong \| identity` | How values attach to identity across time/edits |
| **Perspective** | `default \| perspectiveId` | Which view-space interpretation (camera/viewpoint semantics) |
| **Branch** | `main \| preview:id \| checkpoint:id \| ...` | Which history line. Makes preview/undo safe. |

**Derived classifications** (NOT stored, NOT authoritative):
- `event` ⇢ temporality = discrete
- `field` ⇢ cardinality = many(instance)  
- `signal` ⇢ otherwise (typically one, continuous)

## Priority Work Queue

### P1: Critical — No Dependencies (start immediately)
| # | Item | Topic | Description | Context File |
|---|------|-------|-------------|--------------|
| 1 | C-1 | EventExpr Typing | Add `type: CanonicalType` with hard invariants: payload=bool, unit=none, temporality=discrete | critical/topic-01-types.md |
| 2 | C-2 | Shared IDs Module | Create `core/ids.ts` as THE source of truth. See `00-exhaustive-type-system.md` for exact implementation. | critical/topic-01-types.md |
| 3 | C-3 | reduce_field Naming | Rename 'reduce_field' → 'reduceField' | critical/topic-01-types.md |
| 4 | C-7 | Delete FieldExprArray | Remove placeholder with no defined semantics — poison for "CanonicalType only" | critical/topic-01-types.md |

### P2: Critical — Has Dependencies
| # | Item | Topic | Blocked By | Context File |
|---|------|-------|------------|--------------|
| 5 | C-4 | Axis Enforcement | Pure validation pass: axis-shape checks ONLY. See `00-exhaustive-type-system.md` axis-validate.ts | blocked by #1 | critical/topic-02-axes.md |
| 6 | C-5 | Remove instanceId from FieldExpr | REMOVE instanceId from FieldExprMap/Zip/ZipSig. Add canonical `getManyInstance(type)` helper | blocked by #1, #2 | critical/topic-01-types.md |
| 7 | C-6 | instanceId string→InstanceId | Fix string leakage in Steps after C-2 creates shared IDs | blocked by #2 | critical/topic-01-types.md |
| 8 | C-8 | ConstValue Discriminated Union | Replace `number|string|boolean` with discriminated union keyed by payload kind. See `00-exhaustive-type-system.md` ConstValue | blocked by #5 | critical/topic-01-types.md |

### P3: To-Review — RESOLVED
All items resolved into critical fixes.

### P4: Unimplemented — GATED by C-4
| # | Item | Topic | Gate | Context File |
|---|------|-------|------|--------------|
| 9 | U-1 | ValueExpr IR | **MUST NOT START until C-4 is implemented and passing**. See `00-exhaustive-type-system.md` value-expr.ts | unimplemented/topic-03-valueexpr.md |

### P5: Unimplemented — Standalone (after P1-P4 resolved)
| # | Item | Topic | Description | Context File |
|---|------|-------|-------------|--------------|
| 10 | U-2 | Discrete Temporality Runtime | Implement tickIndex/stamps. Define Clock/Tick concepts in RuntimeState early | unimplemented/topic-04-discrete.md |
| 11 | U-3 | StepEvalValue Unification | Replace StepEvalSig + StepSlotWriteStrided with unified step | unimplemented/topic-03-valueexpr.md |
| 12 | U-4 | Rename signalType* Helpers | Rename signalTypeSignal/Field/Trigger → canonicalSignal/Field/Trigger | unimplemented/topic-05-naming.md |
| 13 | U-5 | Quarantine worldToAxes | Move worldToAxes to legacy module | unimplemented/topic-05-naming.md |

### Trivial (cosmetic, no action unless cleanup pass)
- 3 items in trivial/topic-01-naming.md

## Dependency Graph

```
C-2 (shared IDs) ──enables──> C-5 (remove instanceId, add getManyInstance helper)
                 ──enables──> C-6 (fix string leakage)

C-1 (EventExpr typing) ──enables──> C-4 (axis enforcement)
                       ──enables──> C-5 (can derive instance from type)

C-4 (axis enforcement) ──enables──> C-8 (ConstValue discriminated union)
                       ──GATES──> U-1 (ValueExpr IR — MUST NOT START until C-4 passing)

C-7 (delete FieldExprArray) — no dependencies, do in P1
```

## Key Architectural Decisions

### 1. core/ids.ts IS THE SOURCE OF TRUTH

**Reference**: `design-docs/canonical-types/00-exhaustive-type-system.md` lines 1-37

```typescript
// src/core/ids.ts — THE authoritative location for branded ID types
export type Brand<K, T extends string> = K & { readonly __brand: T };

export type InstanceId   = Brand<string, 'InstanceId'>;
export type DomainTypeId = Brand<string, 'DomainTypeId'>;
export type BlockId      = Brand<string, 'BlockId'>;
// ... etc

export const instanceId   = (s: string) => s as InstanceId;
```

**Invariant**: Any file importing InstanceId from somewhere other than core/ids.ts is **migration smell to eliminate**.

### 2. CONSTVALUE IS A DISCRIMINATED UNION

**Reference**: `design-docs/canonical-types/00-exhaustive-type-system.md` lines 275-293

```typescript
// NOT: number | string | boolean
// YES: Discriminated union keyed by payload kind
export type ConstValue =
  | { readonly kind: 'float'; readonly value: number }
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'vec2'; readonly value: readonly [number, number] }
  | { readonly kind: 'vec3'; readonly value: readonly [number, number, number] }
  | { readonly kind: 'color'; readonly value: readonly [number, number, number, number] }
  | { readonly kind: 'cameraProjection'; readonly value: string };

export function constValueMatchesPayload(payload: PayloadType, v: ConstValue): boolean {
  return payload.kind === v.kind;
}
```

### 3. CANONICAL HELPER FOR INSTANCE DERIVATION

**Reference**: `design-docs/canonical-types/00-exhaustive-type-system.md` lines 230-235

```typescript
export function getManyInstance(t: CanonicalType): InstanceRef | null {
  const card = t.extent.cardinality;
  if (card.kind !== 'inst') return null;
  if (card.value.kind !== 'many') return null;
  return card.value.instance;
}
```

### 4. AXIS ENFORCEMENT SCOPE (C-4)

**Reference**: `design-docs/canonical-types/00-exhaustive-type-system.md` lines 394-461

The validation pass is a **pure checker** with constrained scope:

**MUST check**:
1. Axis-shape validity per expression family (Sig/Field/Event)
2. Axis-shape validity per expression kind (e.g., time → continuous signal)

**MUST NOT do**:
- Type inference
- Adapter insertion  
- Scheduling/cycle legality
- Any "helpful coercions"
- Any backend-only legality rules

**Output**: Single consolidated diagnostic category `AxisInvalid`.

### 5. NAMING CONVENTION

**Reference**: `design-docs/canonical-types/09-NamingConvention.md`

- Union name: `<Domain><Role>` → `ValueExpr`, `CompileStep`, `CanonicalType`
- Variant name: `<UnionName><Op>` → `ValueExprConst`, `ValueExprZip`
- No "Expr" and "Expression" both — pick `Expr` everywhere
- **Never prefix variants with signal/field/event** unless the union itself is that family

### 6. RULES FOR NEW TYPES

**Reference**: `design-docs/canonical-types/10-RulesForNewTypes.md`

12 rules to prevent "old world" leakage:
1. There is only one semantic type carrier: `CanonicalType`
2. No "signal/field/event" encoded in names or enums
3. Extent axes must be total and non-contradictory
4. Axis meaning is enforced by invariants
5. Payload and unit are inseparable contracts
6. Literal representation must be payload-shaped
7. Don't store derived info in CanonicalType
8. Every conversion across axes must be explicit
9. "Default" is temporary, not semantic
10. Adding a new axis is forbidden without audit
11. Cardinality and temporality are orthogonal
12. New type work isn't done until used end-to-end

### 7. DEFINITION OF DONE (90%)

**Reference**: `design-docs/canonical-types/06-DefinitionOfDone-90%.md`

Checklist for 90-95% complete:
- [ ] A. Type surface-area: exactly one canonical type shape (CanonicalType)
- [ ] B. Derived labels not stored: no `kind: 'sig'|'field'|'event'` as authoritative
- [ ] C. Constraint solving: frontend produces TypedPatch, backend does no inference
- [ ] D. Defaults quarantined: only at creation-time, not fallback
- [ ] E. Compatibility purely type-based: `isTypeCompatible(from, to)`
- [ ] F. Mechanical refactors complete: old helpers are thin wrappers or removed

### 8. U-1 GATING CONDITION

**U-1 (ValueExpr IR) MUST NOT START until C-4 is implemented and passing.**

Rationale: Otherwise you'll implement ValueExpr lowering while the frontend can still emit invalid axis combinations.

### 9. U-2 CLOCK/TICK CONCEPTS

Even if tick==frame today, define the concepts early:

```typescript
interface ClockState {
  frameIndex: number;  // Continuous clock
  tickIndex: number;   // Discrete clock (may equal frameIndex in v0)
}
```

### 10. FIVE HARD INVARIANTS (from 15-FiveAxesTypeSystem-Conclusion.md)

**Reference**: `design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md` lines 69-100

| Invariant | Rule |
|-----------|------|
| **I1. Single authority** | No field may duplicate type authority. Example: `FieldExprMap.instanceId` is forbidden — derive from `expr.type.extent.cardinality` |
| **I2. Only explicit ops change axes** | If something changes perspective/branch/cardinality/temporality/binding, it must be an explicit block/op visible to compiler and UI |
| **I3. Axis enforcement is centralized** | Exactly one canonical enforcement gate (frontend validation pass) after normalization, inference, and type assignment |
| **I4. State is scoped by axes** | State storage must be keyed by branch and (if field) instance lane identity; continuity decisions consult binding |
| **I5. Const literal shape matches payload** | `ConstValue` must be discriminated union keyed by payload kind |

### 11. COMMON TRAPS TO AVOID

**Reference**: `design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md` lines 103-128

| Trap | Why it breaks the system |
|------|--------------------------|
| **T1**: "Just store instanceId here for convenience" | Creates two authorities that will drift. Derive it instead. |
| **T2**: "Events are just signals with a flag" | Without temporality=discrete enforcement, special cases accumulate everywhere |
| **T3**: "Branch is only for undo UI" | If branch isn't in type system, preview/physics/undo will leak into each other via caches |
| **T4**: "Perspective is just renderer mode" | Perspective is a semantic axis for spatial values, not WebGL vs Canvas |
| **T5**: "Validation in builders is enough" | Builder assertions are not the canonical enforcement point — need single pass |
| **T6**: "Default axis values are fine" | Defaults are fine only if they canonicalize deterministically |

### 12. DEFINITION OF DONE FOR AXIS-COMPLETENESS

**Reference**: `design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md` lines 183-193

You're **done** only when:
1. Every value-producing thing carries `CanonicalType` (including events)
2. No type authority is duplicated (no stray instanceId/branch flags anywhere)
3. There is one canonical frontend validation gate, and backend refuses invalid IR
4. All stateful runtime storage is keyed by branch and respects lane identity
5. All conversions that change semantics are explicit blocks/ops (including adapters)
6. Serialization round-trips all axis identities (especially branch/perspective ids) without loss

---

## Files Summary

```
.agent_planning/gap-analysis/
├── SUMMARY.md              # This file (FINAL)
├── trivial/
│   └── topic-01-naming.md  # Helper function naming conventions
├── critical/
│   ├── topic-01-types.md   # EventExpr, shared IDs, remove instanceId, ConstValue
│   ├── topic-02-axes.md    # Axis enforcement (pure checker, constrained scope)
│   └── context-01-types.md # Implementer briefing
└── unimplemented/
    ├── topic-03-valueexpr.md  # ValueExpr IR (GATED by C-4)
    ├── topic-04-discrete.md   # Discrete runtime + Clock/Tick concepts
    └── topic-05-naming.md     # Rename helpers, quarantine worldToAxes
```

## Next Steps

1. **Read**: `design-docs/canonical-types/00-exhaustive-type-system.md` — authoritative reference
2. **Fix**: C-2 (shared IDs) + C-7 (delete FieldExprArray) — both P1, no deps
3. **Fix**: C-1 (EventExpr typing with hard invariants)
4. **Fix**: C-5 (REMOVE instanceId, add `getManyInstance` helper)
5. **Fix**: C-4 (axis enforcement — pure checker only)
6. **Gate**: U-1 cannot start until C-4 passes
7. **Plan**: `/do:plan C-2` to create core/ids.ts
