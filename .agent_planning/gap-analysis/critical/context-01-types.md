---
topic: 01
name: IR Type System Gaps
spec_file: design-docs/canonical-types/01-CanonicalTypes.md
category: critical
generated: 2026-01-29T00:03:26Z
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: [C-4, C-5, C-6]
priority: P1
---

# Context: Topic 01 — IR Type System Gaps (Critical) — FINAL

## What the Spec Requires

1. **CanonicalType is the ONLY type authority** — no duplicate storage of type info
2. Every value-producing expression carries `type: CanonicalType`
3. EventExpr has HARD INVARIANTS: payload=bool, unit=none, temporality=discrete
4. Branded IDs in `core/ids.ts` is THE source of truth — any other import path is migration smell
5. Instance identity via canonical helper `getManyInstance(type)` — NOT from separate field

## Current State (Topic-Level)

### How It Works Now

Three expression families: SigExpr, FieldExpr, EventExpr. SigExpr and FieldExpr carry `type: CanonicalType`. EventExpr does NOT. FieldExprMap/Zip/ZipSig have OPTIONAL `instanceId?` that duplicates authority. Branded IDs live in compiler IR.

### Patterns to Follow

- Expression types in `src/compiler/ir/types.ts`
- CanonicalType in `src/core/canonical-types.ts`
- **NEW**: Shared IDs in `src/core/ids.ts` (source of truth)
- **NEW**: Canonical helper `getManyInstance(type)` in canonical-types.ts

## Work Items

### WI-1: Create core/ids.ts (C-2)

**Category**: CRITICAL
**Priority**: P1 — foundation for all other fixes

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| src/core/ids.ts | NEW — THE source of truth for branded IDs | — |
| src/compiler/ir/Indices.ts | UPDATE — import types from core, keep factories | all |
| src/core/canonical-types.ts | UPDATE — import InstanceId from ./ids | L344 |

**Implementation**:
```typescript
// src/core/ids.ts — THE authoritative location
// Contains ONLY: types + trivial brand constructors
// NO compiler-facing utilities

export type InstanceId = string & { readonly __brand: 'InstanceId' };
export type DomainTypeId = string & { readonly __brand: 'DomainTypeId' };
export type NodeId = string & { readonly __brand: 'NodeId' };

export function instanceId(s: string): InstanceId { return s as InstanceId; }
export function domainTypeId(s: string): DomainTypeId { return s as DomainTypeId; }
```

**Invariant**: Any file importing InstanceId from somewhere other than core/ids.ts is migration smell to eliminate.

**Depends on**: none
**Blocks**: C-5, C-6

---

### WI-2: Add type: CanonicalType to EventExpr (C-1)

**Category**: CRITICAL
**Priority**: P1 — foundational for axis enforcement

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| src/compiler/ir/types.ts | EventExpr definitions | L323-354 |
| src/compiler/ir/IRBuilder.ts | EventExpr creation methods | L190-200 |
| src/compiler/ir/IRBuilderImpl.ts | EventExpr implementation | varies |

**HARD INVARIANTS (non-negotiable)**:
```typescript
// Every EventExpr.type MUST satisfy:
type.payload.kind === 'bool'      // fired/not-fired only
type.unit.kind === 'none'         // events don't have units
type.extent.temporality === { kind: 'instantiated', value: { kind: 'discrete' } }
// cardinality may be one OR many(instance)
```

**Depends on**: none (parallel with WI-1)
**Blocks**: C-4 (axis enforcement)

---

### WI-3: Add canonical getManyInstance helper + REMOVE instanceId (C-5)

**Category**: CRITICAL
**Priority**: P1 — don't build second type system

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| src/core/canonical-types.ts | ADD getManyInstance helper | — |
| src/compiler/ir/types.ts | REMOVE instanceId from FieldExprMap/Zip/ZipSig | L260-283 |

**Step 1: Add canonical helper in canonical-types.ts**:
```typescript
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

**Step 2: Remove instanceId from FieldExpr types**:
- Remove `instanceId?: InstanceId` from FieldExprMap
- Remove `instanceId?: InstanceId` from FieldExprZip
- Remove `instanceId?: InstanceId` from FieldExprZipSig

**Step 3: Update consumers to use helper**:
Search: `grep -r "\.instanceId" src/` for FieldExpr usages, replace with `assertManyInstance(expr.type)`

**Depends on**: WI-1 (shared IDs), WI-2 (pattern established)
**Blocks**: nothing

---

### WI-4: Delete FieldExprArray (C-7)

**Category**: CRITICAL  
**Priority**: P1 — no dependencies, do now

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| src/compiler/ir/types.ts | FieldExpr union | L285-289, L213 |

**Current state**: FieldExprArray with no storage semantics
**Required state**: Removed from union

**Before deleting**: `grep -r "FieldExprArray\|kind: 'array'" src/`

**Depends on**: none
**Blocks**: nothing
