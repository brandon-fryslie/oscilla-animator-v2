# Implementation Context: port-types Sprint

**Generated:** 2026-01-25T16:00:00 (Updated with spec alignment)

**Spec Reference:** `design-docs/Polymorphic-Cardinality-Spec.md`

## Key Spec Laws

### LAW C — No block-level signal/field branching logic

> "Block lower() must not contain per-block 'if sig do X else if field do Y' logic scattered across the codebase. Instead: Use centralized dual-emission helpers."

**Implication:** We need a consistent dual-dispatch pattern, not ad-hoc per-block if/else.

### §6.2 — Legitimately field-only blocks

> "A block may remain field-only if: It requires an instance domain and depends intrinsically on per-element indexing (e.g., uses normalizedIndex intrinsic)."
> "Example: FromDomainId is inherently field-producing because it derives per-element IDs."

**Implication:** FromDomainId should stay `fieldOnly`. StableIdHash and DomainIndex also use intrinsics but their *semantics* make sense for signals too.

### §6.4 — Non-canonical guards

> "Any lower() guard like `if (id01.k !== 'field') throw ...` is non-canonical for preserve blocks."

**Implication:** We must remove these guards and implement proper dual-path dispatch.

## Files to Modify

### src/blocks/field-operations-blocks.ts

**Port type updates remaining:**
| Block | Inputs | Outputs |
|-------|--------|---------|
| FieldPolarToCartesian | angle, radius | pos |
| FieldCartesianToPolar | pos | angle, radius |
| Pulse | id01 | value |
| RadiusSqrt | id01, radius | out |
| Jitter2D | pos, rand | out |
| HueFromPhase | id01 | hue |
| SetZ | pos, z | out |

**lower() guard removals needed:**
All blocks marked `preserve` must have their `if (x.k !== 'field') throw` guards removed.

### src/blocks/identity-blocks.ts

**StableIdHash:**
```typescript
// Current
cardinality: {
  cardinalityMode: 'fieldOnly',
  laneCoupling: 'laneLocal',
  broadcastPolicy: 'disallowSignalMix',
},

// Target
cardinality: {
  cardinalityMode: 'preserve',
  laneCoupling: 'laneLocal',
  broadcastPolicy: 'allowZipSig',
},
```

**DomainIndex:**
Same pattern as StableIdHash.

**FromDomainId:**
Keep as-is (`fieldOnly`) per spec §6.2.

## Dual-Path Lower Pattern

The Sin/Cos blocks already implement the correct pattern:

```typescript
lower: ({ ctx, inputsById }) => {
  const input = inputsById.input;

  if (!input) {
    throw new Error('Sin input required');
  }

  if (input.k === 'sig') {
    // Signal path - use opcode
    const sinFn = ctx.b.opcode(OpCode.Sin);
    const result = ctx.b.sigMap(input.id, sinFn, canonicalType('float'));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        result: { k: 'sig', id: result, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  } else if (input.k === 'field') {
    // Field path - use field kernel
    const sinFn = ctx.b.kernel('fieldSin');
    const result = ctx.b.fieldMap(input.id, sinFn, signalTypeField('float', 'default'));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        result: { k: 'field', id: result, slot, type: outType, stride: strideOf(outType.payload) },
      },
      instanceContext: ctx.inferredInstance,
    };
  } else {
    throw new Error('Sin input must be signal or field');
  }
},
```

## Handling Multi-Input Blocks

For blocks like RadiusSqrt, Jitter2D, SetZ with multiple field inputs:

### All Signals Path
```typescript
if (a.k === 'sig' && b.k === 'sig') {
  const fn = ctx.b.opcode(OpCode.Whatever);
  const result = ctx.b.sigZip([a.id, b.id], fn, canonicalType('float'));
  return { outputsById: { out: { k: 'sig', ... } } };
}
```

### All Fields Path
```typescript
if (a.k === 'field' && b.k === 'field') {
  const fn = ctx.b.kernel('fieldWhatever');
  const result = ctx.b.fieldZip([a.id, b.id], fn, signalTypeField('float', 'default'));
  return { outputsById: { out: { k: 'field', ... } }, instanceContext };
}
```

### Mixed Path (allowZipSig)
```typescript
// If one is signal, broadcast it to field
const aField = a.k === 'field' ? a.id : ctx.b.Broadcast(a.id, signalTypeField('float', 'default'));
const bField = b.k === 'field' ? b.id : ctx.b.Broadcast(b.id, signalTypeField('float', 'default'));
const fn = ctx.b.kernel('fieldWhatever');
const result = ctx.b.fieldZip([aField, bField], fn, signalTypeField('float', 'default'));
return { outputsById: { out: { k: 'field', ... } }, instanceContext };
```

## Opcodes vs Kernels

| Block | Field Kernel | Signal Opcode (if exists) |
|-------|-------------|--------------------------|
| GoldenAngle | fieldGoldenAngle | ? |
| AngularOffset | fieldAngularOffset | ? |
| Pulse | fieldPulse | ? |
| RadiusSqrt | fieldRadiusSqrt | sqrt + mul (compound) |
| Jitter2D | fieldJitter2D | ? |
| HueFromPhase | fieldHueFromPhase | add + mod (compound) |
| SetZ | fieldSetZ | ? |
| FieldPolarToCartesian | fieldPolarToCartesian | sin/cos/mul (compound) |
| FieldCartesianToPolar | fieldCartesianToPolar | atan2/sqrt (compound) |

Most of these don't have direct opcodes but can be implemented as compound signal operations.

## Test Verification

After changes, test with this patch pattern:
```
Array(count=10)
  └── FromDomainId
        └── GoldenAngle
              └── Add(b=Const(0.5))  ← This connection should now work
                    └── FieldPolarToCartesian
                          └── RenderInstances2D
```

The GoldenAngle.angle (now polymorphic output) connecting to Add.a (polymorphic input) should compile without error.
