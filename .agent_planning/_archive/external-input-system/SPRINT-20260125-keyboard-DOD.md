# Definition of Done: Keyboard Support

Generated: 2026-01-25
Status: RESEARCH REQUIRED
Plan: SPRINT-20260125-keyboard-PLAN.md

## Functional Criteria

### Event Listeners
- [ ] keydown events captured when canvas/window focused
- [ ] keyup events captured
- [ ] Event listeners properly cleaned up on unmount
- [ ] No memory leaks from event handlers

### Key State Channels
- [ ] key.space.held reads 1 while space held, 0 otherwise
- [ ] key.space.down reads 1 for one frame on space press, then 0
- [ ] key.space.up reads 1 for one frame on space release, then 0
- [ ] Multiple keys can be held simultaneously
- [ ] Key repeat events do NOT trigger additional down pulses

### WASD Axis Channels
- [ ] key.axis.wasd.x reads -1 when A held, +1 when D held, 0 otherwise
- [ ] key.axis.wasd.y reads -1 when W held, +1 when S held, 0 otherwise
- [ ] Simultaneous opposite keys (A+D) result in 0
- [ ] Arrow keys provide separate axis channels or combine with WASD

### Focus Handling
- [ ] Keyboard input works when canvas has focus
- [ ] Documented behavior when canvas loses focus
- [ ] All held keys released on window blur

## Technical Criteria

- [ ] No new TypeScript errors (npm run typecheck passes)
- [ ] Existing tests pass (npm run test)
- [ ] Unit tests for key state tracking
- [ ] Unit tests for axis computation
- [ ] Cross-browser testing documented (Chrome, Firefox, Safari)

## Verification Steps

1. **Type Check**
   ```bash
   npm run typecheck
   ```

2. **Unit Tests**
   ```bash
   npm run test -- keyboard
   ```

3. **Manual Verification - Key State**
   - Run dev server: `npm run dev`
   - Create patch with ExternalInput channel 'key.space.held'
   - Connect to color or size
   - Press and hold space - verify continuous effect
   - Release - verify effect stops

4. **Manual Verification - Key Pulse**
   - Create patch with ExternalInput channel 'key.space.down'
   - Connect to trigger
   - Press space once - verify single pulse
   - Hold space - verify no additional pulses (repeat filtered)

5. **Manual Verification - WASD Axis**
   - Create patch with ExternalInput channel 'key.axis.wasd.x'
   - Connect to position.x offset
   - Press A - verify negative offset
   - Press D - verify positive offset
   - Press A+D - verify zero offset

6. **Cross-Browser Testing**
   - Test in Chrome, Firefox, Safari
   - Document any differences
   - Verify key codes consistent

## Acceptance Test Cases

### Key Held State
```typescript
// Test: Key held state persists
keyState.set('space', true);
updateKeyChannels(writeBus, keyState);
commit();
expect(snapshot.getFloat('key.space.held')).toBe(1);
// No change
commit();
expect(snapshot.getFloat('key.space.held')).toBe(1);
// Release
keyState.set('space', false);
updateKeyChannels(writeBus, keyState);
commit();
expect(snapshot.getFloat('key.space.held')).toBe(0);
```

### Key Down Pulse
```typescript
// Test: Key down is one-frame pulse
writeBus.pulse('key.space.down');
commit();
expect(snapshot.getFloat('key.space.down')).toBe(1);
commit(); // no new pulse
expect(snapshot.getFloat('key.space.down')).toBe(0);
```

### WASD Axis
```typescript
// Test: WASD axis computation
keyState.set('keya', true);
keyState.set('keyd', false);
const axis = computeWasdAxis(keyState);
expect(axis.x).toBe(-1);

keyState.set('keya', true);
keyState.set('keyd', true);
const axis2 = computeWasdAxis(keyState);
expect(axis2.x).toBe(0); // Cancel out

keyState.set('keya', false);
keyState.set('keyd', true);
const axis3 = computeWasdAxis(keyState);
expect(axis3.x).toBe(1);
```

### Key Repeat Filtering
```typescript
// Test: Key repeat does not trigger additional down pulse
handleKeyDown({ code: 'Space', repeat: false }); // Initial press
handleKeyDown({ code: 'Space', repeat: true });  // Repeat
handleKeyDown({ code: 'Space', repeat: true });  // Repeat
commit();
// Should be exactly 1 down pulse, not 3
expect(downPulseCount('key.space.down')).toBe(1);
```

## Exit Criteria for MEDIUM -> HIGH Confidence

Before implementation, resolve these unknowns:

1. **Focus Scope Decision**
   - [ ] Decided: keyboard works on window focus OR canvas focus only
   - [ ] Documented in spec or CONTEXT file

2. **Key Code Format Decision**
   - [ ] Decided: use event.code as-is OR normalize to lowercase
   - [ ] Documented channel naming convention

3. **Browser Compatibility**
   - [ ] Tested keydown/keyup in Chrome, Firefox, Safari
   - [ ] Documented any differences
   - [ ] blur handling verified

4. **Axis Combination Decision**
   - [ ] Decided: WASD and arrows separate OR combined
   - [ ] Documented sign convention (+y = down)
