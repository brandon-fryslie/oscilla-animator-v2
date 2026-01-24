---
topic: 03
name: Time System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-23T12:00:00Z
item_count: 5
priority_reasoning: normalizedIndex N=1 bug. tMs type wrong. Pulse fires wrong. tMs monotonicity not enforced. dt output missing.
---

# Topic 03: Time System — Critical Gaps

## Items

### C-7: normalizedIndex returns 0 for N=1 (spec says 0.5)
**Problem**: When there's a single element (N=1), normalizedIndex returns 0 instead of 0.5. This causes single-element layouts to position at origin instead of center.
**Evidence**: src/runtime/Materializer.ts:408 — `arr[i] = N > 1 ? i / (N - 1) : 0;`
**Obvious fix?**: Yes — change `0` to `0.5`

### C-19: tMs type is float, spec says int
**Problem**: Spec rail table says time rail has type `one + continuous + int`. TimeRoot declares tMs as `signalType('float')`. Should be int since milliseconds are integer-valued.
**Evidence**: src/blocks/time-blocks.ts:31
**Obvious fix?**: Yes — change tMs output type to `signalType('int')`

### C-20: Pulse fires only on phase wrap, not every frame
**Problem**: Spec says pulse is a frame-tick trigger that fires every frame (`one + discrete + unit`). Implementation only fires when `wrapA || wrapB` — fires rarely (once per phase cycle) instead of every frame.
**Evidence**: src/runtime/timeResolution.ts:131-133
**Obvious fix?**: Yes — set pulse = 1.0 unconditionally every frame (it is a frame tick)

### C-21: tMs monotonicity not enforced (I1 violation risk)
**Problem**: Spec invariant I1: "Time is monotonic, never wraps/resets/clamps." resolveTime sets tMs = tAbsMs directly, delegating monotonicity to caller. If browser tab sleeps and resumes, or caller provides non-monotonic input, invariant is violated. No enforcement exists.
**Evidence**: src/runtime/timeResolution.ts:146
**Obvious fix?**: Yes — add `tMs = Math.max(tAbsMs, prevTMs)` or track tModelMs separately

### C-22: dt output port missing from TimeRoot block definition
**Problem**: Spec defines dt as an output of TimeRoot. InfiniteTimeRoot has outputs: tMs, phaseA, phaseB, pulse, palette, energy but NOT dt. Pass 3 creates a dt signal internally but it's not exposed as a block port.
**Evidence**: src/blocks/time-blocks.ts:30 — outputs list has no dt entry
**Obvious fix?**: Yes — add `dt: { label: 'Delta Time', type: signalType('float') }` to outputs
