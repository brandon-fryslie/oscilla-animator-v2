# Implementation Context: Reduce Block

## Architecture Overview

**What Reduce does**:
- Input: many+continuous<T> (field, one value per lane)
- Output: one+continuous<T> (scalar)
- Operation: aggregate all lanes via op (mean, sum, min, max, rms, any, all)
- Temporality: continuous→continuous (recomputed every frame)

**Why it matters**:
- Other half of Broadcast (one→many becomes many→one)
- Enables control loops: compute on fields, feed result back to globals
- Example: average position of all objects → camera target

## Key Files

### Block Definition
**File**: `src/blocks/adapter-blocks.ts`

This is where Broadcast and other adapters are defined. Follow this pattern:

```typescript
registerBlock({
  type: 'Reduce',
  form: 'primitive',
  capability: 'pure',  // No state
  cardinality: {
    cardinalityMode: 'preserve',  // or 'fieldOnly' - need to check
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    field: {
      label: 'Field',
      type: signalTypeField('*', 'default'),  // Any payload type
    },
    op: {
      label: 'Operation',
      type: signalTypeScalar('select'),  // Enum: mean|sum|min|max|rms|any|all
      value: 'mean',  // Default operation
    },
  },
  outputs: {
    out: {
      label: 'Value',
      type: signalTypeScalar('*'),  // Same payload as input
    },
  },
  lower: (context) => {
    // IR generation here (see below)
  },
});
```

### IR Generation Pattern

**Location**: `src/compiler/ir/` (IRBuilder interface)

Look at how Broadcast generates IR for reference. Reduce will:

1. Read field buffer input
2. Allocate scalar output slot
3. Generate loop/operations to compute aggregate

**Pseudo-code IR**:
```
for lane in 0..field.count:
  switch(op):
    case 'mean': accumulate += field[lane]
    case 'any': accumulate = accumulate || field[lane]
    ...
  else:
    process final value, write to output slot
```

### Type System

**File**: `src/compiler/passes-v2/pass0-payload-resolution.ts`

Payload resolution already handles this, but verify:
- Input field type includes payload type
- Output type = input payload type
- Operation param doesn't affect type

### Test Files

**Existing adapter tests**: `src/blocks/__tests__/adapter-blocks.test.ts`

Look for:
- How Broadcast is tested
- Type inference tests
- Runtime evaluation tests
- Pattern to follow for Reduce tests

## Type Signatures Reference

From type system:

```typescript
// Field type: many lanes, one value per lane
type Field<T> = {
  payload: T,
  cardinality: 'many',
  temporality: 'continuous',
  domain: 'shape' | 'circle' | ... // specific domain
}

// Scalar type: single value
type Scalar<T> = {
  payload: T,
  cardinality: 'one',
  temporality: 'continuous',
  domain: 'scalar'
}

// Reduce transforms Field<T> → Scalar<T>
```

## Operation Semantics

Each operation must handle multiple payload types:

### mean
- float/int/vec2/color: average each component
- bool: invalid (not numeric)
- Formula: sum / count

### sum
- float/int/vec2/color: sum components
- bool: count of true values
- Formula: Σ values

### min / max
- float/int/vec2: numeric min/max
- vec2/color: per-component
- bool: find any false (min) or any true (max)

### rms (Root Mean Square)
- float/int/vec2: sqrt(mean(x²))
- Useful for magnitudes
- Handle per-component for vec2

### any / all (boolean reduction)
- bool: logical OR / AND
- int: treat as bool (non-zero = true)
- float: treat as bool (non-zero = true)
- vec2/color: invalid? Or per-component logical op?

## Edge Cases

1. **Empty field** (0 lanes):
   - mean/sum → 0
   - min/max → 0 (could be -∞/+∞, but pick 0)
   - any → false
   - all → true (vacuous truth)

2. **Single lane**:
   - All operations return that one value

3. **NaN/Infinity**:
   - min/max preserve them (NaN comparison is false, inf > any finite)
   - mean/sum propagate NaN
   - rms may produce inf if values are large
   - Consider clamping output?

4. **Per-component for vec2**:
   - mean([{x:1,y:2}, {x:3,y:4}]) = {x:2, y:3}
   - Each component reduced independently

## Integration Points

1. **Broadcast already exists** - Reduce pairs with it
2. **Type checker** - needs to accept Field→Reduce
3. **Adapter insertion pass** - Reduce may be inserted between type mismatches (future)
4. **IR compiler** - generates executable code

## Common Pitfalls

1. **Confusing "domain" with "type"**: domain is shape/circle/etc., not payload type
2. **Forgetting cardinality/temporality**: must be declared
3. **Per-component semantics**: vec2 means work per-component, not on magnitude
4. **Empty field handling**: don't return undefined, use 0/false
5. **NaN propagation**: check if this breaks anything downstream

## Testing Strategy

1. **Type tests first**: verify payload type inference
2. **Unit tests**: each operation on small field
3. **Integration**: full graph with Broadcast + Reduce
4. **Regression**: verify existing adapters still work
