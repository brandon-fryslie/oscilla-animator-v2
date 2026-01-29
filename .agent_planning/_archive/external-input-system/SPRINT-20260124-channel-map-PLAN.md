# Sprint: channel-map — External Input Channel Map Infrastructure

Generated: 2026-01-24
Confidence: HIGH: 5, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Implement the external input channel map (Option D with commit step) so that external values flow through named channels into blocks via `sigExternal()`.

## Scope

**Deliverables:**
- Double-buffered channel map on RuntimeState
- Updated SignalEvaluator to read channels dynamically
- IRBuilder `sigExternal()` method
- ExternalInput block (generic channel reader)
- Mouse inputs migrated from hardcoded fields to channels

## Work Items

### P0: Double-buffered channel map on RuntimeState

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] `SessionState.externalChannels` is a `DoubleBufferedChannelMap` (not raw Map)
- [ ] `stage(name, value)` writes to staging buffer
- [ ] `commit()` atomically swaps staging → committed
- [ ] `get(name)` reads from committed buffer only
- [ ] Unset channels return `0` (safe default, no crash)

**Technical Notes:**
- Replace `ExternalInputs` interface entirely
- `DoubleBufferedChannelMap` is a small class (~30 lines): two Maps, swap on commit
- Lives in `src/runtime/RuntimeState.ts` or a new `src/runtime/ChannelMap.ts`
- `updateSmoothing()` function moves to mouse-specific sampling logic (not on ChannelMap itself)

### P1: Frame-start sampling step in executeFrame

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] `executeFrame` calls `state.externalChannels.commit()` as first operation (Step 1: Sample inputs)
- [ ] `camera?: CameraParams` parameter remains on executeFrame for now (removed in Sprint 2)
- [ ] Existing tests continue to pass

**Technical Notes:**
- This is a one-line addition: `state.externalChannels.commit();` at top of executeFrame
- Callers (main.ts) call `stage()` before executeFrame, commit happens inside

### P2: SignalEvaluator reads from channel map

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] `case 'external'` reads `state.externalChannels.get(expr.which)`
- [ ] Hardcoded `mouseX`/`mouseY`/`mouseOver` switch statement is removed
- [ ] Unknown channels return `0` (not throw)
- [ ] Existing external signal tests updated

**Technical Notes:**
- The evaluator case becomes a single line: `return state.externalChannels.get(ext.which) ?? 0;`
- Signal expression type: `{ kind: 'external', which: string }`

### P3: IRBuilder `sigExternal()` method

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] `IRBuilder` interface has `sigExternal(channel: string, type: CanonicalType): SigId`
- [ ] Implementation creates expression node `{ kind: 'external', which: channel }`
- [ ] Returns a valid SigId that can be wired to block outputs

**Technical Notes:**
- Follow pattern of `sigTime()` exactly
- The expression type may already exist (check SigExpr union)

### P4: ExternalInput block + mouse migration

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] `ExternalInput` block registered with `capability: 'io'`
- [ ] Config input `channel: string` (not wirable, config-only, no default)
- [ ] Output: `value: float`
- [ ] `lower()` calls `ctx.b.sigExternal(channel, canonicalType('float'))`
- [ ] Mouse values written to channels in main.ts: `mouse.x`, `mouse.y`, `mouse.over`
- [ ] Mouse smoothing logic preserved (smoothing happens at write side, not read side)

**Technical Notes:**
- Block file: `src/blocks/external-blocks.ts`
- Mouse event handlers in main.ts call `state.externalChannels.stage('mouse.x', normalizedX)` etc.
- Smoothing: maintain smoothX/smoothY locally in main.ts, stage the smoothed values
- Remove old `ExternalInputs` interface and `updateSmoothing()` from RuntimeState.ts

## Dependencies

- None — this is foundational infrastructure

## Risks

- **String typos in channel names**: Acceptable risk. Unknown channels return 0. Future: lint pass can warn.
- **Mouse smoothing placement**: Smoothing logic moves from RuntimeState to main.ts. This is correct — smoothing is a write-side concern.
