# Sprint Status: Block Surface

**Sprint:** SPRINT-20260125-block-surface
**Status:** COMPLETE
**Date Completed:** 2026-01-25

## Summary

Successfully implemented all three external input blocks (ExternalInput, ExternalGate, ExternalVec2) with proper lowering to sigExternal IR expressions.

## Completed Work Items

### P0: ExternalInput Block ✅
- Block type 'ExternalInput' registered in src/blocks/io-blocks.ts
- Category: 'io', Capability: 'io'
- Cardinality: preserve (cardinality-generic)
- Config input: channel (string, default 'mouse.x')
- Output: value (float)
- Lower: ctx.b.sigExternal(channel, signalType('float'))
- Appears in block palette under 'io' category

### P1: ExternalGate Block ✅
- Block type 'ExternalGate' registered
- Category: 'io', Capability: 'io'
- Cardinality: preserve
- Config inputs: channel (default 'mouse.x'), threshold (default 0.5)
- Output: gate (float 0/1)
- Lower: sigExternal + implements >= using formula: 1 - (threshold > input)
- Correctly handles edge case: input == threshold returns 1

### P2: ExternalVec2 Block ✅
- Block type 'ExternalVec2' registered
- Category: 'io', Capability: 'io'
- Cardinality: preserve
- Config input: channelBase (default 'mouse')
- Output: position (vec2)
- Lower: reads channelBase.x and channelBase.y via sigExternal
- Packs into vec2 using stepSlotWriteStrided

### P3: Registry Integration ✅
- All three blocks registered in io-blocks.ts
- io-blocks.ts imported in src/compiler/compile.ts
- Blocks appear in getAllBlockTypes()
- Blocks appear in getBlockTypesByCategory('io')

## Test Results

All 23 unit tests passing:
- Registry tests (5 tests)
- ExternalInput tests (7 tests)
- ExternalGate tests (7 tests)
- ExternalVec2 tests (4 tests)

## Commits

1. `8ed41d7` - feat(io-blocks): Add ExternalInput, ExternalGate, and ExternalVec2 blocks
2. `1e69439` - fix(io-blocks): Implement >= threshold for ExternalGate block

## Files Modified

- Created: `src/blocks/io-blocks.ts` (173 lines)
- Created: `src/blocks/__tests__/io-blocks.test.ts` (355 lines)
- Modified: `src/compiler/compile.ts` (added import)

## Technical Notes

### ExternalGate >= Implementation

Since OpCode only provides Gt (>), Lt (<), and Eq (==), implemented >= using:
```
input >= threshold  <=>  NOT(threshold > input)  <=>  1 - (threshold > input)
```

This correctly handles the edge case where input equals threshold.

### Vec2 Packing Pattern

ExternalVec2 uses the strided slot write pattern:
```typescript
const stride = strideOf('vec2'); // 2
const slot = ctx.b.allocSlot(stride);
const components = [xSig, ySig];
ctx.b.stepSlotWriteStrided(slot, components);
```

This is the established pattern for multi-component signals (vec2, vec3, color).

## Next Steps

Sprint 2 is complete. The blocks are ready for use once Sprint 1 (Channel Infrastructure) is integrated into the runtime.

For Sprint 3 (UI Integration), these blocks will need:
- Block palette entries
- Config UI for channel name input
- Threshold slider for ExternalGate
- Documentation/tooltips
