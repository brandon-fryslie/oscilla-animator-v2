# Implementation Context: channel-map

## Files to Modify

### Core Infrastructure

1. **`src/runtime/RuntimeState.ts`**
   - Remove `ExternalInputs` interface (lines 187-202)
   - Remove `updateSmoothing()` function
   - Replace `external: ExternalInputs` in `SessionState` with `externalChannels: DoubleBufferedChannelMap`
   - Update `createSessionState()` to instantiate `DoubleBufferedChannelMap`

2. **`src/runtime/ChannelMap.ts`** (NEW)
   - `DoubleBufferedChannelMap` class
   - Two internal Maps: `staging` and `committed`
   - `stage(name: string, value: number): void` → writes to staging
   - `commit(): void` → swaps staging into committed (copy, not pointer swap, for safety)
   - `get(name: string): number` → reads committed, returns 0 if missing
   - `keys(): IterableIterator<string>` → for debugging/inspection

3. **`src/runtime/SignalEvaluator.ts`** (lines 175-182)
   - Replace hardcoded switch with: `return state.externalChannels.get(ext.which) ?? 0;`
   - Update type assertion: `ext` has `{ which: string }` (already does)

4. **`src/runtime/ScheduleExecutor.ts`** (executeFrame, line ~195)
   - Add `state.externalChannels.commit();` as first line of executeFrame body
   - Keep `camera?: CameraParams` parameter for now (Sprint 2 removes it)

### IRBuilder Extension

5. **`src/compiler/ir/IRBuilder.ts`** (interface)
   - Add: `sigExternal(channel: string, type: CanonicalType): SigId`

6. **`src/compiler/ir/IRBuilderImpl.ts`** (implementation)
   - Implement `sigExternal()`: creates `{ kind: 'external', which: channel }` expression
   - Follow `sigTime()` pattern exactly

### Block Registration

7. **`src/blocks/external-blocks.ts`** (NEW)
   - Register `ExternalInput` block
   - `capability: 'io'`
   - Config: `channel: string`
   - Output: `value: canonicalType('float')`
   - `lower()`: `ctx.b.sigExternal(config.channel, canonicalType('float'))`

### Mouse Migration

8. **`src/main.ts`**
   - Remove camera-related imports if only used for executeFrame param (keep for Sprint 2 transition)
   - Mouse event handlers: call `currentState.externalChannels.stage('mouse.x', ...)` instead of writing to `state.external.*`
   - Smoothing logic: maintain local `smoothX`, `smoothY` variables, apply lerp, stage smoothed values
   - In animate loop: stage mouse values before executeFrame call

## Existing Patterns to Follow

### Time System (canonical reference)

```typescript
// IRBuilder: sigTime() creates time expression
sigTime(field: TimeField, type: CanonicalType): SigId {
  return this.addSigExpr({ kind: 'time', field, type });
}

// SignalEvaluator: case 'time'
case 'time': {
  const field = (expr as { field: TimeField }).field;
  return state.time[field];
}

// InfiniteTimeRoot block: lower()
lower: ({ ctx }) => {
  const tMs = ctx.b.sigTime('tMs', canonicalType('float'));
  const tMsSlot = ctx.b.allocSlot();
  // ...
}
```

### Block Registration (canonical reference)

```typescript
registerBlock({
  type: 'BlockName',
  label: 'Human Label',
  category: 'io',
  description: '...',
  form: 'primitive',
  capability: 'io',
  cardinality: {
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: { /* ... */ },
  outputs: { value: { label: 'Value', type: canonicalType('float') } },
  lower: ({ ctx, config }) => { /* ... */ },
});
```

## Testing Strategy

- Unit test `DoubleBufferedChannelMap`: stage → get returns 0 (not committed), commit → get returns value, multiple channels, overwrite semantics
- Unit test `ExternalInput` block lowering: verify it produces correct IR expression
- Integration: existing runtime tests should pass with channel map substitution
- Visual verification: mouse interaction unchanged after migration

## SigExpr Union Type

Check if `{ kind: 'external', which: string }` already exists in the SigExpr union type. If not, add it. It likely already exists given the current evaluator handles it.
