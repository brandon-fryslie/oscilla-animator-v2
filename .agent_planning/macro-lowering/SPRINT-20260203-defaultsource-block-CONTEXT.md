# Implementation Context: DefaultSource Block + LowerSandbox
Generated: 2026-02-03

## Design Reference
- `design-docs/_new/pure-lowering-blocks/01-macro-lowering.md` — authoritative consolidated design doc
- `design-docs/_new/default-source-improvement.md` — original polymorphic DefaultSource proposal

## Key Files to Modify

### New Files
- `src/compiler/ir/LowerSandbox.ts` — constrained IR builder proxy
- `src/compiler/ir/pureLowerTypes.ts` — PureLowerResult, LowerEffects, SlotRequest types
- `src/blocks/signal/default-source.ts` — DefaultSource block registration
- `src/blocks/color/hue-rainbow.ts` — HueRainbow block registration

### Modified Files
- `src/blocks/registry.ts` — add `loweringPurity` to BlockDef interface
- `src/compiler/backend/lower-blocks.ts` — handle PureLowerResult (allocate slots for pure blocks)
- `src/blocks/signal/index.ts` — import default-source.ts
- `src/blocks/color/index.ts` — import hue-rainbow.ts
- `src/blocks/math/add.ts` — migrate to PureLowerResult as proof

### Already Modified (in progress)
- `src/compiler/frontend/normalize-default-sources.ts` — already updated to insert `DefaultSource` as fallback (line 199-205). Currently broken because block isn't registered.

## Current API Summary

### LowerResult (existing — keep working for impure blocks)
```typescript
interface LowerResult {
  outputsById: Record<string, ValueRefExpr>;  // includes slot
  instanceContext?: InstanceId;
  stateSlot?: StateSlotId;
}

interface ValueRefExpr {
  id: ValueExprId;
  slot: ValueSlot;
  type: CanonicalType;
  stride: number;
  components?: readonly ValueExprId[];
  eventSlot?: EventSlotId;
}
```

### PureLowerResult (new — for pure blocks)
```typescript
interface PureLowerResult {
  readonly kind: 'pure';  // discriminant
  readonly exprOutputs: Record<string, ValueExprId>;
  readonly effects?: LowerEffects;
}

interface LowerEffects {
  readonly slotRequests?: readonly SlotRequest[];
  readonly stateRequests?: readonly StateRequest[];
  readonly stepRequests?: readonly StepRequest[];
}

interface SlotRequest {
  readonly portId: string;
  readonly type: CanonicalType;
  readonly components?: readonly ValueExprId[];  // for multi-component types
}
```

### LowerSandbox API Surface
```typescript
class LowerSandbox {
  constructor(private inner: IRBuilder);

  // Allowed (pure construction)
  constant(value: ConstValue, type: CanonicalType): ValueExprId;
  time(which: TimeChannel, type: CanonicalType): ValueExprId;
  kernelMap(input: ValueExprId, fn: PureFn, type: CanonicalType): ValueExprId;
  kernelZip(inputs: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId;
  kernelZipSig(field: ValueExprId, signals: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId;
  broadcast(signal: ValueExprId, type: CanonicalType): ValueExprId;
  reduce(field: ValueExprId, op: ReduceOp, type: CanonicalType): ValueExprId;
  combine(inputs: readonly ValueExprId[], mode: CombineMode, type: CanonicalType): ValueExprId;
  intrinsic(name: IntrinsicPropertyName, type: CanonicalType): ValueExprId;
  placement(field: PlacementFieldName, basis: BasisKind, type: CanonicalType): ValueExprId;
  extract(input: ValueExprId, idx: number, type: CanonicalType): ValueExprId;
  construct(components: readonly ValueExprId[], type: CanonicalType): ValueExprId;
  hslToRgb(input: ValueExprId, type: CanonicalType): ValueExprId;
  opcode(op: OpCode): PureFn;
  kernel(name: string): PureFn;
  eventNever(): ValueExprId;
  eventPulse(source: 'InfiniteTimeRoot'): ValueExprId;

  // Macro expansion
  lowerBlock(blockType: string, inputsById: Record<string, ValueExprId>, params?: Record<string, unknown>): Record<string, ValueExprId>;

  // BLOCKED — these throw if called:
  // allocSlot, allocTypedSlot, allocStateSlot, allocEventSlot
  // registerSlotType, registerSigSlot, registerFieldSlot
  // stepSlotWriteStrided, stepStateWrite, stepFieldStateWrite
  // stepEvalSig, stepMaterialize, stepContinuityMapBuild, stepContinuityApply
  // addRenderGlobal
}
```

## DefaultSource Policy Table

```typescript
function chooseDefaultPlan(resolvedType: CanonicalType): DefaultPlan {
  const { payload, extent } = resolvedType;

  // Events: never-fire
  if (extent.temporality.kind === 'inst' && extent.temporality.value.kind === 'discrete') {
    return { kind: 'eventNever' };
  }

  // Dispatch on payload
  switch (payload.kind) {
    case 'float': return { kind: 'const', values: [1] };        // identity for multiplication
    case 'int':   return { kind: 'const', values: [0] };
    case 'bool':  return { kind: 'const', values: [0] };        // false
    case 'vec2':  return { kind: 'const', values: [0, 0] };
    case 'vec3':  return { kind: 'const', values: [0, 0, 0] };
    case 'color': return { kind: 'macro', blockType: 'HueRainbow', rail: 'phaseA' };
    case 'cameraProjection': return { kind: 'error', message: 'Camera projection requires explicit source' };
    default: return { kind: 'error', message: `No default for payload type: ${payload.kind}` };
  }
}
```

## HueRainbow Implementation Sketch

```typescript
// In lower():
// Input: t (float, 0→1)
// Output: color (RGBA)
// t → hue, fixed sat=0.8, fixed light=0.5, alpha=1.0
const t = inputsById.t;  // ValueExprId
const sat = ctx.b.constant(floatConst(0.8), canonicalType(FLOAT));
const light = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
const alpha = ctx.b.constant(floatConst(1.0), canonicalType(FLOAT));
const hsl = ctx.b.construct([t, sat, light, alpha], canonicalType(COLOR));
const rgb = ctx.b.hslToRgb(hsl, canonicalType(COLOR));
return { kind: 'pure', exprOutputs: { out: rgb } };
```

## lower-blocks.ts Integration

In `lowerBlock()` (around line 100-200 of lower-blocks.ts), after calling `blockDef.lower(args)`:

```typescript
const result = blockDef.lower(args);
if ('kind' in result && result.kind === 'pure') {
  // Pure block: allocate slots on its behalf
  const outputs: Record<string, ValueRefExpr> = {};
  for (const [portId, exprId] of Object.entries(result.exprOutputs)) {
    const outType = outTypes[portIndex]; // resolve from pass1
    const stride = payloadStride(outType.payload);
    const slot = builder.allocTypedSlot(outType);
    outputs[portId] = { id: exprId, slot, type: outType, stride };
  }
  // Handle effects (slot requests override the auto-allocation above)
  if (result.effects?.stepRequests) {
    for (const step of result.effects.stepRequests) {
      // emit the step
    }
  }
  return { outputsById: outputs };
}
// Existing path for impure blocks
return result;
```

## Test Strategy
1. **Unit tests for LowerSandbox**: verify blocked methods throw, allowed methods work
2. **Unit tests for PureLowerResult handling**: verify lower-blocks.ts allocates slots correctly
3. **Integration test**: compile a patch with unconnected color input → DefaultSource → HueRainbow → visible color
4. **Regression**: all existing tests pass (the Add migration must not break anything)
5. **Purity test**: invoke HueRainbow via sandbox, verify same inputs → same output (determinism)

## Immediate Blocker
The normalization pass at `src/compiler/frontend/normalize-default-sources.ts:199-205` already creates `{ blockType: 'DefaultSource' }` blocks. Until `DefaultSource` is registered, 11+ tests fail. The WI-1 implementation unblocks this. In the meantime, the tests will continue failing.
