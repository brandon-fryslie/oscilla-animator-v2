---
topic: 05
name: Runtime
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: unimplemented
audited: 2026-01-23T12:00:00Z
item_count: 7
blocks_critical: [C-8]
---

# Topic 05: Runtime — Unimplemented

## Items

### U-12: Deterministic replay (I21)
**Spec requirement**: Full deterministic replay — seeded randomness only, no Math.random(), reproducible from t=0. Replay recording/playback infrastructure.
**Scope**: Audit all randomness sources, add replay recording and input capture
**Blocks**: nothing — standalone
**Evidence of absence**: Seeded PRNG exists (src/core/rand.ts) and no Math.random in runtime, but no replay recording, input capture, or frame-level determinism verification.

### U-13: Atomic hot-swap (frame-boundary synchronization)
**Spec requirement**: Old program renders until new is ready. Atomic swap, no flicker. State migrates by StateId. No mid-frame swap.
**Scope**: Double-buffered frame output or frame-boundary synchronization
**Blocks**: nothing — standalone
**Evidence of absence**: compileAndSwap in main.ts does synchronous swap inline. No double-buffering or frame-boundary guard.

### U-14: Value traceability (I20)
**Spec requirement**: Traceability by stable IDs — every runtime value traceable to source block/port via structural instrumentation
**Scope**: new debug/trace infrastructure
**Blocks**: nothing — standalone
**Evidence of absence**: DebugIndex provides slotToBlock mapping but no runtime tracing of value provenance through expression DAGs.

### U-15: RuntimeError type
**Spec requirement**: Structured runtime error discriminated union (division_by_zero, nan, buffer_overflow, invalid_transform) with enough context for localization
**Scope**: new error type + integration with diagnostics
**Blocks**: nothing — standalone
**Evidence of absence**: NaN/Inf detected by HealthMonitor but no formal RuntimeError discriminated union. Errors throw generic Error.

### U-16: External input sampling (MIDI, audio)
**Spec requirement**: First step of frame execution — sample external inputs (MIDI, audio, user interaction)
**Scope**: Extend ExternalInputs to support MIDI/audio sources
**Blocks**: nothing — future feature
**Note**: Mouse inputs already exist (ExternalInputs with mouseX/mouseY at RuntimeState.ts:187). MIDI/audio not yet.

### U-35: State migration compatible-layout transform
**Spec requirement**: Same StateId + compatible layout → transform (not just copy or reset). E.g., stride change with data reshaping.
**Scope**: Additional migration path in StateMigration.ts
**Blocks**: nothing — standalone
**Evidence of absence**: StateMigration handles same-layout copy and incompatible-reset, but no 'compatible transform' path.

### U-36: Dense pre-allocated field storage
**Spec requirement**: Fields pre-allocated as dense Float32Array indexed by slot, not general Map
**Scope**: Restructure ValueStore.objects from Map<ValueSlot, unknown> to dense array
**Blocks**: nothing — optimization
**Evidence of absence**: Fields stored in general-purpose Map<ValueSlot, unknown>, not pre-allocated dense arrays.
