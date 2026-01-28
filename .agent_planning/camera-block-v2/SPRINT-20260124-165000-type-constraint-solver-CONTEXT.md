# Implementation Context: type-constraint-solver

## Architecture Overview

The current pass ordering is:
```
pass0 (polymorphic types) → pass1 (default sources) → pass2 (adapters) → pass3 (indexing) → compiler
```

The new pass ordering will be:
```
pass0 (structural only) → pass1 (default sources) → pass0.5 (constraint solve) → pass2 (adapters) → pass3 (indexing) → compiler
```

**Key insight**: Default sources must be materialized BEFORE constraint solving so the solver sees explicit edges.

## Constraint Solver Algorithm

### Phase 1: Initialize Known Types
```
for each block in graph:
  for each port in block:
    if port.type is monomorphic:
      knownTypes[block:port] = port.type
    else:
      knownTypes[block:port] = TypeVar(payload=?, unit=?)
```

### Phase 2: Collect Constraints from Edges
```
for each edge in graph:
  add constraint: Type(fromBlock:fromPort) == Type(toBlock:toPort)
```

### Phase 3: Unification (Propagation)
```
repeat until no changes:
  for each constraint (A == B):
    if A is known and B is TypeVar:
      B := A
    if B is known and A is TypeVar:
      A := B
    if both known and A != B:
      ERROR: conflicting types
```

### Phase 4: Validate All Resolved
```
for each polymorphic port:
  if still TypeVar:
    ERROR: unconstrained type (with diagnostic)
```

## Key Files to Modify

### 1. `src/core/canonical-types.ts`

Add:
```typescript
export type Unit =
  | { kind: 'none' }
  | { kind: 'scalar' }
  | { kind: 'phase01' }
  // ... existing ...
  | { kind: 'var'; id: string };  // NEW: unresolved unit variable

export function unitVar(id?: string): Unit {
  return { kind: 'var', id: id ?? crypto.randomUUID() };
}

export function isUnitVar(unit: Unit): boolean {
  return unit.kind === 'var';
}
```

### 2. `src/blocks/signal-blocks.ts` (Const block)

Change:
```typescript
outputs: {
  out: { label: 'Output', type: canonicalType('float', unitVar()) }
}
```

This makes Const's output unit a variable that MUST be resolved.

### 3. `src/graph/passes/pass0.5-type-constraints.ts` (NEW)

```typescript
export interface ResolvedTypes {
  readonly portTypes: ReadonlyMap<string, CanonicalType>;  // "blockId:portName" → type
}

export function pass05TypeConstraints(patch: Patch): ResolvedTypes {
  // 1. Initialize type variables
  // 2. Collect edge constraints
  // 3. Unify
  // 4. Check all resolved
  // 5. Return resolved types
}
```

### 4. `src/compiler/passes-v2/pass2-types.ts`

Modify `getPortType()`:
```typescript
function getPortType(
  block: Block,
  portId: string,
  resolvedTypes: ResolvedTypes  // NEW parameter
): CanonicalType | null {
  // Check resolved types first
  const key = `${block.id}:${portId}`;
  const resolved = resolvedTypes.portTypes.get(key);
  if (resolved) return resolved;

  // Fall back to definition for monomorphic ports only
  const def = getBlockDefinition(block.type);
  const portDef = def.inputs[portId] ?? def.outputs[portId];
  if (!portDef?.type) return null;

  // If definition is polymorphic but not resolved → error
  if (isUnitVar(portDef.type.unit)) {
    throw new Error(`Unresolved unit variable for ${block.type}.${portId}`);
  }

  return portDef.type;
}
```

## Test Expectations

### Before (current failures)
```
Type mismatch: cannot connect one+continuous<float, unit:scalar> to one+continuous<float, unit:phase01>
```

### After (with solver)
```
Compilation succeeds because:
- Const.out resolved to float<phase01> (from FieldHueFromPhase.phase constraint)
- Const.out resolved to float<deg> (from Camera.tiltDeg constraint)
```

### New failure mode (unconstrained)
```
Error: Unresolved type for Const.out
  Block: Const (id: block_123)
  Port: out
  Reason: No connected edge constrains this port's unit
  Fix: Connect to a typed input, or set explicit unit on the Const block
```

## Edge Cases

1. **Multiple outputs from same Const**: All must agree (constraint conflict if not)
2. **Chain of generics**: A→B→C where all are generic, but C connects to concrete → propagates back
3. **Adapters**: If adapter insertion happens AFTER solving, solver sees direct edge (correct)
4. **Default sources**: Materialized as Const blocks with `payloadType` but not `unit` → solver resolves unit

## Migration Path

1. First: Remove fallback (P0) — tests fail loudly
2. Second: Add UnitVar to Const (P1) — tests still fail but with new error
3. Third: Implement solver (P2) — tests start passing
4. Fourth: Integrate (P3) — all tests pass
