# Compiler Audit Red Flags: Time Architecture (with Solutions)

Scope: TimeRoot → TimeModel invariants, schedule time derivation, and player/runtime alignment.

## Critical

- **TimeModel source of truth is hardcoded to infinite in IR builder.**
  - **Where:** `src/editor/compiler/ir/IRBuilderImpl.ts` (hardcoded `timeModel` in `build()`), and `src/editor/compiler/ir/buildSchedule.ts` uses `builderIR.timeModel`.
  - **Impact:** Even with a TimeRoot present, compiled IR runs with an infinite model; phase/progress/wrap semantics are wrong or missing.
  - **Solution:**
    1) Add an explicit `IRBuilder.setTimeModel()` method, called by TimeRoot lowering via `ctx.b` (parallel to `setTimeSlots`).
    2) Remove the hardcoded fallback in `IRBuilderImpl.build()` and throw if TimeModel is missing.
    3) In `buildSchedule`, treat missing `timeModel` as a compile error (don’t silently default).

- **TimeRoot lowering reads `config` instead of resolved inputs.**
  - **Where:** `src/editor/compiler/blocks/domain/TimeRoot.ts` uses `configData.durationMs/periodMs/mode`.
  - **Impact:** TimeModel params become `NaN` when config is absent; inputs are ignored. This violates “TimeRoot defines topology” and breaks deterministic looping.
  - **Solution:**
    1) Treat TimeRoot inputs as config-world inputs resolved via default sources. In lowering, read values from `inputs` (expect `scalarConst` or config value), not `config`.
    2) Enforce that TimeRoot inputs are `config` world (not signal) in type/validation. Reject wiring non-config sources.
    3) Keep a strict fallback only if default source is missing (compile error, not NaN).

- **Missing TimeRoot still produces a schedule via fallback slots.**
  - **Where:** `src/editor/compiler/ir/buildSchedule.ts` creates local time slots when `builderIR.timeSlots` is undefined.
  - **Impact:** Violates invariant “exactly one TimeRoot per patch,” and hides errors by creating a synthetic time topology.
  - **Solution:** Remove the fallback branch and emit a compile error when `builderIR.timeSlots` is missing. Require TimeRoot to allocate time slots.

## High

- **Wrap detection uses a fixed 16.67ms delta.**
  - **Where:** `src/editor/runtime/executor/timeResolution.ts` uses `tAbsMs - 16.67` to infer previous model time.
  - **Impact:** Wrap detection is frame-rate dependent, incorrect under scrubbing or variable playback speed, and non-deterministic across environments.
  - **Solution:** Track the previous `tAbsMs` per runtime frame. Pass both `prevTAbsMs` and `tAbsMs` into `resolveTime()` so wrap detection is based on real deltas, not assumptions.

- **TimeDerive does not write tAbsMs to its slot.**
  - **Where:** `src/editor/runtime/executor/steps/executeTimeDerive.ts` ignores `step.tAbsMsSlot`.
  - **Impact:** Any `inputSlot`/slot-based access to tAbsMs yields empty values; debugging/probing may be inconsistent.
  - **Solution:** Write `time.tAbsMs` to `step.tAbsMsSlot` inside `executeTimeDerive`, or remove the slot from the step if it’s not meant to exist.

## Medium

- **TimeModel type drift between `compiler/types.ts` and `compiler/ir/schedule.ts`.**
  - **Where:** `src/editor/compiler/types.ts` defines `TimeModel`, `src/editor/compiler/ir/schedule.ts` defines `TimeModelIR`.
  - **Impact:** Subtle mismatches (e.g., `suggestedUIWindowMs`, `cuePoints`) can get dropped when crossing IR boundaries.
  - **Solution:** Define a single canonical TimeModel type used by both compiler and IR schedule, or provide explicit conversion functions with tests (no implicit structural typing).

- **TimeRoot input types are declared as Signal but treated as Config.**
  - **Where:** `src/editor/blocks/time-root.ts` inputs are `Signal<number>`/`Signal<string>` but default sources are `world: 'config'`.
  - **Impact:** Mixed semantics in UI, type checking, and lowering (inputs imply live signals, but topology requires compile-time config).
  - **Solution:** Change slot types to Config-world (or add a dedicated Config input type) and enforce “config-only” wiring in validation.

## Notes

- The Player correctly avoids wrapping time and uses the compiler’s TimeModel. However, if the IR path keeps emitting default infinite models, the player cannot reflect the actual topology.

