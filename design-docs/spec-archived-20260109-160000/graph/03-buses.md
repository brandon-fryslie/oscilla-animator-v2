# Multi-Writer Inputs, Bus Blocks, and Rails (Unified Spec)

## Core Principle

Every input port on every block may have **0..N writers**. If N != 1, the result is defined by an explicit combine mode. There is no "MultipleWriters" error.

Buses are a UI affordance. At compile time they are ordinary blocks and edges. The rules in this document apply to all blocks; buses simply expose a globally addressable wiring surface.

## CombineMode

```ts
type CombineMode =
  | 'sum' | 'average' | 'min' | 'max' | 'mul'       // numeric, vec, color (componentwise)
  | 'last' | 'first' | 'layer'                      // any type, order-dependent
  | 'or' | 'and'                                    // boolean only
  | { kind: 'custom'; id: string }                  // registered reducer
```

"layer" is an alias of "last" with a stable ordering contract.

## CombinePolicy (per input port)

```ts
type CombinePolicy =
  | { when: 'multi'; mode: CombineMode }
  | { when: 'always'; mode: CombineMode }
  | { when: 'multi'; mode: 'error' }                // optional strictness
```

Default if unspecified:
```
{ when: 'multi', mode: 'last' }
```

## Writers

In the NormalizedGraph, writers are just inbound edges to an input port. There are no special cases.

Default sources are derived blocks connected only when the input has zero writers.

## Bus Blocks

A bus is represented as a **BusBlock** with a globally addressable `busId`.

- Inputs: `in` (multi-writer, CombineMode = bus combine policy)
- Outputs: `out`

Publish/subscribe UI interactions are rewritten into normal edges targeting the BusBlock.
Bus blocks are user-creatable.

## Rails (Global Bus Blocks)

Rails are immutable, system-provided BusBlocks that exist in every patch. They provide a consistent foundation of shared signals and events.

Canonical rails (reserved bus IDs):
- `time`
- `phaseA`
- `phaseB`
- `pulse`
- `energy`
- `palette`
- `progress`

Rails are present even if unused. They are normal blocks in the graph; the UI simply renders them differently.

## Deterministic Ordering

Order-dependent combine modes (`last`, `first`, `layer`, and most `custom`) must use a stable writer ordering that does not depend on UI order or JSON array order.

Recommended ordering key per inbound edge:

```
(edge.priority, edge.rolePriority, from.blockId, from.portId, edge.id)
```

Where:
- `edge.priority` is an optional integer ordering hint (default 0).
- `edge.rolePriority` is stable (user edges before derived edges).
- `edge.id` is stable across edits (anchor-derived if derived).

## Type Rules

Combine mode must be valid for the input TypeDesc:

- sum/average/min/max/mul: number, unit, vec2, vec3, color (componentwise)
- or/and: bool only
- last/first/layer: any type
- phase: only last/first/layer or a phase-specific custom reducer
- custom: must be registered and type-compatible

If invalid, compilation fails with a diagnostic.

## Transforms (Lenses/Adapters)

Transforms are blocks. The UI may present lens/adapter controls on a wire, but GraphNormalization replaces these with explicit derived blocks inserted into the graph.

Edges remain pure connections; all transform behavior is expressed by blocks.

See `spec/07-transforms.md` for the transform block catalog and normalization rules.

## Default Sources

Default sources are blocks, not parameters. GraphNormalization inserts a DefaultSource block and edge when an input has zero writers. If any writer exists, the DefaultSource is disconnected.

## UI Control Publishers

UI controls (sliders, knobs) are represented as derived blocks that publish into BusBlocks. They use an explicit priority to override defaults without being special-cased.

Recommended policy:
- UI control publisher edges set `priority = -1000`.
- UI control blocks use stable IDs derived from the control identity.
- Ordering remains deterministic via the standard ordering key.

## Bus Board UI (Summary)

The Bus Board UI is a visualization of BusBlocks. It should:
- Pin rails at the top with a system badge.
- Show type badges, "publisher" counts, "listener" counts. (there is no such thing a publishers/listeners, they're just standard multi-in/multi-out block outputs)
- Provide a simple live scope per bus (phase ring, numeric meter, color swatch).
