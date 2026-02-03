# Definition of Done: LowerEffects + Symbolic State Keys + Binding Pass
Generated: 2026-02-03

## Verification Criteria

### Types & IR Changes
- [ ] `LowerEffects` type defined: `{ stateDecls, stepRequests, slotRequests }`
- [ ] `StateDecl` uses `StableStateId` as key (symbolic, not physical)
- [ ] `StepRequest` is a discriminated union (stateWrite, fieldStateWrite, materialize, etc.)
- [ ] `SlotRequest` is `{ portId, type: CanonicalType }`
- [ ] `LowerResult` updated to include `effects?: LowerEffects`
- [ ] `ValueExprStateRead` uses `stateKey: StableStateId` (not `stateSlot: StateSlotId`)
- [ ] `IRBuilder.stateRead()` takes `StableStateId` (not `StateSlotId`)

### Stateful Block Migration (all 6)
- [ ] Slew: returns LowerEffects, no imperative allocation calls
- [ ] Lag: returns LowerEffects, no imperative allocation calls
- [ ] Phasor: returns LowerEffects, no imperative allocation calls
- [ ] UnitDelay: returns LowerEffects (both phases), no imperative allocation calls
- [ ] SampleHold: returns LowerEffects, no imperative allocation calls
- [ ] Accumulator: returns LowerEffects, no imperative allocation calls
- [ ] No stateful block calls allocStateSlot(), stepStateWrite(), or allocSlot() directly

### Pure Block Migration
- [ ] Add: returns LowerEffects with slotRequests
- [ ] HueRainbow: returns LowerEffects with slotRequests
- [ ] DefaultSource: returns LowerEffects with slotRequests

### Binding Pass
- [ ] `resolveEffects()` function exists and processes all LowerEffects
- [ ] Binding pass allocates state slots (StableStateId → StateSlotId mapping)
- [ ] Binding pass allocates output slots (SlotRequest → ValueSlot)
- [ ] Binding pass registers steps (StepRequest → Step with physical IDs)
- [ ] Binding pass handles slot registration (registerSlotType, registerSigSlot, registerFieldSlot)
- [ ] Binding pass integrated into lower-blocks.ts orchestrator

### Legacy Cleanup
- [ ] Inline slot allocation for pure blocks removed from orchestrator
- [ ] Inline slot registration per-block removed from orchestrator (binding pass handles it)
- [ ] `ValueRefExpr.slot` no longer optional (all slots allocated by binding pass)

### Integration
- [ ] `npm run test` passes with 0 failures
- [ ] `npm run typecheck` passes with 0 errors
- [ ] All stateful block tests pass (Lag, Phasor, UnitDelay, Slew, SampleHold, Accumulator)
- [ ] Feedback loop tests pass (UnitDelay in SCC)
- [ ] Hot-swap / state continuity still works (state mappings produced correctly by binding pass)

## What "Done" Means
Block lowering is fully declarative. No block calls allocStateSlot(), stepStateWrite(), allocSlot(), or any slot registration method directly. Blocks return expressions + effects. A post-lowering binding pass resolves symbolic state keys to physical slots and processes all effects. The IR uses StableStateId (symbolic) for state references, enabling clean separation between semantic identity and physical allocation.
