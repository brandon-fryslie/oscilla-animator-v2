---
topic: 03
name: Time System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/03-time-system.md
generated: 2026-01-23T00:30:00Z
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: [topic-04-compilation]
---

# Context: Topic 03 — Time System

## What the Spec Requires

1. Single TimeRoot block per patch (system-managed, not user-placeable) [I5]
2. tMs: monotonic, unbounded, integer milliseconds, never wraps/resets/clamps [I1]
3. dt: float delta time since last frame
4. phaseA/phaseB: distinct 'phase' PayloadType, range [0,1), cyclic wrapping
5. Phase arithmetic rules: phase+float=phase, phase*float=phase, phase+phase=ERROR, phase-phase=float
6. PhaseToFloat, FloatToPhase, PhaseDistance utility functions
7. pulse: discrete unit event, fires every frame
8. palette: HSV rainbow cycling (hue=phaseA, sat=1, val=0.5)
9. energy: 0.5 + 0.5*sin(phaseA*2pi), float [0,1]
10. 5 MVP Rails (time, phaseA, phaseB, pulse, palette) as derived blocks
11. Rails are blocks with role `{ kind: 'derived', meta: { kind: 'rail', ... } }`
12. Hot-swap: tMs continues, rail values continue, state cells with matching StateId preserved
13. Atomic swap: old program renders until new is ready, no flicker
14. Phase continuity on speed/period change: `new_phase = old_phase + (new_speed - old_speed) * elapsed_time`
15. Determinism: no Math.random() at runtime; all randomness seeded
16. Scheduling model: every tick: sample inputs -> update time -> continuous subgraph -> discrete events -> render outputs

## Current State (Topic-Level)

### How It Works Now

The time system has a working InfiniteTimeRoot block that produces tMs, phaseA, phaseB, pulse, palette, and energy outputs. Pass 3 validates exactly-one TimeRoot and extracts the time model. At runtime, `resolveTime()` in `timeResolution.ts` computes phases from absolute time with wrap detection. The TimeState lives in SessionState and survives hot-swap. However, several spec requirements are missing: 'phase' is not a distinct PayloadType (it's float+unit:phase01), dt is not a block output, rails don't exist as blocks, and pulse only fires on phase wrap rather than every frame.

### Patterns to Follow

- Block registration via `registerBlock()` in `src/blocks/registry.ts`
- SignalType construction via `signalType()` / `signalTypeTrigger()` in `src/core/canonical-types.ts`
- Time signals referenced via `SigExprTime` nodes with `which: 'tMs' | 'phaseA' | ...`
- SessionState/ProgramState split for hot-swap lifecycle (`src/runtime/RuntimeState.ts`)

## Work Items

### WI-1: Add 'dt' Output to InfiniteTimeRoot Block

**Status**: WRONG (missing output port)
**Spec requirement**: TimeRoot outputs dt as `one + continuous + float`
**Files involved**:

| File | Role |
|------|------|
| `src/blocks/time-blocks.ts` | Block definition |
| `src/compiler/passes-v2/pass3-time.ts` | Time signal generation |

**Current state**: dt is computed in `timeResolution.ts` and stored in `EffectiveTime.dt`, referenced in SigExprTime as `'dt'`. But the InfiniteTimeRoot block definition has no `dt` output port, so it is not connectable in the graph.
**Required state**: Add `dt: { label: 'Delta Time', type: signalType('float') }` to outputs, emit it in the lower function.
**Suggested approach**: Add output definition and lower emission, mirroring the pattern of other outputs.
**Risks**: Low - additive change.
**Depends on**: none

### WI-2: Fix Pulse to Fire Every Frame

**Status**: PARTIAL
**Spec requirement**: pulse is a "frame tick trigger" — fires every frame
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/timeResolution.ts:131-133` | Pulse computation |

**Current state**: Pulse is 1.0 only when phaseA or phaseB wraps (crosses 0.5 boundary going down).
**Required state**: Pulse should always be 1.0 (fires every frame). It's a "frame tick trigger."
**Suggested approach**: Set `pulse = 1.0` unconditionally in `resolveTime()`. The wrap-detection logic can be removed or repurposed elsewhere.
**Risks**: Blocks that depend on pulse=0 for "no event" behavior will see pulse always firing. Need to audit downstream uses.
**Depends on**: none

### WI-3: Add 'phase' as Distinct PayloadType

**Status**: WRONG (uses float+unit instead of distinct type)
**Spec requirement**: `phase` is in the PayloadType union; arithmetic rules are type-enforced
**Files involved**:

| File | Role |
|------|------|
| `src/core/canonical-types.ts:120-125` | PayloadType union |
| `src/blocks/time-blocks.ts:33-34` | Phase output types |
| `src/compiler/passes-v2/pass2-types.ts` | Type compatibility |
| `src/runtime/timeResolution.ts` | Phase computation |

**Current state**: PayloadType = 'float' | 'int' | 'vec2' | 'color' | 'bool'. Phase is `signalType('float', unitPhase01())`.
**Required state**: Add `'phase'` to PayloadType union. TimeRoot outputs phaseA/phaseB use `signalType('phase')`. Type compatibility in Pass 2 enforces phase arithmetic rules.
**Suggested approach**:
1. Add `'phase'` to PayloadType union
2. Update TimeRoot outputs to use `signalType('phase')`
3. Add phase-specific binary op rules to Pass 2 type checking
4. Implement PhaseToFloat, FloatToPhase, PhaseDistance as system blocks or expression functions
**Risks**: High — pervasive type-system change. All blocks consuming phase need updates. Adapters may be needed.
**Depends on**: none (but blocks WI-5 in rails)

### WI-4: Implement Rail Blocks

**Status**: MISSING
**Spec requirement**: 5 MVP rails as derived blocks with role `{ kind: 'derived', meta: { kind: 'rail', ... } }`
**Files involved**:

| File | Role |
|------|------|
| `src/blocks/` (new file) | Rail block definitions |
| `src/graph/passes/pass1-default-sources.ts` | Materialization of rails |

**Current state**: No rail blocks exist. Time signals are accessed directly via `SigExprTime` nodes.
**Required state**: Rail blocks that wrap TimeRoot outputs, can be overridden by connecting inputs, participate in the graph as regular blocks.
**Suggested approach**: Create `src/blocks/rail-blocks.ts` registering time, phaseA, phaseB, pulse, palette rails. Each has one input (overridable) and one output. Default: pass through TimeRoot value.
**Risks**: Medium — need to integrate with normalization (rails should be auto-created). Questions about whether rails are always present or only when referenced.
**Depends on**: WI-1 (dt output)

### WI-5: Fix tMs PayloadType to 'int'

**Status**: PARTIAL (tMs uses float, spec says int)
**Spec requirement**: tMs has payload 'int'
**Files involved**:

| File | Role |
|------|------|
| `src/blocks/time-blocks.ts:31` | tMs output type |
| `src/compiler/passes-v2/pass3-time.ts:96` | Time signal type |

**Current state**: 'int' exists in the PayloadType union (`src/core/canonical-types.ts:122`). However, tMs is declared as `signalType('float')` in both the block definition and pass3.
**Required state**: tMs uses `signalType('int')`.
**Suggested approach**: Change `signalType('float')` to `signalType('int')` for tMs in time-blocks.ts and pass3-time.ts. Verify that runtime ValueStore handles int correctly (Float64Array stores integers losslessly up to 2^53).
**Risks**: Low. Downstream blocks that consume tMs and expect float may need an adapter. But since ValueStore uses Float64Array, the runtime representation is the same.
**Depends on**: none

### WI-6: Enforce Monotonic Time (I1)

**Status**: PARTIAL
**Spec requirement**: tMs never wraps, resets, or clamps
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/timeResolution.ts:146` | tMs assignment |

**Current state**: `tMs = tAbsMs` directly. No clamping/wrapping enforcement. If tAbsMs goes backwards (tab sleep recovery, or test scenarios), tMs goes backwards.
**Required state**: tMs must be monotonically increasing. If `tAbsMs < prevTAbsMs`, tMs should continue from last value + min_dt.
**Suggested approach**: Track `lastTMs` in TimeState, compute `tMs = max(tAbsMs, lastTMs + epsilon)` or accumulate dt.
**Risks**: Low. May cause phase discontinuity if tab-sleep produces large jumps.
**Depends on**: none

### WI-7: Phase Continuity on Period Change

**Status**: PARTIAL (infrastructure present, logic not wired)
**Spec requirement**: When speed/period changes, `new_phase = old_phase + (new_speed - old_speed) * elapsed_time`
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/timeResolution.ts:55-58` | offsetA/offsetB fields |
| `src/runtime/timeResolution.ts:124-128` | Phase computation |

**Current state**: offsetA/offsetB exist but are initialized to 0 and never mutated.
**Required state**: When periodAMs/periodBMs change between compiles, compute offset to maintain phase continuity.
**Suggested approach**: Compare new period to previous period in TimeState. If changed, compute offset = prevPhase - rawPhase(new_period, tAbsMs). Store previous periods in TimeState.
**Risks**: Low. Requires TimeState to store previous period values.
**Depends on**: none

### WI-8: Determinism Enforcement (No Math.random at Runtime)

**Status**: MISSING (no enforcement mechanism)
**Spec requirement**: No Math.random() at runtime; all randomness seeded
**Files involved**:

| File | Role |
|------|------|
| eslint config or lint rule | Enforcement |

**Current state**: Math.random() exists in benchmarks. No lint rule prevents its use in `src/runtime/`.
**Required state**: Lint rule or CI check forbids Math.random() in runtime paths.
**Suggested approach**: Add ESLint no-restricted-globals rule for Math.random in src/runtime/ and src/compiler/. Benchmark files can be excluded.
**Risks**: None. Pure enforcement.
**Depends on**: none
