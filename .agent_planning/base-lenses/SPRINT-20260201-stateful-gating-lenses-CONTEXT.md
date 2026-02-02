# Implementation Context: Stateful & Gating Lenses
Generated: 2026-02-01

## Reference Implementations

### Stateful pattern (from src/blocks/signal/lag.ts)
```typescript
lower: ({ ctx, inputsById, config }) => {
  const smoothing = (config?.smoothing as number) ?? 0.5;
  const initialValue = (config?.initialValue as number) ?? 0;
  const stateId = stableStateId(ctx.instanceId, 'slew');
  const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue });
  const prevValue = ctx.b.stateRead(stateSlot, canonicalType(FLOAT));
  const lerpFn = ctx.b.opcode(OpCode.Lerp);
  const smoothConst = ctx.b.constant(floatConst(smoothing), canonicalType(FLOAT));
  const newValue = ctx.b.kernelZip([prevValue, input.id, smoothConst], lerpFn, canonicalType(FLOAT));
  ctx.b.stepStateWrite(stateSlot, newValue);
  // output newValue
}
```

### Gating pattern (Select opcode)
```
Select(cond, ifTrue, ifFalse) → cond > 0 ? ifTrue : ifFalse
```

### Deadzone pattern
```
absVal = abs(x)
diff = absVal - threshold   // > 0 when |x| > threshold
result = select(diff, x, 0) // passthrough when outside deadzone
```

## Key imports
```typescript
import { stableStateId } from '../../compiler/ir/types';
import { OpCode } from '../../compiler/ir/types';
import { canonicalType, payloadStride, floatConst, unitNorm01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
```
