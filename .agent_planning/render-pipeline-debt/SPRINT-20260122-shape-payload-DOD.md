# Definition of Done: shape-payload

## Acceptance Criteria

### BufferPool
- [ ] `BufferFormat` type includes `'shape2d'`
- [ ] `getBufferFormat('shape')` returns `'shape2d'`
- [ ] `allocateBuffer('shape2d', N)` returns `Uint32Array(N * 8)`
- [ ] Exhaustive switch compiles cleanly

### IR Bridges
- [ ] `ShapeDescIR` union includes `{ kind: 'shape' }`
- [ ] `payloadTypeToShapeDescIR('shape')` returns `{ kind: 'shape' }`
- [ ] bridges.test.ts updated and passing

### ScheduleExecutor
- [ ] `evalSig` handles `storage === 'shape2d'` without throwing
- [ ] Writes Shape2DRecord to `state.values.shape2d` bank
- [ ] Record has correct topologyId from the shapeRef expr

### SignalEvaluator
- [ ] `shapeRef` case returns `expr.topologyId` (not 0)

### Tests
- [ ] All existing tests pass (`npm run test -- --run`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] New test file covers BufferPool, bridges, and ScheduleExecutor shape paths

## Verification Commands

```bash
npm run typecheck
npm run test -- --run
npm run test -- --run shape-payload
npm run test -- --run bridges
npm run test -- --run signal-kernel-contracts
```
