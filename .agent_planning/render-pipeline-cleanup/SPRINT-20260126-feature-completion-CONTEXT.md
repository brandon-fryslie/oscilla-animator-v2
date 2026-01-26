# Implementation Context: feature-completion Sprint

## ms5.15: Rotation and Scale2 Wiring

### Existing Infrastructure (RenderAssembler)

The runtime already fully supports rotation and scale2:

**Reading from slots** (lines 762-767):
```typescript
const fullRotation = step.rotationSlot
  ? (state.values.objects.get(step.rotationSlot) as Float32Array | undefined)
  : undefined;

const fullScale2 = step.scale2Slot
  ? (state.values.objects.get(step.scale2Slot) as Float32Array | undefined)
  : undefined;
```

**Slicing for topology groups** (lines 794-800):
```typescript
const rotation = fullRotation
  ? sliceRotationBuffer(fullRotation, instanceIndices)
  : undefined;
const scale2 = fullScale2
  ? sliceScale2Buffer(fullScale2, instanceIndices)
  : undefined;
```

**Depth sort compaction** (lines 830-831):
```typescript
rotation,
scale2
```

**Draw op emission** (lines 844-845):
```typescript
rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
```

### Missing: Block Definition

File: `src/blocks/render-blocks.ts`

Add to RenderInstances2D inputs:
```typescript
{
  id: 'rotation',
  payload: 'float',
  unit: 'rad',
  cardinality: 'many',
  temporality: 'continuous',
  domain: DOMAIN_CIRCLE,
  optional: true,
  defaultSource: null,
},
{
  id: 'scale2',
  payload: 'vec2',
  unit: null,
  cardinality: 'many',
  temporality: 'continuous',
  domain: DOMAIN_CIRCLE,
  optional: true,
  defaultSource: null,
}
```

### Missing: Block Lowering

In the `lower()` function, add:
```typescript
const rotationSlot = inputs.rotation
  ? this.emitFieldToSlot(inputs.rotation, 'rotation')
  : undefined;

const scale2Slot = inputs.scale2
  ? this.emitFieldToSlot(inputs.scale2, 'scale2')
  : undefined;

// In StepRender emission:
{
  kind: 'render',
  instanceId,
  positionSlot,
  colorSlot,
  scale,
  shape,
  rotationSlot,  // Add
  scale2Slot,    // Add
}
```

## ms5.14: StepRender Optionality

### Current Type Definition

File: `src/compiler/ir/types.ts:479-498`

```typescript
export interface StepRender {
  readonly kind: 'render';
  readonly instanceId: string;
  readonly positionSlot: ValueSlot;
  readonly colorSlot: ValueSlot;
  readonly scale?: { readonly k: 'sig'; readonly id: SigExprId };  // Optional
  readonly shape?: ...;  // Optional
  readonly controlPoints?: ...;  // Optional
  readonly rotationSlot?: ValueSlot;  // Optional
  readonly scale2Slot?: ValueSlot;  // Optional
}
```

### Research Needed

1. Check RenderAssembler behavior when shape is undefined
2. Check if any blocks emit StepRender without shape
3. Determine correct optionality

## ms5.13: Golden Angle Turns

### Current Implementation

File: `src/runtime/FieldKernels.ts`

```typescript
// Note: turns=50 is currently baked in (TODO: make configurable)
export function fieldGoldenAngle(...) {
  const turns = 50;  // Hardcoded
  // ...
}
```

### Proposed Change

```typescript
export function fieldGoldenAngle(
  count: number,
  turns: number = 50,  // New parameter with default
  // ... other params
) {
  // Use turns parameter
}
```

### Usage Sites

Need to find all callers of fieldGoldenAngle and update signatures.

## ms5.17: PureFn 'expr' Kind

### Current Code

File: `src/runtime/SignalEvaluator.ts:227-228`

```typescript
case 'expr':
  throw new Error(`PureFn kind 'expr' not yet implemented`);
```

### PureFn Type

Check `src/compiler/ir/types.ts` for PureFn definition to understand expr structure.

### Research Needed

1. What is `fn.expr` - AST? String? Compiled?
2. Is there an existing expression evaluator?
3. What are valid expression operations?

## File Index

| Purpose | File |
|---------|------|
| Render block definitions | `src/blocks/render-blocks.ts` |
| IR StepRender type | `src/compiler/ir/types.ts:479` |
| RenderAssembler runtime | `src/runtime/RenderAssembler.ts` |
| Field kernels | `src/runtime/FieldKernels.ts` |
| Signal evaluator | `src/runtime/SignalEvaluator.ts` |
| PureFn type | `src/compiler/ir/types.ts` (search for PureFn) |
