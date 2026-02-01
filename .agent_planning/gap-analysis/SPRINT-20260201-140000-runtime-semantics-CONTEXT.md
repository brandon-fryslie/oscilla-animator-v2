# Implementation Context: Runtime Semantic Upgrades

Generated: 2026-02-01T15:00:00Z
Status: DEFERRED — Research required when triggered

## Trigger Conditions

This sprint activates when any of these features are needed:
1. **Branch v1+**: Parallel timelines, preview branches → needs branch-scoped state
2. **Hot-swap lane safety**: Instance count changes during live editing → needs lane identity tracking
3. **Event freshness**: Consumers need to distinguish fresh vs stale events → needs stamp buffers

## Current Runtime Architecture (reference)

### State Storage (RuntimeState.ts)
- `state: Float64Array` — flat array, slots allocated by compiler
- `eventScalars: Float64Array` — event values
- `eventPrevPredicate: Uint8Array` — previous-frame event state
- Slots are `ValueSlot` (branded number) and `EventSlotId` (branded number)

### Lane Layout
- Fields use contiguous lanes: `state[baseSlot + lane]` where `lane ∈ [0, instanceCount)`
- No metadata tracks which lane maps to which instance
- On hot-swap, if instance count changes, all lanes are re-allocated (no migration)

### Event Handling
- Events are cleared at frame start (uniform)
- No per-event timestamp or freshness tracking
- Consumers assume events are fresh if present in current frame

## Research Questions (to answer before implementation)

### Lane Identity Tracking
1. What data structure maps `(ValueExprId, InstanceId) → slot`? Options:
   - Parallel metadata array alongside state array
   - Structured slot allocator that returns `{ slot, metadata }` pairs
   - Map<string, ValueSlot> keyed by `${exprId}:${instanceId}`
2. Performance impact: metadata lookup per lane per frame vs current direct indexing?
3. Hot-swap lane remapping: when instance count changes, which lanes survive?

### Branch-Scoped State
1. State isolation: copy-on-write branches or fully separate arrays?
2. Memory model: N branches × M slots = N×M storage, or sparse?
3. Branch merge semantics: how do branches recombine?
4. Must `BranchVarId` (src/core/ids.ts:28) be resolved before this can work?

### Event Stamp Buffers
1. Storage: parallel `Uint32Array` alongside event slots?
2. Granularity: frame number or tick number?
3. Clearing strategy: reset on read, or persist until overwritten?

## Files That Will Be Affected

| File | Likely Change |
|------|--------------|
| `src/runtime/RuntimeState.ts` | Add lane metadata, branch-scoped storage |
| `src/runtime/ScheduleExecutor.ts` | Read lane metadata for field evaluation |
| `src/runtime/Materializer.ts` | Write lane metadata during materialization |
| `src/runtime/StateMigration.ts` | Lane remapping on hot-swap |
| `src/compiler/backend/schedule-program.ts` | Emit lane metadata in steps |
| `src/compiler/ir/types.ts` | Add lane metadata to step types (if needed) |

## Estimated Scope

Each work item is a standalone sub-sprint:
- **Lane identity**: Medium (~200-400 lines changed, touches runtime hot loop)
- **Branch-scoped state**: Large (~500+ lines, new subsystem)
- **Event stamps**: Small (~100-200 lines, additive)

These can be done independently after Sprint 3 is complete.
