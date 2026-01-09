# Handoff: Oscilla v2 Architectural Refactor

**Created**: 2026-01-05
**For**: Continuation of v2 clean architecture implementation
**Status**: in-progress (steel thread working, needs architectural refinement)

---

## Objective

Refactor Oscilla v2 blocks into composable primitives with enforced complexity limits. Each block should do ONE thing. Eliminate "god blocks" like PositionSwirl that combine multiple behaviors.

## Current State

### What's Been Done

**Core Infrastructure (COMPLETE)**:
- `src/types/index.ts` - TypeDesc, branded IDs
- `src/graph/` - Patch, Edge, Block types, PatchBuilder
- `src/compiler/ir/` - SigExpr, FieldExpr, EventExpr, Step, IRProgram
- `src/compiler/blocks/registry.ts` - ONE pattern: registerBlock() + lower()

**Runtime (COMPLETE)**:
- `src/runtime/BufferPool.ts` - Typed array pooling
- `src/runtime/timeResolution.ts` - Time model resolution
- `src/runtime/RuntimeState.ts` - ValueStore, FrameCache, ExternalInputs
- `src/runtime/Materializer.ts` - Field materialization with kernels
- `src/runtime/ScheduleExecutor.ts` - Frame execution

**Steel Thread Demo (WORKING)**:
- 2000 rainbow particles with per-element pulsing and jitter
- 60 FPS rendering at localhost:5174
- Pipeline: time -> domain -> per-element fields -> materialize -> render

**Helper Functions Added** (in registry.ts):
- `sig(inputs, port)` - Extract signal input (throws if missing)
- `field(inputs, port)` - Extract field input (throws if missing)
- `domain(inputs, port)` - Extract domain input (throws if missing)
- `sigOrField(inputs, port)` - Extract polymorphic input

### What's In Progress

1. **Block file organization** - Currently all blocks in monolithic files:
   - `render.ts` (536 lines) - Contains 6 blocks
   - `domain.ts` (212 lines) - Contains 4 blocks
   - `signal.ts` (150 lines) - Contains 4 blocks
   - `time.ts` (121 lines) - Contains 2 blocks

2. **God block splitting** - PositionSwirl does 4 things:
   - Golden spiral angle calculation
   - Sqrt radius distribution
   - Spin multiplier (inner spins faster)
   - Polar -> Cartesian conversion

### What Remains

1. **Split blocks into separate files** (one file per block)
2. **Split PositionSwirl** into composable parts:
   - `FieldGoldenAngle` - Golden ratio angle spread
   - `FieldSqrt` - Square root distribution
   - `FieldPolarToCartesian` - Polar to cartesian conversion
   - `FieldSpin` or integrate spin into angle calculation
3. **Split HueRainbow** - Currently combines phase offset + HSV->RGB
4. **Establish complexity constraints**:
   - Max ~5 inputs per block
   - ONE mathematical/logical concept per block
   - Kernels: single operation type (one formula per element)
5. **Fix hard wrap issue** - Animation has visible discontinuity at phase wrap

## Context & Background

### Why We're Doing This

The v1 codebase had "god blocks" that agents kept copying. Clean v2 rewrite needs:
- Composable primitives that combine to create behaviors
- Enforced limits on block complexity
- Clear patterns that agents can follow correctly

### Key Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| ONE block pattern | `outputsById` only, no `outputs` array | 2026-01-05 |
| IR-only path | No signalBridge, no closure evaluation | 2026-01-05 |
| Helper functions for inputs | Eliminates conditional boilerplate | 2026-01-05 |
| Phase for animation | Use 0..1 wrapping phase, not raw time | 2026-01-05 |
| Stateless fields | No physics simulation (requires state) | 2026-01-05 |

### Important Constraints

**NO GOD BLOCKS**:
- Each block does ONE composable behavior
- If a block does multiple things, split it
- Blocks should be reusable across contexts

**Complexity Limits**:
- Blocks: max ~5 inputs, ONE concept
- Kernels: single formula per element, no state

**Architectural Rules**:
- ONE pattern per concept
- No feature flags, no dual modes
- Renderer is dumb (just draws commands)

## Acceptance Criteria

- [ ] Each block in its own file under `src/compiler/blocks/<category>/`
- [ ] PositionSwirl split into 3-4 composable blocks
- [ ] HueRainbow split into composable parts
- [ ] No block file > 100 lines
- [ ] No conditional input validation (use helper functions)
- [ ] All tests pass
- [ ] Steel thread still renders correctly

## Scope

### Files to Refactor

**Current monolithic files**:
- `src/compiler/blocks/render.ts` (536 lines -> 6+ files)
  - FieldFromDomainId
  - FieldPulse
  - PositionSwirl (split into 3-4)
  - HueRainbow (split into 2)
  - RenderInstances2D
  - FieldJitter2D
  - FieldAttract2D (remove - physics needs state)

- `src/compiler/blocks/domain.ts` (212 lines -> 4 files)
  - GridDomain
  - DomainN
  - FieldBroadcast
  - FieldMap
  - FieldZipSig

- `src/compiler/blocks/signal.ts` (150 lines -> 4 files)
  - ConstFloat
  - AddSignal
  - MulSignal
  - Oscillator
  - MousePosition (keep but may not use yet)

- `src/compiler/blocks/time.ts` (121 lines -> 2 files)
  - InfiniteTimeRoot
  - FiniteTimeRoot

### Out of Scope

- Physics simulation (requires stateful runtime)
- Mouse attraction (deferred - needs physics)
- UI components
- Editor integration

## Implementation Approach

### Recommended Steps

1. **Create directory structure**:
   ```
   src/compiler/blocks/
     signal/
       ConstFloat.ts
       AddSignal.ts
       MulSignal.ts
       Oscillator.ts
     domain/
       GridDomain.ts
       DomainN.ts
       FieldBroadcast.ts
       FieldMap.ts
     render/
       FieldFromDomainId.ts
       FieldPulse.ts
       RenderInstances2D.ts
       FieldJitter2D.ts
     time/
       InfiniteTimeRoot.ts
       FiniteTimeRoot.ts
     index.ts  # Re-exports all
   ```

2. **Split PositionSwirl** into:
   - `FieldGoldenAngle.ts` - `theta = id01 * goldenAngle * turns`
   - `FieldSqrtDistribution.ts` - `radius = radius * sqrt(id01)`
   - `FieldPolarToCartesian.ts` - `(r, theta) -> (x, y)`
   - Update main.ts to compose these

3. **Split HueRainbow** into:
   - `FieldHueFromPhase.ts` - `hue = wrap(phase + id01)`
   - Keep HSV->RGB as kernel (pure transform)

4. **Update main.ts** to use new composable blocks

5. **Verify visual result unchanged**

### Patterns to Follow

**One block per file**:
```typescript
// src/compiler/blocks/signal/AddSignal.ts
import { registerBlock, portId, sigType, sig } from '../registry';

registerBlock({
  type: 'AddSignal',
  inputs: [
    { portId: portId('a'), type: sigType('float') },
    { portId: portId('b'), type: sigType('float') },
  ],
  outputs: [{ portId: portId('out'), type: sigType('float') }],
  lower: ({ b, inputsById }) => {
    const a = sig(inputsById, 'a');
    const bVal = sig(inputsById, 'b');
    const id = b.sigBinOp(a.id, bVal.id, OpCode.Add, sigType('float'));
    return { out: { kind: 'sig', id, type: sigType('float') } };
  },
});
```

**Composable blocks**:
```typescript
// Build position from primitives
const angle = b.addBlock('FieldGoldenAngle', { turns: 50 });
const radius = b.addBlock('FieldSqrtDistribution', {});
const pos = b.addBlock('FieldPolarToCartesian', {});

b.wire(id01, 'id01', angle, 'id01');
b.wire(id01, 'id01', radius, 'id01');
b.wire(baseRadius, 'out', radius, 'radius');
b.wire(angle, 'angle', pos, 'angle');
b.wire(radius, 'radius', pos, 'radius');
```

### Known Gotchas

- PositionSwirl's "inner particles spin faster" behavior is desirable - preserve it
- The phase wrap causes visual discontinuity - investigate time model
- FieldPulse already composable - use as reference pattern
- HSV->RGB is already a kernel - just expose properly

## Reference Materials

### Planning Documents
- `.agent_planning/HANDOFF-steel-thread-2026-01-05.md` - Previous handoff
- `ARCHITECTURE.md` - v2 architecture spec
- `design-docs/RENDER-PIPELINE.md` - Render pipeline design

### Codebase References
- `src/compiler/blocks/registry.ts` - Block registration pattern
- `src/compiler/blocks/render.ts:47-137` - FieldPulse (good composable example)
- `src/runtime/Materializer.ts` - Kernel implementations

## Questions & Blockers

### Open Questions

- [ ] Should spin multiplier be a separate block or config on angle block?
- [ ] How granular is "composable enough"? FieldPulse has 5 inputs.
- [ ] Should we add tests before or after refactor?

### Need User Input On

- Hard wrap issue - is this a phase calculation bug or time model issue?
- Complexity limit enforcement - lint rule? Runtime check? Just convention?

## Testing Strategy

### Existing Tests
- `src/compiler/__tests__/compile.test.ts` - 11 tests
- `src/runtime/__tests__/integration.test.ts` - 4 tests

### Manual Testing
- `npm run dev` -> open localhost:5174
- Should see 2000 rainbow particles swirling with per-element pulsing

### New Tests Needed
- [ ] Each new block has unit test
- [ ] Composable blocks produce same result as PositionSwirl

## Success Metrics

- All 15+ tests pass
- Steel thread renders same visual result
- No block file > 100 lines
- No conditional input validation boilerplate
- Each block clearly does ONE thing

---

## Next Steps for Agent

**Immediate actions**:
1. Create directory structure for blocks
2. Move existing blocks to individual files (mechanical refactor)
3. Verify build still works
4. Split PositionSwirl into composable parts
5. Update main.ts to use new blocks

**Before starting implementation**:
- [ ] Run `npm run dev` to see current visual
- [ ] Understand PositionSwirl algorithm fully

**When complete**:
- [ ] Update this handoff with results
- [ ] All tests pass
- [ ] Visual demo unchanged
