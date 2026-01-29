---
topic: 01
name: IR Type System Gaps
spec_file: design-docs/canonical-types/01-CanonicalTypes.md
category: critical
audited: 2026-01-28T23:48:09Z
item_count: 6
priority_reasoning: These issues violate the "CanonicalType and that's it" invariant
---

# Topic 01: IR Type System — Critical Gaps (CORRECTED)

## Items

### C-1: Add type: CanonicalType to EventExpr variants (HARD INVARIANTS)

**Problem**: EventExpr union members do not carry `type: CanonicalType`. This makes EventExpr the only expression family without complete typing.

**Evidence**: `src/compiler/ir/types.ts:323-354` — EventExpr variants only have `kind` and operation-specific fields.

**Hard rules for EventExpr CanonicalType**:
- `type.payload.kind === 'bool'` — fired/not-fired only, no float payloads
- `type.unit.kind === 'none'` — events don't have units
- `type.extent.temporality` must be discrete — definition of event
- `type.extent.cardinality` may be one OR many(instance) — per-lane events allowed

**These are non-negotiable invariants, not suggestions.**

---

### C-2: Create shared IDs module (core/ids.ts)

**Problem**: Branded ID types (InstanceId, DomainTypeId, etc.) live in `src/compiler/ir/Indices.ts`. Using them in `src/core/canonical-types.ts` would create a boundary violation: core types can't depend on compiler IR.

**Evidence**: 
- `src/core/canonical-types.ts:344` — InstanceRef.instanceId: string (should be InstanceId)
- `src/compiler/ir/Indices.ts:71` — InstanceId type defined in compiler module

**Correct fix**:
1. Create `src/core/ids.ts` with branded ID types
2. `canonical-types.ts` imports from `./ids`
3. `compiler/ir/Indices.ts` imports types from `../../core/ids`, keeps factory functions

---

### C-3: Rename 'reduce_field' to 'reduceField'

**Problem**: SigExprReduceField uses `kind: 'reduce_field'` (snake_case) while all other kinds use camelCase.

**Evidence**: `src/compiler/ir/types.ts:166` — `readonly kind: 'reduce_field'`

**Obvious fix?**: Yes. Rename and update all references.

---

### C-5: REMOVE instanceId from FieldExprMap/Zip/ZipSig (don't make required!)

**Problem**: FieldExprMap, FieldExprZip, FieldExprZipSig have `instanceId?: InstanceId`. This DUPLICATES authority away from CanonicalType.

**The instance is ALREADY in the type**:
```typescript
expr.type.extent.cardinality = { kind: 'many', instance: InstanceRef }
```

**Evidence**:
- `src/compiler/ir/types.ts:265` — FieldExprMap.instanceId?: InstanceId
- `src/compiler/ir/types.ts:273` — FieldExprZip.instanceId?: InstanceId  
- `src/compiler/ir/types.ts:282` — FieldExprZipSig.instanceId?: InstanceId

**Correct fix**: 
1. **REMOVE** instanceId field entirely from these types
2. Add derivation helper: `getInstanceFromFieldExpr(expr) → InstanceRef`
3. Enforce in validation: FieldExprMap output cardinality = input cardinality (same instance)
4. Enforce in validation: FieldExprZip requires all inputs share same many(instance)

**This is the single biggest "don't build a second type system" fix.**

---

### C-6: Fix remaining instanceId string leakage in Steps

**Problem**: After C-2, several Step types still use `instanceId: string`.

**Evidence**:
- `src/compiler/ir/types.ts:540` — StepMaterialize.instanceId: string
- `src/compiler/ir/types.ts:546` — StepRender.instanceId: string
- `src/compiler/ir/types.ts:587` — StepContinuityMapBuild.instanceId: string
- `src/compiler/ir/types.ts:598` — StepContinuityApply.instanceId: string
- `src/compiler/ir/types.ts:681` — StateMappingField.instanceId: string

**Fix**: Change to `instanceId: InstanceId` after C-2 creates shared IDs module.

---

### C-7: Delete FieldExprArray (no defined semantics = poison)

**Problem**: FieldExprArray has `instanceId` and `type` but no storage backing (slot, channel, state). It's a placeholder with no semantics.

**Evidence**: `src/compiler/ir/types.ts:285-289`

**Why this is critical**: Placeholders without defined semantics become excuses to bypass CanonicalType later. If it can't be described with CanonicalType + clearly-defined runtime storage, it doesn't belong.

**Fix**: Delete FieldExprArray from the union until it has:
- Concrete backing store reference
- Lifetime rules
- Runtime storage contract

---

### C-8: SigExprConst Value Validation — value must be valid literal for payload

**Problem**: `SigExprConst.value: number | string | boolean` allows any value regardless of `type.payload`.

**Evidence**: `src/compiler/ir/types.ts:98` — value type disconnected from payload type

**The rule**: Const value representation must be a **total function of type.payload** (and only payload).

```typescript
function isValidConstValue(payload: PayloadType, value: unknown): boolean {
  if (isPayloadVar(payload)) return true; // Validated after resolution
  
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

**Note**: Vector/color consts ARE valid if payload says so. This is not a prohibition — it's a consistency check.
