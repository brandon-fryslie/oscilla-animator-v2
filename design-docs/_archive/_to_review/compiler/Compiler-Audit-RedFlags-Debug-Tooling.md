# Compiler Audit Red Flags: Debug/Inspection Tooling (with Solutions)

Scope: DebugDisplay, debug probes, debug index, TraceController integration, and IR runtime visibility.

## Critical

- **DebugDisplay is not supported in the IR compiler path.**
  - **Where:** `src/editor/compiler/blocks/debug/DebugDisplay.ts` throws in `lowerDebugDisplay`.
  - **Impact:** Any patch using DebugDisplay fails in IR mode; no equivalent IR mechanism.
  - **Solution:**
    1) Replace DebugDisplay with an IR “debug sink” that emits an overlay pass (`overlay/instances2d` or `overlay/paths2d`) or a dedicated `debugProbe` step.
    2) Alternatively, map DebugDisplay to a `debugProbe` config and drive UI from TraceController buffers.

## High

- **Legacy debug sampling is closure‑only and bypasses IR runtime.**
  - **Where:** `src/editor/compiler/debugSampler.ts` wraps closure programs and samples signals; IR runtime doesn’t use this path.
  - **Impact:** Debug sampling works in legacy mode but not IR mode, so probes appear “dead.”
  - **Solution:**
    1) Introduce an IR equivalent: map DebugDisplay/probed outputs to `StepDebugProbe` entries during IR schedule build.
    2) Drive UI from TraceController buffers (ValueRing/SpanRing), not from closure hooks.

- **Debug probes depend on slot metadata that may be missing/incomplete.**
  - **Where:** `src/editor/runtime/executor/steps/executeDebugProbe.ts` reads `runtime.values.slotMeta[slot]`.
  - **Impact:** Without slot metadata, probe output silently skips values; most slots won’t show up in debug.
  - **Solution:**
    1) Ensure slotMeta is always populated for default sources, bus outputs, and derived time slots.
    2) Validate slotMeta coverage during compilation and emit diagnostics if missing.

## Medium

- **Type encoding for probes is incomplete and lossy.**
  - **Where:** `executeDebugProbe.ts` maps TypeDesc to artifact kinds via `typeDescToArtifactKind`; mapping defaults to number.
  - **Impact:** Non‑number domains (color, vec2, string, boolean) are mis‑encoded or coerced to number, making probes misleading.
  - **Solution:**
    1) Expand TypeDesc → ValueSummary mapping to cover all supported domains.
    2) Add a TypeKeyTable and use it to encode precise type IDs for viewer tooling.

- **DebugIndex is not consistently surfaced for IR runtime.**
  - **Where:** `IRBuilderImpl` emits `debugIndex`; `PreviewPanel` sets TraceContext when `result.debugIndex` exists.
  - **Impact:** If debugIndex doesn’t match runtime slot layout (or isn’t emitted), probes can’t be attributed to blocks/ports.
  - **Solution:**
    1) Include debugIndex as a first‑class artifact on the IR compile result.
    2) Ensure slotSource map is kept in sync with SlotMeta and schedule slots.

- **No UI control for probe mode in IR compilation.**
  - **Where:** `buildSchedule` supports `debugConfig.probeMode`, but there’s no obvious wiring from UI settings to compiler options.
  - **Impact:** Probes exist but are never scheduled unless code is manually toggled.
  - **Solution:**
    1) Add a Debug UI toggle that sets `debugConfig.probeMode` when compiling IR.
    2) Preserve this setting in the patch or UI state store so it survives hot swaps.

## Notes

- TraceController has robust buffering, but there’s no guaranteed bridge to the inspector UI. The simplest path is to read TraceController buffers into DebugStore at a fixed UI cadence.

