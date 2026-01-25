# Definition of Done: Mouse Migration

Generated: 2026-01-25
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260125-mouse-migration-PLAN.md

## Functional Criteria

### Mouse Position Channels
- [ ] mouse.x reads smoothed X position (0-1, normalized to canvas)
- [ ] mouse.y reads smoothed Y position (0-1, normalized to canvas)
- [ ] mouse.over reads 1 when mouse over canvas, 0 otherwise
- [ ] Existing patches using ExternalInput with 'mouse.x' still work
- [ ] Mouse following behavior visually identical to before

### Mouse Button Channels
- [ ] mouse.button.left.down reads 1 for one frame on left click, then 0
- [ ] mouse.button.left.up reads 1 for one frame on left release, then 0
- [ ] mouse.button.left.held reads 1 while left button held, 0 otherwise
- [ ] Same for right button (mouse.button.right.*)
- [ ] Can create patch that responds to mouse clicks

### Mouse Wheel Channels
- [ ] mouse.wheel.dx reads accumulated horizontal scroll since last frame
- [ ] mouse.wheel.dy reads accumulated vertical scroll since last frame
- [ ] Values reset to 0 each frame if no wheel events
- [ ] Multiple wheel events within frame sum correctly
- [ ] Can create patch that responds to scroll

### Interface Cleanup
- [ ] ExternalInputs interface no longer exists
- [ ] RuntimeState.external is ExternalChannelSystem
- [ ] No hardcoded mouse logic in SignalEvaluator
- [ ] All mouse reads go through snapshot.getFloat()

### Smoothing
- [ ] Smoothing happens at write-side (app layer)
- [ ] Smoothing state not in RuntimeState
- [ ] Smoothing lerp factor matches previous behavior (~0.05)
- [ ] No smoothing code in runtime layer

## Technical Criteria

- [ ] No new TypeScript errors (npm run typecheck passes)
- [ ] Existing tests pass (npm run test)
- [ ] No references to ExternalInputs in codebase
- [ ] No references to state.external.mouseX in codebase
- [ ] Unit tests for button pulse channels
- [ ] Unit tests for wheel accum channels

## Verification Steps

1. **Type Check**
   ```bash
   npm run typecheck
   ```

2. **Unit Tests**
   ```bash
   npm run test
   ```

3. **Search for Removed Interface**
   ```bash
   # Should return no results
   grep -r "ExternalInputs" src/
   grep -r "smoothX" src/runtime/
   grep -r "mouseX" src/runtime/SignalEvaluator.ts
   ```

4. **Manual Verification - Mouse Position**
   - Run dev server: `npm run dev`
   - Load existing mouse-following patch
   - Verify circles follow mouse smoothly
   - Verify behavior identical to before

5. **Manual Verification - Mouse Buttons**
   - Create patch with ExternalInput channel 'mouse.button.left.down'
   - Connect to trigger or color change
   - Click and verify response on click frame only
   - Create patch with 'mouse.button.left.held'
   - Verify continuous response while holding

6. **Manual Verification - Mouse Wheel**
   - Create patch with ExternalInput channel 'mouse.wheel.dy'
   - Connect to position.y offset
   - Scroll and verify position changes proportionally
   - Verify position resets if no scrolling

## Acceptance Test Cases

### Mouse Position
```typescript
// Test: Mouse position writes to channels
writeBus.set('mouse.x', 0.5);
writeBus.set('mouse.y', 0.75);
commit();
expect(snapshot.getFloat('mouse.x')).toBe(0.5);
expect(snapshot.getFloat('mouse.y')).toBe(0.75);
```

### Mouse Button Pulse
```typescript
// Test: Button down is one-frame pulse
writeBus.pulse('mouse.button.left.down');
commit();
expect(snapshot.getFloat('mouse.button.left.down')).toBe(1);
commit(); // no pulse
expect(snapshot.getFloat('mouse.button.left.down')).toBe(0);
```

### Mouse Button Held
```typescript
// Test: Button held persists while set
writeBus.set('mouse.button.left.held', 1);
commit();
expect(snapshot.getFloat('mouse.button.left.held')).toBe(1);
commit(); // no new set, but value should persist
expect(snapshot.getFloat('mouse.button.left.held')).toBe(1);
writeBus.set('mouse.button.left.held', 0);
commit();
expect(snapshot.getFloat('mouse.button.left.held')).toBe(0);
```

### Mouse Wheel Accum
```typescript
// Test: Wheel accumulates within frame
writeBus.add('mouse.wheel.dy', 10);
writeBus.add('mouse.wheel.dy', 5);
commit();
expect(snapshot.getFloat('mouse.wheel.dy')).toBe(15);
commit(); // no adds
expect(snapshot.getFloat('mouse.wheel.dy')).toBe(0);
```

### No Hardcoded Mouse in Evaluator
```typescript
// Test: Evaluator uses generic snapshot read
// Verify no switch statement for mouseX/mouseY/mouseOver
const evaluatorCode = readFile('src/runtime/SignalEvaluator.ts');
expect(evaluatorCode).not.toContain("which === 'mouseX'");
expect(evaluatorCode).not.toContain("which === 'mouseY'");
expect(evaluatorCode).not.toContain("which === 'mouseOver'");
```
