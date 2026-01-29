# Definition of Done: Block Surface

Generated: 2026-01-25
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260125-block-surface-PLAN.md

## Functional Criteria

### ExternalInput Block
- [ ] Block can be added to a patch via UI
- [ ] Channel config accepts any string
- [ ] Output produces float signal from external channel
- [ ] Default channel 'mouse.x' works immediately
- [ ] Patch with ExternalInput compiles without errors
- [ ] Patch with ExternalInput renders mouse-following behavior

### ExternalGate Block
- [ ] Block can be added to a patch via UI
- [ ] Channel and threshold configs work
- [ ] Output is 0 when input < threshold
- [ ] Output is 1 when input >= threshold
- [ ] Default threshold 0.5 produces expected behavior

### ExternalVec2 Block
- [ ] Block can be added to a patch via UI
- [ ] channelBase config works
- [ ] Output produces vec2 from channelBase.x and channelBase.y
- [ ] Default 'mouse' produces vec2 tracking mouse position
- [ ] Works with any channelBase that has .x and .y channels

### Registry
- [ ] getAllBlockTypes() includes 'ExternalInput', 'ExternalGate', 'ExternalVec2'
- [ ] getBlockTypesByCategory('io') includes all three blocks
- [ ] getBlockDefinition('ExternalInput') returns valid definition

## Technical Criteria

- [ ] No new TypeScript errors (npm run typecheck passes)
- [ ] Existing tests pass (npm run test)
- [ ] Unit tests for each block's lower function
- [ ] Integration test: ExternalInput -> renders circles following mouse

## Verification Steps

1. **Type Check**
   ```bash
   npm run typecheck
   ```

2. **Unit Tests**
   ```bash
   npm run test -- io-blocks
   ```

3. **Manual Verification**
   - Run dev server: `npm run dev`
   - Create new patch
   - Add ExternalInput block with channel 'mouse.x'
   - Connect to position.x of render block
   - Verify circles follow mouse X coordinate
   - Add ExternalVec2 block with channelBase 'mouse'
   - Connect to position of render block
   - Verify circles follow mouse position

4. **Integration Test**
   - Compile a patch with ExternalInput
   - Verify IR contains SigExprExternal with correct channel
   - Execute frame and verify output matches snapshot value

## Acceptance Test Cases

### ExternalInput Block
```typescript
// Test: ExternalInput produces correct IR
const patch = createTestPatch([
  { type: 'ExternalInput', config: { channel: 'test.value' } }
]);
const ir = compile(patch);
const external = ir.signals.find(s => s.kind === 'external');
expect(external?.which).toBe('test.value');
```

### ExternalGate Block
```typescript
// Test: ExternalGate thresholds correctly
// Setup: channel 'gate.input' = 0.3, threshold = 0.5
expect(evaluateGate(0.3, 0.5)).toBe(0);

// Setup: channel 'gate.input' = 0.7, threshold = 0.5
expect(evaluateGate(0.7, 0.5)).toBe(1);

// Edge case: exactly at threshold
expect(evaluateGate(0.5, 0.5)).toBe(1); // >= threshold
```

### ExternalVec2 Block
```typescript
// Test: ExternalVec2 reads both channels
// Setup: mouse.x = 0.25, mouse.y = 0.75
const patch = createTestPatch([
  { type: 'ExternalVec2', config: { channelBase: 'mouse' } }
]);
const ir = compile(patch);
// Should have two external signals: mouse.x and mouse.y
const externals = ir.signals.filter(s => s.kind === 'external');
expect(externals.map(e => e.which).sort()).toEqual(['mouse.x', 'mouse.y']);
```
