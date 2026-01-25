# Definition of Done: Channel Infrastructure

Generated: 2026-01-25
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260125-channel-infra-PLAN.md

## Functional Criteria

### ExternalWriteBus
- [ ] set(name, value) stores write record with op='set'
- [ ] pulse(name) stores write record with op='pulse'
- [ ] add(name, delta) stores write record with op='add'
- [ ] drain() returns all records and clears queue
- [ ] Multiple calls to drain() return empty after first

### ExternalChannelSnapshot
- [ ] getFloat('unknown.channel') returns 0
- [ ] getFloat('known.channel') returns committed value
- [ ] getVec2('unknown') returns { x: 0, y: 0 }
- [ ] Snapshot is effectively immutable after creation

### ExternalChannelSystem
- [ ] writeBus is accessible for external writes
- [ ] snapshot getter returns current committed snapshot
- [ ] commit() produces new snapshot from pending writes

### Commit Lifecycle
- [ ] Value channel persists across frames until overwritten
- [ ] Pulse channel reads 1 for frame with pulse, 0 next frame
- [ ] Accum channel sums deltas, reads 0 next frame if no adds
- [ ] Unknown channels read as 0 without error

### IR Changes
- [ ] SigExprExternal accepts any string for 'which'
- [ ] IRBuilder.sigExternal accepts any channel string
- [ ] Existing 'mouseX', 'mouseY', 'mouseOver' still work

### Evaluator Simplification
- [ ] SignalEvaluator 'external' case has no device-specific switch
- [ ] All external reads go through snapshot.getFloat()

### Frame Integration
- [ ] executeFrame calls commit() before signal evaluation
- [ ] No commits happen mid-frame

## Technical Criteria

- [ ] No new TypeScript errors (npm run typecheck passes)
- [ ] Existing tests pass (npm run test)
- [ ] New unit tests for ExternalWriteBus, ExternalChannelSnapshot, ExternalChannelSystem
- [ ] Test coverage for commit lifecycle (value/pulse/accum semantics)
- [ ] No performance regression (Map.get is O(1))

## Verification Steps

1. **Unit Tests**
   ```bash
   npm run test -- ExternalChannel
   ```

2. **Type Check**
   ```bash
   npm run typecheck
   ```

3. **Integration Test**
   - Create test that writes to writeBus, calls commit, reads from snapshot
   - Verify value persists, pulse clears, accum clears

4. **Manual Verification**
   - Run dev server: `npm run dev`
   - Verify existing mouse-following patches still work
   - Console log snapshot values to confirm reads work

## Acceptance Test Cases (from Spec Section 10)

1. **Value persists:**
   ```typescript
   system.writeBus.set('mouse.x', 0.2);
   system.commit();
   expect(system.snapshot.getFloat('mouse.x')).toBe(0.2);
   system.commit(); // no writes
   expect(system.snapshot.getFloat('mouse.x')).toBe(0.2);
   ```

2. **Pulse is one frame:**
   ```typescript
   system.writeBus.pulse('key.space.down');
   system.commit();
   expect(system.snapshot.getFloat('key.space.down')).toBe(1);
   system.commit(); // no pulse
   expect(system.snapshot.getFloat('key.space.down')).toBe(0);
   ```

3. **Accum clears:**
   ```typescript
   system.writeBus.add('mouse.wheel.dy', 1);
   system.writeBus.add('mouse.wheel.dy', 1);
   system.commit();
   expect(system.snapshot.getFloat('mouse.wheel.dy')).toBe(2);
   system.commit(); // no adds
   expect(system.snapshot.getFloat('mouse.wheel.dy')).toBe(0);
   ```

4. **Unknown returns 0:**
   ```typescript
   expect(system.snapshot.getFloat('midi.nonexistent')).toBe(0);
   ```
