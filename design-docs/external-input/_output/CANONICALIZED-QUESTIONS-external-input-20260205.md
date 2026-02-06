---
command: /canonicalize-architecture design-docs/CANONICAL-oscilla-v2.5-20260109 design-docs/external-input
files: 01-External-Input-High-Level.md 02-External-Input-Spec.md 03-External-Input-Roadmap-Phase-1.md 04-External-Input-Roadmap-Phase-2.md
indexed: true
source_files:
  - design-docs/external-input/01-External-Input-High-Level.md
  - design-docs/external-input/02-External-Input-Spec.md
  - design-docs/external-input/03-External-Input-Roadmap-Phase-1.md
  - design-docs/external-input/04-External-Input-Roadmap-Phase-2.md
topics:
  - external-input-system
progress: 100%
---

# External Input System — Canonicalization Questions

> **Status**: ALL RESOLVED ✓
> **Date**: 2026-02-05
> **Sources Analyzed**: 4 files
> **Questions Resolved**: 3/3
> **Proposed New Topics**: 1 (22-external-input-system)
> **Proposed New Invariant**: I37 (External Inputs Are Snapshot-Immutable)

---

## Executive Summary

The external-input documents propose a **unified External Input Channel System** for MIDI, OSC, audio (FFT/RMS), keyboard, and mouse. The architecture aligns well with canonical spec invariants:

- ✅ Deterministic (I21) — smoothing is write-side only, reader is pure
- ✅ Slot-addressed (I8) — Phase 2 uses numeric channel IDs + typed arrays
- ✅ Single time authority (I5) — frame-boundary commit, no competing time sources
- ✅ Schedule is data (I9) — `SigExpr { kind: 'external', which: string }` is declarative
- ✅ Single type authority (I32) — Uses PayloadType directly, no separate ChannelType

**No T1 (foundational) contradictions found.**
**No T2 (structural) contradictions found.**

---

## Resolved Questions

### Q1: Channel Types — Use PayloadType or Separate Subset?

**Category**: DESIGN DECISION (T2)
**Severity**: MEDIUM

**Source**: 02-External-Input-Spec.md §1.1

**The Issue**:
External-input spec defines `ChannelType = 'float' | 'vec2' | 'vec3' | 'color' | 'int'` which overlaps with but is not identical to canonical `PayloadType`.

**Resolution**: **A (modified)** — Use PayloadType/CanonicalType everywhere

**Rationale**: Use PayloadType/CanonicalType with an explicit allowed payload whitelist for external channels (e.g., float|int|bool|vec2|vec3|color) and a hard error/diagnostic for handle payloads (shape2d/shape3d/cameraProjection). This stays aligned with I32 "single type authority" and avoids a parallel ChannelType concept.

**Implementation**:
- External channels have full `CanonicalType` with payload + unit + extent
- Allowed payloads for external channels: `float | int | bool | vec2 | vec3 | color`
- Handle types (shape2d, shape3d, cameraProjection) produce compile error if used with external channels
- `bool` is encoded as float 0/1 at the transport layer but typed as bool in CanonicalType

**Approved by**: Brandon Fryslie
**Approved at**: 2026-02-05

---

### Q2: Channel Registry — Static, Dynamic, or Hybrid?

**Category**: DESIGN DECISION (T2)
**Severity**: MEDIUM

**Source**: 02-External-Input-Spec.md §1.3

**The Issue**:
External inputs need a way to define which channels exist and their semantics (kind, type, default). The source proposes a `ChannelDefResolver` that can match exact names or prefix families.

**Resolution**: **C (Hybrid)** — Known channels + prefix rules + diagnostic for unknown

**Rationale**: Unknown channels should return a safe default AND emit a diagnostic once per patchRevision (typo detection) rather than silently becoming 0 forever. This provides flexibility while catching configuration errors early.

**Implementation**:
- Static registry for well-known channels (mouse.x, keyboard.key.space.held)
- Prefix family rules for dynamic channels (audio.fft.bin.*, midi.*.cc.*)
- Unknown channels: `{kind: 'value', type: float}` default + diagnostic warning W_UNKNOWN_CHANNEL
- Diagnostic emitted once per patchRevision to avoid spam

**Approved by**: Brandon Fryslie
**Approved at**: 2026-02-05

---

### Q3: Topic Tier Classification — T2 or T3?

**Category**: ORGANIZATIONAL
**Severity**: LOW

**The Issue**:
Should the external input system be classified as T2 (structural — affects many things, costly to change) or T3 (optional — use it or don't, change freely)?

**Resolution**: **A (T2 Structural)**

**Rationale**: It touches runtime snapshot semantics + IR ("read external inputs" is already a canonical scheduling step at 04-compilation.md). The frame-boundary snapshot model is a key design decision that affects multiple systems:
- Runtime (ExternalChannelSnapshot in RuntimeState)
- IR (SigExpr { kind: 'external', which: string })
- Compilation (channel resolution)
- Blocks (ExternalInput, ExternalGate, ExternalVec2)

**Approved by**: Brandon Fryslie
**Approved at**: 2026-02-05

---

## Contradictions (LOW SEVERITY) — Resolved

### C1: ChannelType Subset vs PayloadType

**Category**: CONTRADICTION-T3
**Severity**: LOW

**Status**: RESOLVED by Q1 — Use PayloadType with allowed whitelist, no separate ChannelType.

---

### C2: Phase 1 String Storage vs I8 Slot-Addressed Execution

**Category**: CONTRADICTION-INTERNAL
**Severity**: LOW

**Source**: 02-External-Input-Spec.md §2.3

**The Issue**: Phase 1 proposes `Map<string, number>` for channel storage, which appears to contradict I8 (no string lookups in hot loops).

**Status**: NOT A BLOCKING ISSUE — The source docs acknowledge this as transitional. Phase 2 migrates to:
- `ChannelIndex (string → int id)` at compile time
- `Float32Array` for values by id at runtime

---

## Integration Actions

### New Topic: 22-external-input-system.md

**Tier**: T2 (Structural)

**Sections**:
1. **Invariants** — Frame-boundary commit, read-only during execution, deterministic
2. **Architecture** — Writer side, staging, snapshot, reader side
3. **Channel Kinds** — value, pulse, accum (optionally latch)
4. **Channel Types** — PayloadType with allowed whitelist (per Q1)
5. **Channel Registry** — Static + prefix rules + diagnostic (per Q2)
6. **IR Integration** — SigExpr { kind: 'external', which: string }
7. **Block Surface** — ExternalInput, ExternalGate, ExternalVec2
8. **Canonical Namespace** — mouse.*, key.*, midi.*, osc.*, audio.*
9. **Roadmap** — Phase-based implementation path

### GLOSSARY Additions

| Term | Definition |
|------|------------|
| ExternalChannelSnapshot | Immutable per-frame map of channel values. Read-only during frame execution. |
| ExternalWriteBus | Thread-safe write-side structure accepting set/pulse/add operations. |
| ChannelKind | Semantics for how writes fold into snapshot: value (last wins), pulse (1 for one frame), accum (sum, then clear). |
| ExternalInput | Block that reads a named external channel as a signal. |

### INVARIANTS Addition

**I37: External Inputs Are Snapshot-Immutable**

**Rule**: Once `commit()` is called at frame start, the ExternalChannelSnapshot is immutable for the entire frame. No mid-frame writes are visible to evaluation.

**Rationale**: Without this, external inputs could produce different values when evaluated multiple times in the same frame, breaking determinism and replay.

**Consequences of Violation**: Non-deterministic evaluation, broken replay, potential race conditions in multi-threaded scenarios.

**Enforcement**: ExternalChannelSystem.commit() swaps reference atomically; reader interface has no write methods.

### Cross-Reference Updates

| Location | Update |
|----------|--------|
| Topic 02 (Block System) | Add ExternalInput block spec |
| Topic 04 (Compilation) | Document SigExpr 'external' variant |
| Topic 05 (Runtime) | Add ExternalChannelSnapshot to RuntimeState |
| Topic 07 (Diagnostics) | Add W_UNKNOWN_CHANNEL code |

---

## Statistics

| Category | Count |
|----------|-------|
| Questions resolved | 3/3 (100%) |
| T3 contradictions resolved | 2 |
| Gaps identified | 4 |
| New glossary terms | 4 |
| New invariant proposed | 1 (I37) |
| New topic proposed | 1 (22-external-input-system) |

---

## Next Steps

All questions have been resolved. The canonicalization is ready for:
1. **Editorial Review** — Verify content consistency and completeness
2. **Final Integration** — Merge into canonical spec (INDEX, GLOSSARY, INVARIANTS, new topic)

Re-run `/canonicalize-architecture` to proceed with the editorial review phase.
