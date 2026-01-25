# Implementation Context: unit-inference-refactor

## Key Files

| File | Current Role | Changes Needed |
|------|--------------|----------------|
| `src/graph/passes/pass0-polymorphic-types.ts` | Infers payload AND unit | Remove unit inference (keep payload only) |
| `src/compiler/passes-v2/pass1-type-constraints.ts` | Constraint solver | Use per-instance unit variables |
| `src/graph/passes/pass1-default-sources.ts` | Creates Const blocks for defaults | Verify no unit pre-resolution |
| `src/compiler/passes-v2/pass2-types.ts` | Type validation | Should work as-is |

## The Problem Explained

**Current**: Definition says `Const.out` has `unitVar('const_out')`. ALL Const blocks share this ID. When pass1 tries to unify:
- Const_A connects to `phase` port → needs `phase01`
- Const_B connects to `sat` port → needs `scalar`
- Union-find: `const_out = phase01` AND `const_out = scalar` → CONFLICT

**Fix**: Each Const instance gets unique ID:
- Const_A.out → `unitVar('5:out:out')` (blockIndex 5)
- Const_B.out → `unitVar('10:out:out')` (blockIndex 10)
- Union-find: `5:out:out = phase01` ✓, `10:out:out = scalar` ✓ → No conflict

## Code Changes

### 1. pass0-polymorphic-types.ts - Remove unit inference

```typescript
// BEFORE (lines ~61-63):
inferredPayloadType = targetInput.type.payload;
inferredUnit = targetInput.type.unit.kind;  // REMOVE THIS

// AFTER:
inferredPayloadType = targetInput.type.payload;
// Unit inference removed - pass1 handles this
```

Same for backward resolution (~101-102) and the params setting (~114).

### 2. pass1-type-constraints.ts - Per-instance variables

```typescript
// BEFORE (line 198-206):
if (outputDef.type && isUnitVar(outputDef.type.unit)) {
  const key = portKey(blockIndex, portName, 'out');
  polymorphicPorts.set(key, {
    block,
    blockIndex,
    portName,
    direction: 'out',
    type: outputDef.type,  // Uses shared unitVar ID from definition
  });
}

// AFTER:
if (outputDef.type && isUnitVar(outputDef.type.unit)) {
  const key = portKey(blockIndex, portName, 'out');
  // Create per-instance unit variable
  const instanceUnitVar = { kind: 'var' as const, id: key };
  polymorphicPorts.set(key, {
    block,
    blockIndex,
    portName,
    direction: 'out',
    type: { ...outputDef.type, unit: instanceUnitVar },  // Unique per instance
  });
}
```

And update the constraint collection to use the instance-specific types.

## Verification

After changes, the debug test should show:
```
Constraint result: ok
Resolved ports:
  5:out:out: unit=phase01
  10:out:out: unit=scalar
  11:out:out: unit=scalar
```

No conflicts because each Const has its own unit variable.
