---
scope: full
spec_source: design-docs/canonical-types/
impl_source: src/
generated: 2026-01-29T00:03:26Z
previous_run: 2026-01-28T23:48:09Z — tightened per review
topics_audited: 4
totals: { trivial: 3, critical: 8, to-review: 0, unimplemented: 5, done: 6 }
---

# Gap Analysis: CanonicalType System Migration (FINAL)

## Executive Summary

The CanonicalType infrastructure is **mostly in place** but the system is not yet axis-complete. Critical corrections:

1. **Don't duplicate authority** — instanceId on FieldExpr nodes must be REMOVED. Derive via canonical helper `getManyInstance(type)`.
2. **Fix layering** — branded IDs in `core/ids.ts` is THE source of truth. Any other import path is migration smell.
3. **EventExpr invariants are hard rules** — payload=bool, unit=none, temporality=discrete.
4. **Axis validation is a pure checker** — only axis-shape validity, nothing else. Produces `AxisInvalid` diagnostic.

## Priority Work Queue

### P1: Critical — No Dependencies (start immediately)
| # | Item | Topic | Description | Context File |
|---|------|-------|-------------|--------------|
| 1 | C-1 | EventExpr Typing | Add `type: CanonicalType` with hard invariants: payload=bool, unit=none, temporality=discrete | critical/topic-01-types.md |
| 2 | C-2 | Shared IDs Module | Create `core/ids.ts` as THE source of truth for branded IDs. Any import from elsewhere is migration smell. | critical/topic-01-types.md |
| 3 | C-3 | reduce_field Naming | Rename 'reduce_field' → 'reduceField' | critical/topic-01-types.md |
| 4 | C-7 | Delete FieldExprArray | Remove placeholder with no defined semantics — poison for "CanonicalType only" | critical/topic-01-types.md |

### P2: Critical — Has Dependencies
| # | Item | Topic | Blocked By | Context File |
|---|------|-------|------------|--------------|
| 5 | C-4 | Axis Enforcement | Pure validation pass: axis-shape checks ONLY. No inference, no adapters, no coercions. Produces AxisInvalid diagnostic. | blocked by #1 | critical/topic-02-axes.md |
| 6 | C-5 | Remove instanceId from FieldExpr | REMOVE instanceId from FieldExprMap/Zip/ZipSig. Add canonical `getManyInstance(type)` helper in canonical-types.ts | blocked by #1, #2 | critical/topic-01-types.md |
| 7 | C-6 | instanceId string→InstanceId | Fix string leakage in Steps after C-2 creates shared IDs | blocked by #2 | critical/topic-01-types.md |
| 8 | C-8 | SigExprConst Value Validation | Const value must be valid literal for payload. Rule: value representation is total function of type.payload | blocked by #5 | critical/topic-01-types.md |

### P3: To-Review — RESOLVED
All items resolved into critical fixes.

### P4: Unimplemented — GATED by C-4
| # | Item | Topic | Gate | Context File |
|---|------|-------|------|--------------|
| 9 | U-1 | ValueExpr IR | **MUST NOT START until C-4 is implemented and passing** — otherwise you'll build lowering that assumes validity while frontend still emits invalid shapes | unimplemented/topic-03-valueexpr.md |

### P5: Unimplemented — Standalone (after P1-P4 resolved)
| # | Item | Topic | Description | Context File |
|---|------|-------|-------------|--------------|
| 10 | U-2 | Discrete Temporality Runtime | Implement tickIndex/stamps. Define Clock/Tick concepts in RuntimeState early (even if tick==frame initially) | unimplemented/topic-04-discrete.md |
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

C-4 (axis enforcement) ──enables──> C-8 (const value validation)
                       ──GATES──> U-1 (ValueExpr IR — MUST NOT START until C-4 passing)

C-7 (delete FieldExprArray) — no dependencies, do in P1
```

## Key Architectural Decisions

### 1. core/ids.ts IS THE SOURCE OF TRUTH

```typescript
// src/core/ids.ts — THE authoritative location for branded ID types
// Contains ONLY: types + trivial brand constructors (casts)
// NO compiler-facing utilities

export type InstanceId = string & { readonly __brand: 'InstanceId' };
export type DomainTypeId = string & { readonly __brand: 'DomainTypeId' };

export function instanceId(s: string): InstanceId { return s as InstanceId; }
export function domainTypeId(s: string): DomainTypeId { return s as DomainTypeId; }
```

**Invariant**: If canonical-types.ts imports InstanceId from `./ids`, then every other file importing InstanceId from anywhere else is a **migration smell to eliminate**.

`src/compiler/ir/Indices.ts` may contain IR indexing helpers and re-exports, but must NOT be the source-of-truth for branded types.

### 2. CANONICAL HELPER FOR INSTANCE DERIVATION

Don't scatter "is it many(instance)?" checks everywhere. Add ONE canonical primitive in `canonical-types.ts`:

```typescript
// In src/core/canonical-types.ts

/**
 * Extract InstanceRef from a many-cardinality type.
 * Returns null if cardinality is not many(instance).
 */
export function getManyInstance(type: CanonicalType): InstanceRef | null {
  const card = type.extent.cardinality;
  if (card.kind !== 'instantiated') return null;
  if (card.value.kind !== 'many') return null;
  return card.value.instance;
}

/**
 * Assert and extract InstanceRef from a many-cardinality type.
 * Throws if cardinality is not many(instance).
 */
export function assertManyInstance(type: CanonicalType): InstanceRef {
  const instance = getManyInstance(type);
  if (!instance) {
    throw new Error('Expected many(instance) cardinality');
  }
  return instance;
}
```

Then axis enforcement, FieldExpr derivation, and any other consumer uses the same primitive.

### 3. AXIS ENFORCEMENT SCOPE (C-4)

The validation pass is a **pure checker** with constrained scope:

**MUST check**:
1. Axis-shape validity per expression family (Sig/Field/Event)
2. Axis-shape validity per expression kind (e.g., SigExprTime → continuous, EventExpr → discrete+bool+none)

**MUST NOT do**:
- Type inference
- Adapter insertion  
- Scheduling/cycle legality
- Any "helpful coercions"
- Any backend-only legality rules
- Duplicated authority checks (e.g., "FieldExpr must not contain instanceId" — that's compile-time TypeScript, not runtime)

**Output**: Single consolidated diagnostic category `AxisInvalid`.

### 4. CONST VALUE VALIDATION (C-8)

**The rule**: Const value representation must be a **total function of type.payload** (and only payload).

```typescript
function isValidConstValue(payload: PayloadType, value: unknown): boolean {
  if (isPayloadVar(payload)) return true; // Will be validated after resolution
  
  switch (payload.kind) {
    case 'float':
    case 'int':
      return typeof value === 'number';
    case 'bool':
      return typeof value === 'boolean';
    case 'cameraProjection':
      return typeof value === 'string'; // Enum literal
    case 'vec2':
      return isVec2Literal(value); // e.g., [number, number] or {x, y}
    case 'vec3':
      return isVec3Literal(value);
    case 'color':
      return isColorLiteral(value); // e.g., [r, g, b, a]
    case 'shape':
      return false; // Shapes are references, not literals
  }
}
```

**Note**: Vector/color consts are valid if payload says so. No prohibition on vec2/vec3/color consts — that would be a separate UX lint rule, not a correctness rule.

### 5. U-1 GATING CONDITION

**U-1 (ValueExpr IR) MUST NOT START until C-4 is implemented and passing.**

Rationale: Otherwise you'll implement ValueExpr lowering while the frontend can still emit invalid axis combinations. You'd build "lowering that assumes validity" and later discover the source IR was invalid.

### 6. U-2 CLOCK/TICK CONCEPTS

Even if tick==frame today, define the concepts early:

```typescript
// In RuntimeState (or similar)
interface ClockState {
  frameIndex: number;  // Continuous clock
  tickIndex: number;   // Discrete clock (may equal frameIndex in v0)
}
```

This prevents "discrete-ness" from being re-threaded through random places later.

---

## Files Summary

```
.agent_planning/gap-analysis/
├── SUMMARY.md              # This file (FINAL)
├── trivial/
│   └── topic-01-naming.md  # Helper function naming conventions
├── critical/
│   ├── topic-01-types.md   # EventExpr, shared IDs, remove instanceId, delete FieldExprArray
│   ├── topic-02-axes.md    # Axis enforcement (pure checker, constrained scope)
│   └── context-01-types.md # Implementer briefing
└── unimplemented/
    ├── topic-03-valueexpr.md  # ValueExpr IR (GATED by C-4)
    ├── topic-04-discrete.md   # Discrete runtime + Clock/Tick concepts
    └── topic-05-naming.md     # Rename helpers, quarantine worldToAxes
```

## Next Steps

1. **Fix**: C-2 (shared IDs module) + C-7 (delete FieldExprArray) — both P1, no deps
2. **Fix**: C-1 (EventExpr typing with hard invariants)
3. **Fix**: C-5 (REMOVE instanceId, add `getManyInstance` helper)
4. **Fix**: C-4 (axis enforcement — pure checker only)
5. **Gate**: U-1 cannot start until C-4 passes
6. **Plan**: `/do:plan C-2` to create core/ids.ts
