# Evaluation: External Input System

**Date:** 2026-01-24
**Verdict:** PAUSE — architectural questions need user input

## Problem Statement

Currently, external values (camera toggle, future MIDI/mouse/audio) have no clean path into the runtime pipeline. The only mechanisms are:
1. **Time system** — special-cased `sigTime()` expressions read from `state.time.*`
2. **Recompilation** — changing Const block params triggers a full recompile

The camera toggle is currently hacked into main.ts as a direct parameter to `executeFrame`. This is wrong because:
- main.ts shouldn't know about CameraParams or perspective defaults
- The pattern doesn't generalize to MIDI, mouse, audio, etc.
- It bypasses the block/signal system entirely

## Spec Guidance

The spec (05-runtime.md, 03-time-system.md) defines the frame tick model as:
1. **Sample inputs** (UI, MIDI, etc.)
2. Update time
3. Execute schedule
4. Process events
5. Write sinks

Step 1 ("Sample inputs") is currently unimplemented. Only step 2 (time) exists.

## Architectural Analysis

### The Time System Pattern (existing, proven)

```
[main.ts: tAbsMs] → resolveTime() → state.time.{tMs, phaseA, ...}
                                              ↓
[SignalEvaluator: kind='time'] → reads state.time.* → number
                                              ↓
[InfiniteTimeRoot block: sigTime('phaseA')] → IR node referencing time
```

This is the pattern external inputs should follow:
- Values written to `state.externals.*` at frame start
- A `kind: 'external'` signal expression reads from there
- Blocks reference externals via a builder method like `sigExternal('cameraActive')`

### Key Questions (PAUSE)

1. **Should external inputs be blocks or something else?**
   - Option A: ExternalInput block (like InfiniteTimeRoot is a block)
   - Option B: Implicit system values (like time rails — available everywhere without explicit blocks)
   - Option C: A new "Rails" concept — system-provided signals that are always available

2. **Where does the external input registry live?**
   - The list of available external inputs (camera, mouseX, mouseY, midiCC1, audioRMS, etc.) needs to be defined somewhere
   - Compile-time: which externals does this patch reference?
   - Runtime: who writes the values each frame?

3. **Type safety: how are external input types declared?**
   - Camera toggle is `boolean` (or `float` 0/1)
   - Mouse is `vec2`
   - Audio RMS is `float`
   - MIDI CC is `float` (0-1)
   - Camera params is a complex struct

4. **The camera case specifically:**
   - Is the camera toggle an external input (boolean: "is 3D active")?
   - Or are the camera PARAMS the external input (struct: position, target, fov)?
   - Or both?
