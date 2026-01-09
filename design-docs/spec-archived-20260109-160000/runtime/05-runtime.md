# Runtime & Hot Swap (Unified Spec)

## Evaluation Loop

```
while running:
  tMs += dtMs * speed
  ctx = { tMs, dtMs, seed }
  frame = program.run(ctx)
  render(frame)
```

**Rules:**
- `tMs` is monotonic and unbounded.
- No time wrapping or clamping.
- Any phase/cycle behavior is produced by blocks, not the player.

## Stateful Blocks

Stateful behavior is owned by explicit blocks (e.g., UnitDelay, Lag, SampleAndHold). The runtime only manages state for blocks that declare it.

## Feedback

Cycles are legal only if a stateful block exists in the loop. UnitDelay is the minimal feedback gate.

## Hot Swap

Hot swap is deterministic and two-phase:

1. Compile new program in the background while the old program continues rendering.
2. Swap programs at a safe boundary (frame or user-gated boundary).

**Never** reset `tMs` during swap.

Optional continuity strategies:
- Crossfade render output when outputs are incompatible but a smooth transition is desired.
- Surface any unavoidable state resets as diagnostics; no silent resets.

## State Preservation

State continuity is keyed by stable block IDs (and optional internal keys). Migration rules:

- Same block ID + compatible state schema: copy
- Same block ID + incompatible schema: reset + diagnostic
- Missing block ID: initialize

## Deterministic Replay

Given the same patch revision, seed, and inputs, runtime output must be identical.
