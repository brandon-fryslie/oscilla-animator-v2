# Time Architecture (Unified Spec)

## Core Principle

**Time is monotonic and unbounded.** Cycles are derived by blocks, not by the player.

## TimeRoot

Exactly one TimeRoot exists per patch. It defines the time contract.

### Allowed TimeRoot Types

| Block | TimeModel | Outputs |
| --- | --- | --- |
| FiniteTimeRoot | `{ kind: 'finite', durationMs }` | `time`, `progress` |
| InfiniteTimeRoot | `{ kind: 'infinite' }` | `time` |

No other TimeRoot types exist.

### TimeRoot Outputs

- `time`: Signal<time> (monotonic, unbounded)
- `progress`: Signal<unit> (0..1 over duration, finite only)

## TimeModel

```ts
type TimeModel =
  | { kind: 'finite'; durationMs: number }
  | { kind: 'infinite' }
```

TimeModel is inferred from the TimeRoot and is immutable during execution.

## TimeCtx

```ts
interface TimeCtx {
  tMs: number
  dtMs: number
  seed: number
}
```

The runtime never wraps or clamps `tMs`.

## Derived Cycles

There is no Time block that is intrinsically "cycle" based. Cycles are produced by ordinary blocks (e.g., Phasor + WaveShaper).

The UI may present a "Time Console" that instantiates these blocks, but it is not a special runtime system.

## Rails (Global Bus Blocks)

Rails are immutable BusBlocks that exist in every patch. They are globally addressable in the UI but compile as normal blocks.

TimeRoot outputs are expected to drive the `time` rail (and `progress` for finite patches) via explicit graph edges (derived during GraphNormalization or present in the base patch template).
