# Implementation Plan: payloadVar System

## Overview

Create a `payloadVar` system parallel to `unitVar` for true payload polymorphism with constraint solving.

## Architecture

### Current Flow
```
Pass 0: Payload inference (stores in block.params.payloadType)
Pass 1: Unit constraint solving (stores in resolvedPortTypes map)
Pass 2: Type validation (reads from both, applies payload from params)
```

### Proposed Flow
```
Pass 1: BOTH payload AND unit constraint solving
  - PayloadUnionFind for payload constraints
  - UnitUnionFind for unit constraints (existing)
  - Stores both in resolvedPortTypes map
Pass 2: Type validation (reads resolved types from map)
```

---

## Implementation Steps

### Step 1: Type System Extensions (canonical-types.ts)

**1.1 Update PayloadType union to include variables**

```typescript
// Before (line 150-158):
export type PayloadType =
  | 'float' | 'int' | 'vec2' | 'vec3' | 'color' | 'bool' | 'shape' | 'cameraProjection';

// After:
export type PayloadType =
  | 'float' | 'int' | 'vec2' | 'vec3' | 'color' | 'bool' | 'shape' | 'cameraProjection'
  | { readonly kind: 'var'; readonly id: string };  // Unresolved payload variable
```

**1.2 Add payloadVar() factory**

```typescript
let payloadVarCounter = 0;

/**
 * Create an unresolved payload variable.
 * Payload variables MUST be resolved by the constraint solver before compilation.
 */
export function payloadVar(id?: string): PayloadType {
  return { kind: 'var', id: id ?? `_pv${payloadVarCounter++}` };
}
```

**1.3 Add helper functions**

```typescript
/**
 * Check if a payload is an unresolved variable.
 */
export function isPayloadVar(payload: PayloadType): payload is { kind: 'var'; id: string } {
  return typeof payload === 'object' && payload !== null && payload.kind === 'var';
}

/**
 * Compare two payloads for equality.
 */
export function payloadsEqual(a: PayloadType, b: PayloadType): boolean {
  if (isPayloadVar(a) && isPayloadVar(b)) {
    return a.id === b.id;
  }
  if (isPayloadVar(a) || isPayloadVar(b)) {
    return false;  // One is var, other is concrete
  }
  return a === b;  // Both concrete strings
}

/**
 * Get concrete payload types (excludes variables).
 */
export function isConcretePayload(payload: PayloadType): payload is string {
  return typeof payload === 'string';
}
```

**1.4 Export from module**

Add to exports: `payloadVar`, `isPayloadVar`, `payloadsEqual`, `isConcretePayload`

---

### Step 2: Registry Updates (registry.ts)

**2.1 Update ALL_CONCRETE_PAYLOADS type annotation**

No change needed—already `readonly PayloadType[]` and only contains concrete strings.

**2.2 Update isPayloadAllowed() to handle payloadVar**

```typescript
export function isPayloadAllowed(blockType: string, portId: string, payload: PayloadType): boolean {
  // Payload variables are always "allowed" during definition - they get resolved later
  if (isPayloadVar(payload)) return true;

  const meta = getBlockPayloadMetadata(blockType);
  // ... existing logic
}
```

---

### Step 3: Pass 1 Payload Constraint Solving (pass1-type-constraints.ts)

**3.1 Add PayloadUnionFind class** (parallel to UnitUnionFind)

```typescript
class PayloadUnionFind {
  private parent: Map<string, string | PayloadType> = new Map();

  find(payload: PayloadType): PayloadType {
    if (!isPayloadVar(payload)) return payload;  // Concrete

    const id = payload.id;
    const p = this.parent.get(id);

    if (p === undefined) return payload;  // Unbound variable

    if (typeof p === 'string') {
      // Parent is another variable ID - follow chain
      const root = this.find({ kind: 'var', id: p });
      // Path compression
      if (isPayloadVar(root)) {
        this.parent.set(id, root.id);
      } else {
        this.parent.set(id, root);
      }
      return root;
    }

    return p;  // Parent is concrete payload
  }

  union(a: PayloadType, b: PayloadType): { ok: true } | { ok: false; conflict: [PayloadType, PayloadType] } {
    const rootA = this.find(a);
    const rootB = this.find(b);

    // Both concrete
    if (!isPayloadVar(rootA) && !isPayloadVar(rootB)) {
      if (rootA === rootB) return { ok: true };
      return { ok: false, conflict: [rootA, rootB] };
    }

    // One var, one concrete
    if (isPayloadVar(rootA) && !isPayloadVar(rootB)) {
      this.parent.set(rootA.id, rootB);
      return { ok: true };
    }
    if (isPayloadVar(rootB) && !isPayloadVar(rootA)) {
      this.parent.set(rootB.id, rootA);
      return { ok: true };
    }

    // Both vars - merge
    if (isPayloadVar(rootA) && isPayloadVar(rootB) && rootA.id !== rootB.id) {
      this.parent.set(rootA.id, rootB.id);
    }

    return { ok: true };
  }
}
```

**3.2 Update ResolvedTypesResult to include payload**

The existing `resolvedPortTypes` map stores `CanonicalType` which already includes `payload`. No structural change needed—just ensure we store the resolved payload in the CanonicalType.

**3.3 Update constraint solving phases**

**Phase 1: Identify polymorphic ports**
```typescript
// Add payload polymorphism detection alongside unit detection
if (outputDef.type) {
  const defPayload = outputDef.type.payload;
  const defUnit = outputDef.type.unit;

  const hasPayloadVar = isPayloadVar(defPayload);
  const hasUnitVar = isUnitVar(defUnit);

  if (hasPayloadVar || hasUnitVar) {
    const key = portKey(blockIndex, portName, 'out');
    const instanceType: CanonicalType = {
      ...outputDef.type,
      payload: hasPayloadVar ? payloadVar(key + ':payload') : defPayload,
      unit: hasUnitVar ? instanceUnitVar(blockIndex, portName, 'out') : defUnit,
    };
    polymorphicPorts.set(key, { block, blockIndex, portName, direction: 'out', type: instanceType });
  }
}
```

**Phase 2: Collect constraints**
```typescript
// For each edge, collect BOTH unit and payload constraints
const fromPayload = getEffectivePayload(fromDefType.payload, edge.fromBlock, edge.fromPort, 'out');
const toPayload = getEffectivePayload(toDefType.payload, edge.toBlock, edge.toPort, 'in');

const payloadResult = payloadUf.union(fromPayload, toPayload);
if (!payloadResult.ok) {
  errors.push({ kind: 'ConflictingPayloads', ... });
}

// Existing unit constraint logic
const unitResult = unitUf.union(fromUnit, toUnit);
// ...
```

**Phase 3: Resolution verification**
```typescript
for (const [key, info] of polymorphicPorts) {
  const resolvedPayload = payloadUf.find(info.type.payload);
  const resolvedUnit = unitUf.find(info.type.unit);

  // Check payload resolved
  if (isPayloadVar(resolvedPayload)) {
    errors.push({ kind: 'UnresolvedPayload', portKey: key, ... });
    continue;
  }

  // Check unit resolved
  if (isUnitVar(resolvedUnit)) {
    errors.push({ kind: 'UnresolvedUnit', portKey: key, ... });
    continue;
  }

  // Store fully resolved type
  resolvedPortTypes.set(key, {
    ...info.type,
    payload: resolvedPayload,
    unit: resolvedUnit,
  });
}
```

**3.4 Add helper function for effective payload**

```typescript
function getEffectivePayload(
  defPayload: PayloadType,
  blockIndex: BlockIndex,
  portName: string,
  direction: 'in' | 'out'
): PayloadType {
  if (isPayloadVar(defPayload)) {
    // Return per-instance payload variable
    return payloadVar(portKey(blockIndex, portName, direction) + ':payload');
  }
  return defPayload;  // Concrete payload
}
```

---

### Step 4: Pass 2 Updates (pass2-types.ts)

**4.1 Update getPortType() to use resolved payloads from map**

The existing logic already checks `resolvedPortTypes.get(key)` first, which will now contain the resolved payload. No major changes needed—just ensure error handling for unresolved payloadVar:

```typescript
// After getting type from definition
if (isPayloadVar(type.payload)) {
  throw new Error(`BUG: Polymorphic payload for ${block.type}.${portId} not resolved by pass1`);
}
```

**4.2 Remove or simplify payload specialization from params**

The existing `block.params?.payloadType` logic can be removed or made secondary, since constraint solving now handles payload resolution.

---

### Step 5: Update Broadcast Block (field-blocks.ts)

```typescript
// Before (lines 52, 61):
inputs: {
  signal: { label: 'Signal', type: canonicalType('float', unitVar('broadcast_in')) },
},
outputs: {
  field: { label: 'Field', type: signalTypeField('float', 'default', unitVar('broadcast_in')) },
},

// After:
inputs: {
  signal: { label: 'Signal', type: canonicalType(payloadVar('broadcast_payload'), unitVar('broadcast_in')) },
},
outputs: {
  field: { label: 'Field', type: signalTypeField(payloadVar('broadcast_payload'), 'default', unitVar('broadcast_in')) },
},
```

**Note:** Both input and output use the SAME payload variable ID (`'broadcast_payload'`) to ensure they unify to the same concrete payload.

---

### Step 6: Update canonicalType/signalTypeField Functions

**6.1 Update canonicalType() signature**

```typescript
// In canonical-types.ts
export function canonicalType(
  payload: PayloadType,  // Now accepts PayloadType (including payloadVar)
  unit?: Unit,
  extentOverrides?: Partial<Extent>
): CanonicalType {
  // Existing logic works - payload is just stored in the type
}
```

**6.2 Update signalTypeField() signature**

```typescript
export function signalTypeField(
  payload: PayloadType,  // Now accepts PayloadType (including payloadVar)
  instance: InstanceTag,
  unit?: Unit
): CanonicalType {
  // Existing logic works
}
```

---

### Step 7: Testing

**7.1 Unit tests for PayloadUnionFind**
- Test find() with concrete payloads
- Test find() with unbound variables
- Test union() concrete + concrete (same/different)
- Test union() var + concrete
- Test union() var + var
- Test path compression

**7.2 Integration tests for pass1 payload constraints**
- Test polymorphic port identification
- Test per-instance variable creation
- Test constraint propagation
- Test unresolved payload errors
- Test conflicting payload errors

**7.3 End-to-end test: Broadcast with vec3:world3**
```typescript
// Patch: FieldPolarToCartesian → Broadcast → RenderInstances2D
// Verify:
// - Broadcast.signal resolves to vec3:world3
// - Broadcast.field resolves to vec3:world3
// - No type mismatch errors
```

---

## File Change Summary

| File | Lines Changed | Type |
|------|--------------|------|
| `src/core/canonical-types.ts` | +40 | Type system |
| `src/compiler/passes-v2/pass1-type-constraints.ts` | +100 | Constraint solving |
| `src/compiler/passes-v2/pass2-types.ts` | +10 | Error handling |
| `src/blocks/field-blocks.ts` | +4 | Block definition |
| `src/blocks/registry.ts` | +5 | isPayloadAllowed update |

---

## Verification Checklist

- [ ] TypeScript compiles with no errors
- [ ] `payloadVar()` creates unresolved variables
- [ ] `isPayloadVar()` correctly identifies variables
- [ ] PayloadUnionFind resolves constraints
- [ ] Pass 1 identifies payload-polymorphic ports
- [ ] Pass 1 creates per-instance payload variables
- [ ] Pass 1 collects and solves payload constraints
- [ ] Pass 2 uses resolved payloads from map
- [ ] Broadcast block uses payloadVar in definition
- [ ] End-to-end: FieldPolarToCartesian → Broadcast works
- [ ] All existing tests pass
