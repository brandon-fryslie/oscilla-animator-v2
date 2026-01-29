# Definition of Done: channel-map

## Functional Requirements

- [ ] `DoubleBufferedChannelMap` class exists with `stage()`, `commit()`, `get()` API
- [ ] `SessionState.externalChannels` replaces old `ExternalInputs` interface
- [ ] `executeFrame` calls `commit()` as Step 1 (Sample inputs)
- [ ] SignalEvaluator `case 'external'` reads from channel map dynamically
- [ ] IRBuilder has `sigExternal(channel, type)` method
- [ ] `ExternalInput` block registered, compiles, and produces output signal
- [ ] Mouse inputs (`mouse.x`, `mouse.y`, `mouse.over`) flow through channels
- [ ] Mouse smoothing preserved (write-side smoothing before staging)

## Quality Requirements

- [ ] All existing tests pass (no regressions)
- [ ] New unit tests for `DoubleBufferedChannelMap` (stage/commit/get semantics)
- [ ] New unit test for `ExternalInput` block lowering
- [ ] TypeScript compiles with no errors
- [ ] `npm run build` succeeds

## Verification

- [ ] App loads, mouse interaction works as before (visual check via DevTools)
- [ ] Console shows no errors or warnings
- [ ] ExternalInput block can be placed in graph and wired (if graph editor supports it)

## What This Does NOT Include

- Camera block (Sprint 2)
- Removing `camera?: CameraParams` from executeFrame (Sprint 2)
- MIDI, audio, or other external sources (future work)
- Channel name validation/discovery UI (future work)
