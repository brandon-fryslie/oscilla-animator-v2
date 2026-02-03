# Implementation Context: LowerEffects + Symbolic State Keys + Binding Pass
Generated: 2026-02-03

## Architecture Decision: Symbolic State Keys

**Decision:** State references in IR use `StableStateId` (symbolic, deterministic string key) instead of `StateSlotId` (physical, allocated numeric index). A post-lowering binding pass resolves symbolic keys to physical slots.

**Rationale (from ChatGPT consultation):**
- `StableStateId` already exists: `"blockId:stateKind"` — deterministic, survives recompilation
- No expression rewriting needed — IR natively holds symbolic keys
- Same pattern as compilers using symbols until register/stack allocation
- Scales to other late-bound resources (temp buffers, scratch arrays, etc.)
- Debuggability improves: IR dumps show meaningful keys, not opaque slot numbers

**User decisions:**
- Real IRBuilder is passed to blocks (no runtime sandboxing)
- PureIRBuilder enforcement via ESLint if needed, not runtime
- Focus is on effects return value + separate binding pass
- Stateful blocks migrated first (harder proof), pure blocks follow

## Current State (What Exists)

### StableStateId (already exists)
```typescript
// src/compiler/ir/types.ts
type StableStateId = string & { readonly __brand: 'StableStateId' };
function stableStateId(blockId: string, stateKind: string): StableStateId;
```

### Current ValueExprStateRead (needs change)
```typescript
// src/compiler/ir/value-expr.ts — MUST CHANGE
interface ValueExprStateRead {
  kind: 'stateRead';
  type: CanonicalType;
  stateSlot: StateSlotId;  // ← physical, must become StableStateId
}
```

### Current stateful block pattern (all 6 follow this)
```typescript
lower: ({ ctx, inputsById }) => {
  const stateSlot = ctx.b.allocStateSlot(stableId, { initialValue: 0 });  // IMPERATIVE
  const prev = ctx.b.stateRead(stateSlot, type);                          // IMPERATIVE
  const result = ctx.b.kernelZip([prev, input, ...], fn, type);           // pure expr
  ctx.b.stepStateWrite(stateSlot, result);                                // IMPERATIVE
  const slot = ctx.b.allocSlot();                                          // IMPERATIVE
  return { outputsById: { out: { id: result, slot, type, stride } } };
};
```

### Target stateful block pattern
```typescript
lower: ({ ctx, inputsById }) => {
  const stateKey = stableStateId(ctx.instanceId, 'lag');
  const prev = ctx.b.stateRead(stateKey, type);                            // symbolic key
  const result = ctx.b.kernelZip([prev, input, ...], fn, type);            // pure expr
  return {
    outputsById: { out: { id: result, type, stride: payloadStride(type.payload) } },
    effects: {
      stateDecls: [{ key: stateKey, initialValue: 0 }],
      stepRequests: [{ kind: 'stateWrite', stateKey, value: result }],
      slotRequests: [{ portId: 'out', type }],
    },
  };
};
```

## Key Files

| File | Role | Changes Needed |
|------|------|----------------|
| `src/compiler/ir/lowerTypes.ts` | ValueRefExpr, lower types | Add LowerEffects, StateDecl, StepRequest, SlotRequest |
| `src/compiler/ir/value-expr.ts` | ValueExprStateRead | Change stateSlot → stateKey (StableStateId) |
| `src/compiler/ir/IRBuilder.ts` | IRBuilder interface | stateRead() takes StableStateId |
| `src/compiler/ir/IRBuilderImpl.ts` | IRBuilder impl | Update stateRead(), remove allocStateSlot from lowering path |
| `src/blocks/registry.ts` | LowerResult type | Add effects? field |
| `src/compiler/backend/lower-blocks.ts` | Orchestrator | Add binding pass invocation, remove inline slot allocation |
| `src/blocks/signal/lag.ts` | Lag block | Migrate to effects-as-data |
| `src/blocks/signal/phasor.ts` | Phasor block | Migrate to effects-as-data |
| `src/blocks/signal/unit-delay.ts` | UnitDelay block | Migrate both phases |
| `src/blocks/signal/accumulator.ts` | Accumulator block | Migrate to effects-as-data |
| `src/blocks/event/sample-hold.ts` | SampleHold block | Migrate to effects-as-data |
| `src/blocks/lens/slew.ts` | Slew block | Migrate to effects-as-data |
| `src/blocks/math/add.ts` | Add block | Migrate to effects-as-data |
| `src/blocks/signal/default-source.ts` | DefaultSource | Migrate to effects-as-data |
| `src/blocks/color/hue-rainbow.ts` | HueRainbow | Migrate to effects-as-data |

## 6 Stateful Blocks — Side Effects Inventory

All 6 follow the same pattern with minor variations:

| Block | State Key | initialValue | Extra | Step |
|-------|-----------|-------------|-------|------|
| Slew | `ctx.instanceId:slew` | 0 | — | stateWrite |
| Lag | `ctx.instanceId:lag` | config.initialValue ?? 0 | constant(smoothing) | stateWrite |
| Phasor | `ctx.instanceId:phasor` | config.initialPhase ?? 0 | time('dt'), constant(1000) | stateWrite |
| UnitDelay | `ctx.instanceId:delay` | config.initialValue ?? 0 | Two-phase (lowerOutputsOnly) | stateWrite |
| SampleHold | `ctx.instanceId:sample` | config.initialValue ?? 0 | eventRead(trigger) | stateWrite |
| Accumulator | `ctx.instanceId:accumulator` | 0 | constant(0) | stateWrite |

**Key observation:** ALL 6 blocks have exactly 1 stateDecl and 1 stepStateWrite. No block has multiple state slots or complex step patterns.

## SCC Two-Phase Interaction

UnitDelay is the only block with `lowerOutputsOnly`. In the current SCC orchestration:
1. Phase 1: UnitDelay calls `allocStateSlot()` + `stateRead()` + `allocSlot()` → returns partial LowerResult with `stateSlot`
2. Other blocks in SCC are lowered using UnitDelay's output
3. Phase 2: UnitDelay gets inputs, calls `stepStateWrite(existingOutputs.stateSlot, input.id)`

In the effects model:
1. Phase 1: UnitDelay calls `stateRead(stableId, type)` → returns partial result with `effects.stateDecls`
2. Binding pass resolves UnitDelay's state decl + slot request (so other blocks can reference its output)
3. Phase 2: UnitDelay gets inputs, returns `effects.stepRequests` with stateWrite
4. Binding pass processes phase 2 step requests

The binding pass may need to run per-SCC component, not globally, to handle the phase ordering.

## Runtime Impact

The binding pass must produce the same runtime structures that `allocStateSlot()` currently produces:
- `stateMappings[]` array in IRBuilderImpl (scalar and field variants)
- State slot counter management
- Initial value arrays

The binding pass calls `allocStateSlot()` on behalf of blocks — same function, just called from the pass instead of from blocks directly.
