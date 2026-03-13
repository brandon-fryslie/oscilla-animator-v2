# Context: P3-1 - MIDI and Verification Gaps

## Target State
Spec requires:
1. A MIDI event ring buffer (256-512 byte range) with overflow policy
2. Click-to-photon latency verification test
3. Real dt from frame timing

## Current State
1. No MIDI infrastructure exists at all
2. No latency verification test
3. dt hardcoded to 1/60

Key files:
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:1205` - hardcoded dt

## Files Involved
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs`
- `src/render/rust/runtime-input-layout.ts` (would need MIDI fields)

## Suggested Approach
1. MIDI: Low priority feature. When needed, add MIDI fields to runtime-input-layout.ts and a ring buffer region in the shared input plane.
2. Click-to-photon test: Good practice but not blocking. Can be added as a Playwright integration test.
3. DeltaTime: Should compute actual dt from scheduler timing. The scheduler already has timing infrastructure. This is a straightforward fix.

## Risks
- Fixed dt means physics is incorrect at non-60fps framerates (e.g., 120Hz displays, throttled tabs)
- MIDI support is future work, not a current blocker
