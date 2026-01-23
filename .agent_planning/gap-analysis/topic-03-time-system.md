---
topic: 03
name: Time System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/03-time-system.md
audited: 2026-01-23T00:30:00Z
has_gaps: true
counts: { done: 14, partial: 5, wrong: 2, missing: 4, na: 2 }
---

# Topic 03: Time System

## DONE

- **Single time authority (I5)**: Pass 3 enforces exactly one TimeRoot block per patch — `src/compiler/passes-v2/pass3-time.ts:45-50` throws `NoTimeRoot` / `MultipleTimeRoots`
- **TimeRoot is system-managed**: InfiniteTimeRoot registered in `src/blocks/time-blocks.ts:14-68`, category 'time'
- **Only 'infinite' TimeRoot kind exists**: Only `InfiniteTimeRoot` is registered; no finite kind present
- **tMs output**: TimeRoot emits tMs as signal — `src/blocks/time-blocks.ts:31,43`
- **phaseA output**: TimeRoot emits phaseA — `src/blocks/time-blocks.ts:33,44`
- **phaseB output**: TimeRoot emits phaseB — `src/blocks/time-blocks.ts:34,45`
- **pulse output**: TimeRoot emits pulse — `src/blocks/time-blocks.ts:35,46`
- **palette output**: TimeRoot emits palette — `src/blocks/time-blocks.ts:36,47`
- **energy output**: TimeRoot emits energy — `src/blocks/time-blocks.ts:37,48`
- **Phase wrap semantics [0,1)**: `wrapPhase()` in `src/runtime/timeResolution.ts:77-80` correctly wraps to [0,1)
- **Palette default = HSV rainbow**: `hsvToRgb(phaseA, 1.0, 0.5)` — `src/runtime/timeResolution.ts:140`
- **Energy default = sin(phaseA*2pi)**: `0.5 + 0.5 * Math.sin(phaseA * 2 * Math.PI)` — `src/runtime/timeResolution.ts:143`
- **Transport continuity / hot-swap**: `TimeState` lives in `SessionState` (survives hot-swap) — `src/runtime/RuntimeState.ts:424,500`
- **dt computed as delta time**: `dt = tAbsMs - prevTAbsMs` — `src/runtime/timeResolution.ts:116`

## PARTIAL

- **tMs is monotonic and unbounded (I1)**: Time is currently computed as `tMs = tAbsMs` (line 146 of timeResolution.ts) which delegates monotonicity to the caller. No enforcement at the time-resolution layer. If the caller passes non-monotonic absolute time (e.g., after tab-sleep), tMs could go backwards via `dt` being recalculated. Spec requires the system to guarantee monotonicity.
- **Pulse fires every frame (spec says 'frame tick trigger')**: Current implementation fires only on phase wrap (`wrapA || wrapB`) — `src/runtime/timeResolution.ts:131-133`. Spec says pulse is a "frame tick trigger" that fires every frame.
- **Phase continuity on speed change**: `offsetA`/`offsetB` fields exist in `TimeState` (`src/runtime/timeResolution.ts:55-58`) but are never updated when period changes. Spec requires `new_phase = old_phase + (new_speed - old_speed) * elapsed_time` retiming.
- **Atomic swap (no flicker during compile)**: Session/Program state split exists (`src/runtime/RuntimeState.ts:584-608`), but there is no explicit atomic-swap gate that holds the old program until the new one is ready. The swap is "fast" but not provably atomic from the spec's perspective.
- **tMs type is 'int' per spec**: TimeRoot output declares `signalType('float')` for tMs — `src/blocks/time-blocks.ts:31`. Spec mandates `payload: 'int'`. The `PayloadType` union does include `'int'` (`src/core/canonical-types.ts:122`), but the block definition uses 'float' instead.

## WRONG

- **Phase payload type = 'phase'**: Spec defines `phase` as a distinct PayloadType. Implementation uses `signalType('float', unitPhase01())` — `src/blocks/time-blocks.ts:33-34`. The `PayloadType` union in `src/core/canonical-types.ts:120-125` has no `'phase'` member. Phase is modeled as `float` with a `unit` annotation rather than a distinct payload. This violates the spec's type-level phase arithmetic enforcement (phase+phase = TYPE ERROR cannot be mechanically enforced with float payload).
- **dt output missing from TimeRoot block definition**: The TimeRoot block in `src/blocks/time-blocks.ts` does not declare a `dt` output port. The `lower` function does not emit a `dt` signal. dt is computed in `timeResolution.ts` but is not available as a connectable block output.

## MISSING

- **Rails as blocks**: Spec requires 5 MVP rails (time, phaseA, phaseB, pulse, palette) to exist as derived blocks with `role: { kind: 'derived', meta: { kind: 'rail', ... } }`. No rail block implementations exist. No rail concept is found anywhere in the blocks directory.
- **Phase arithmetic type rules**: Spec requires: `phase+float=phase`, `phase*float=phase`, `phase+phase=TYPE ERROR`, `phase-phase=float`. No implementation of these type rules exists because `phase` is not a distinct payload type.
- **PhaseToFloat / FloatToPhase / PhaseDistance functions**: No implementation found. Spec defines explicit unwrap/distance functions. There is only the generic `wrapPhase()` in timeResolution.ts.
- **Determinism — no Math.random() at runtime**: `Math.random()` is used in benchmarks (`src/runtime/__benchmarks__/RenderAssembler.bench.ts:37-48`). While benchmarks don't execute at runtime, there is no lint rule or enforcement preventing Math.random() from appearing in runtime code. The spec requires mechanical enforcement.

## N/A

- **Per-Lane Time (Future)**: Explicitly marked as future work in spec — "v0 keeps time rails as `one` signals"
- **Event Payload structure**: T2 concept; the spec's `EventPayload { key, value }` structure is described but not critical path for MVP time system

