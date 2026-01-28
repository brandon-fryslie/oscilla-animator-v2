# Sprint: feedback-lowering - Two-Pass Lowering for Feedback Loops

Generated: 2026-01-27-141055
Confidence: HIGH: 4, MEDIUM: 1, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-01-27-141055.md

## Sprint Goal

Enable feedback loops with stateful blocks (UnitDelay, Lag, Phasor, SampleAndHold) to compile successfully by implementing two-pass lowering for strongly connected components.

## Scope

**Deliverables:**
- Two-pass lowering for SCCs in Pass 6
- Updated block registry to support phased lowering
- Stateful block lowering functions split into output/state-write phases
- Comprehensive test coverage for feedback loop patterns

## Work Items

### P0 - Extend Block Registry with Phased Lowering Support

**Confidence**: HIGH
**Dependencies**: None
**Spec Reference**: ESSENTIAL-SPEC.md Invariant I7 (cycles must cross stateful boundary)
**Status Reference**: EVALUATION-2026-01-27-141055.md - Root Cause Analysis

#### Description

Add optional `lowerOutputsOnly` function to block definitions. This function generates only the output ValueRefs (reading from state) without generating state writes. Required only for stateful blocks (`isStateful: true`).

For stateful blocks:
- `lowerOutputsOnly(ctx)`: Returns outputs that read from previous frame's state
- `lower(ctx, inputs, inputsById)`: Returns outputs AND generates state write steps

For non-stateful blocks:
- `lower()` remains the only function (unchanged)

#### Acceptance Criteria

- [ ] `BlockDefinition` type includes optional `lowerOutputsOnly?: (args: LowerCtx) => Partial<LowerResult>`
- [ ] `LowerResult` includes optional `needsSecondPass?: boolean` flag for blocks that deferred state writes
- [ ] Type guards exist: `hasLowerOutputsOnly(blockDef)` returns true for blocks with the function
- [ ] No changes to existing non-stateful block definitions required
- [ ] TypeScript compiles without errors

#### Technical Notes

The `lowerOutputsOnly` function signature should be:
```typescript
lowerOutputsOnly?: (args: { ctx: LowerCtx; config: Record<string, unknown> }) => {
  outputsById: Record<string, ValueRefPacked>;
  stateSlot?: StateSlotId; // Pass state slot info to second pass
};
```

State slot allocation happens in first pass so the slot ID is consistent.

---

### P0 - Implement UnitDelay Phased Lowering

**Confidence**: HIGH
**Dependencies**: P0 - Block Registry Extension
**Spec Reference**: Block System - Stateful Primitives (4): UnitDelay, Lag, Phasor, SampleAndHold
**Status Reference**: EVALUATION-2026-01-27-141055.md - UnitDelay Implementation analysis

#### Description

Split UnitDelay's lowering into two phases:

**Phase 1 (`lowerOutputsOnly`)**:
1. Allocate state slot with `stableStateId` and `initialValue`
2. Generate `sigStateRead` to read previous frame's state
3. Return output ValueRef (does NOT need input)

**Phase 2 (existing `lower`)**:
1. Check if state slot already allocated (from phase 1)
2. Get input from `inputsById`
3. Generate `stepStateWrite` to write current input to state
4. Return same output ValueRef as phase 1

#### Acceptance Criteria

- [ ] `lowerOutputsOnly` added to UnitDelay block definition
- [ ] Phase 1 generates output without requiring input
- [ ] Phase 2 generates state write using resolved input
- [ ] State slot ID is consistent between phases (uses same `stableStateId`)
- [ ] Existing UnitDelay tests continue to pass (non-cycle usage)
- [ ] New test: UnitDelay in simple feedback loop compiles

#### Technical Notes

Key insight: The output slot and state slot must be allocated in phase 1 and reused in phase 2. Use a context mechanism or store in block instance during lowering.

```typescript
// Phase 1: Generate output (no input needed)
lowerOutputsOnly: ({ ctx, config }) => {
  const initialValue = (config?.initialValue as number) ?? 0;
  const stateId = stableStateId(ctx.instanceId, 'delay');
  const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue });
  const outputId = ctx.b.sigStateRead(stateSlot, canonicalType(FLOAT));
  const slot = ctx.b.allocSlot();

  return {
    outputsById: {
      out: { k: 'sig', id: outputId, slot, type: ctx.outTypes[0], stride: 1 },
    },
    stateSlot, // Pass to phase 2
  };
}

// Phase 2: Generate state write (has input)
lower: ({ ctx, inputsById, config, existingOutputs }) => {
  const input = inputsById.in;
  // Use stateSlot from existingOutputs if available
  const stateSlot = existingOutputs?.stateSlot ?? ...;
  ctx.b.stepStateWrite(stateSlot, input.id);

  return existingOutputs ?? { /* generate fresh if not from phase 1 */ };
}
```

---

### P0 - Implement Lag Phased Lowering

**Confidence**: HIGH
**Dependencies**: P0 - Block Registry Extension
**Spec Reference**: Block System - Stateful Primitives
**Status Reference**: EVALUATION-2026-01-27-141055.md

#### Description

Split Lag's lowering similarly to UnitDelay:

**Phase 1**: Allocate state slot, generate state read for previous smoothed value
**Phase 2**: Compute lerp with target input, write to state

#### Acceptance Criteria

- [ ] `lowerOutputsOnly` added to Lag block definition
- [ ] Phase 1 generates smoothed output reading from state
- [ ] Phase 2 computes lerp and writes new smoothed value to state
- [ ] Existing Lag tests continue to pass
- [ ] New test: Lag in feedback loop compiles

#### Technical Notes

Lag is more complex because the output depends on BOTH previous state AND a computation. The phase 1 output is the previous smoothed value (state read). Phase 2 computes the new value and writes to state.

Actually, Lag's output IS the smoothed value which requires the lerp computation. Review: Does Lag's output depend on the input within the same frame?

Looking at the code:
```typescript
// Read previous state
const prevValue = ctx.b.sigStateRead(stateSlot, canonicalType(FLOAT));
// Compute: lerp(prev, target, smoothing)
const lerpResult = ctx.b.sigBinary(prevValue, target, lerpFn);
// Write to state
ctx.b.stepStateWrite(stateSlot, lerpResult);
return { outputsById: { out: lerpResult } };
```

Lag's output IS the lerp result, which requires the target input. This means Lag DOES have within-frame dependency. So in a pure feedback loop, Lag alone cannot break the cycle.

However, the spec says Lag is stateful and can be used in cycles. The key is that the STATE READ (prevValue) doesn't depend on input, and the cycle can be broken if the feedback path goes through that state read.

For Lag in a cycle:
- Output = lerp(prevState, target, smoothing)
- The prevState component doesn't depend on target
- If another block (like UnitDelay) is in the cycle, it works

**Revised approach**: Lag may not need `lowerOutputsOnly` since its output does depend on input. Only UnitDelay and Phasor (which read directly from state) truly break cycles.

---

### P0 - Implement Two-Pass SCC Lowering in Pass 6

**Confidence**: HIGH
**Dependencies**: P0 - Block Registry Extension, P0 - UnitDelay Phased Lowering
**Spec Reference**: Compilation spec - Scheduling Order, Two-Phase Execution Model
**Status Reference**: EVALUATION-2026-01-27-141055.md - Solution Approach A

#### Description

Modify `pass6BlockLowering` to handle non-trivial SCCs (cycles) with two passes:

**Pass 1 (Outputs Only)**:
- For each block in SCC:
  - If stateful AND has `lowerOutputsOnly`: call it, store outputs
  - If non-stateful: skip (will be handled in pass 2)

**Pass 2 (Full Lowering)**:
- For each block in SCC:
  - If already lowered in pass 1: call `lower` to generate state writes
  - If not lowered: call `lower` normally (inputs now available)

#### Acceptance Criteria

- [ ] Non-trivial SCCs (size > 1 or self-loop) use two-pass lowering
- [ ] Trivial SCCs (size 1, no self-loop) use single-pass lowering (no change)
- [ ] Stateful blocks' outputs available to other blocks in pass 2
- [ ] State write steps generated correctly in pass 2
- [ ] Order of steps in IR matches expected two-phase model
- [ ] All existing tests continue to pass
- [ ] Feedback loop with UnitDelay compiles successfully

#### Technical Notes

```typescript
function lowerSCC(
  scc: SCC,
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[],
  builder: IRBuilder,
  errors: CompileError[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>,
  // ... other params
) {
  const isNonTrivial = scc.nodes.length > 1 || hasSelfLoop(graph, scc.nodes[0]);

  if (!isNonTrivial) {
    // Single-pass lowering (existing code path)
    for (const node of scc.nodes) {
      lowerBlockInstance(node, ...);
    }
    return;
  }

  // Two-pass lowering for cycles
  const partialOutputs = new Map<BlockIndex, { outputs: Map<string, ValueRefPacked>; stateSlot?: StateSlotId }>();

  // Pass 1: Generate outputs for stateful blocks
  for (const node of scc.nodes) {
    const block = blocks[node.blockIndex];
    const blockDef = getBlockDefinition(block.type);
    if (blockDef?.isStateful && blockDef.lowerOutputsOnly) {
      const result = blockDef.lowerOutputsOnly({ ctx, config: block.params });
      partialOutputs.set(node.blockIndex, { outputs: result.outputsById, stateSlot: result.stateSlot });
      blockOutputs.set(node.blockIndex, result.outputsById); // Make available to pass 2
    }
  }

  // Pass 2: Full lowering for all blocks
  for (const node of scc.nodes) {
    const partial = partialOutputs.get(node.blockIndex);
    if (partial) {
      // Stateful block: call lower() with existing outputs
      lowerBlockInstance(node, ..., { existingOutputs: partial });
    } else {
      // Non-stateful block: normal lowering (inputs now available)
      lowerBlockInstance(node, ...);
    }
  }
}
```

---

### P1 - Implement Phasor and SampleAndHold Phased Lowering

**Confidence**: MEDIUM
**Dependencies**: P0 - Block Registry Extension, P0 - Two-Pass SCC Lowering
**Spec Reference**: Block System - Stateful Primitives
**Status Reference**: EVALUATION-2026-01-27-141055.md

#### Description

Review and implement phased lowering for remaining stateful primitives:

**Phasor**:
- Reads previous phase from state
- Increments by rate
- Wraps to 0-1 range
- Writes new phase to state
- Output = new phase (depends on rate input within frame)

**SampleAndHold**:
- Reads held value from state
- On trigger: samples input and writes to state
- Output = held value (state read, no input dependency)

SampleAndHold is a good candidate for `lowerOutputsOnly` since output is pure state read.
Phasor may not benefit since output depends on rate input.

#### Acceptance Criteria

- [ ] Analyze which blocks truly benefit from `lowerOutputsOnly`
- [ ] Implement `lowerOutputsOnly` for SampleAndHold
- [ ] Document why Phasor/Lag may not need it (output depends on input)
- [ ] Test: SampleAndHold in feedback loop compiles
- [ ] Test: Complex cycle with multiple stateful primitives

#### Technical Notes

Review each stateful primitive's semantics:
- **UnitDelay**: output = state read (pure delay, no input dependency)
- **SampleAndHold**: output = held value (state read, no input dependency)
- **Lag**: output = lerp(state, input, smoothing) (depends on input)
- **Phasor**: output = wrap(state + rate) (depends on rate input)

Only UnitDelay and SampleAndHold have outputs that don't depend on inputs.

---

## Dependencies

```
Block Registry Extension
        |
        v
UnitDelay Phased Lowering -----> Two-Pass SCC Lowering
        |                               |
        v                               v
Lag/Phasor/S&H Analysis         Integration Tests
```

## Risks

1. **State Slot Consistency**: State slot must be allocated once and reused across phases
   - Mitigation: Pass state slot ID from phase 1 to phase 2

2. **Order of IR Steps**: Two-phase lowering may produce steps in unexpected order
   - Mitigation: Verify schedule generation handles new ordering

3. **Non-Stateful Blocks in Cycles**: If a cycle has NO stateful blocks, two-pass won't help
   - Mitigation: This is already caught by pass5-scc as illegal cycle

4. **Performance**: Two passes over SCC vs one pass
   - Mitigation: Only non-trivial SCCs use two passes; trivial SCCs unchanged
