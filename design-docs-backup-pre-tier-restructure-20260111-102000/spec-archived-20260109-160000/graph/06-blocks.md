# Blocks (Unified Spec)

## Block Definition

```ts
interface BlockDefinition {
  type: string
  category: BlockCategory
  form: 'primitive' | 'composite'
  inputs: PortDefinition[]
  outputs: PortDefinition[]
  params: ParamDefinition[]
  compile?: (ctx: CompileContext) => CompiledBlock
}
```

Blocks are the only compute units. Every operation that reaches the compiler is a block.

## Canonical Block Features

Every block (user or derived) shares these properties:

- **Stable identity**: `blockId` is stable across edits and is used for state mapping.
- **Typed ports**: inputs/outputs have TypeDesc and inputs declare CombinePolicy.
- **Explicit parameters**: params are part of the block instance, not implicit inputs.
- **Deterministic evaluation**: compilation treats all blocks uniformly.
- **Optional state**: stateful behavior is owned by the block itself.
- **Transforms are blocks**: lens/adapter UI normalizes into explicit derived blocks.

Some blocks are **globally addressable** in the UI (BusBlocks); that is a UI affordance, not a different runtime type.

## Types of Blocks

There are categories of blocks.  All blocks are stateless except the 4 canonical stateful blocks.

### Stateful Blocks

ONLY these 4 blocks are stateful.  All others are stateless:

- UnitDelay

## Block Roles

Each block has a Role

## Derived Blocks

Derived blocks are blocks that exist in the patch but have UI-specific semantics or affordances to make them easier to use. They are still real blocks in the graph.

Examples:
- Bus blocks (globally addressable wiring UI)
- DefaultSource blocks (input fallback UI)
- Lens/Adapter blocks (transform UI on connections)
- Stateful infrastructure blocks created by graph surgery

Derived blocks are created by GraphNormalization, not by the compiler.

## Primitive vs Composite Validation

Validation must enforce:

- **Primitive blocks** have a compiler implementation and no composite graph.
- **Composite blocks** have a graph definition and no compiler implementation.

Any mismatch is a compile-time error (not a runtime fallback).

## Port Definition (Combine Policy)

```ts
interface PortDefinition {
  id: string
  type: TypeDesc
  direction: 'input' | 'output'
  combine?: CombinePolicy
}
```

All inputs support multiple writers and must define combine behavior (defaults to `last` when multi-writer).

## Block Categories (minimum)

- **TimeRoot**: FiniteTimeRoot, InfiniteTimeRoot
- **Domain**: GridDomain, PathDomain, SVGSampleDomain, etc.
- **Signal**: Oscillator, WaveShaper, ColorLFO, etc.
- **Field**: FieldMap, FieldZip, Broadcast, etc.
- **Reducers**: FieldSum, FieldMean, FieldMax, etc.
- **Render**: RenderInstances2D, RenderPath2D, etc.
- **Type/Domain Conversions**: PhaseToNumber, NumberToPhase, UnitToNumber, etc.
- **Transforms (Lens/Adapter)**: See `spec/07-transforms.md`
- **Infrastructure (Stateful)**: UnitDelay, Lag, Phasor, SampleAndHold

See `spec/08-primitives-composites.md` for the recommended primitive set and starter composite library.

## Bus Blocks

A bus is represented as a derived BusBlock:

- Input: `in` (multi-writer, CombineMode set by bus configuration)
- Output: `out`

Bus UI interactions create edges to/from the BusBlock in GraphNormalization.
BusBlocks are user-creatable; rails are immutable system-provided BusBlocks.

## Default Sources

Default sources are derived blocks that provide a fallback value for an input with zero writers. They are disconnected when any explicit writer exists.

## Stateful Primitives (Canonical)

These blocks are the minimal, explicit stateful primitives:

- **UnitDelay**: one-frame delay, used to break feedback loops
- **Lag**: smoothing (linear/exponential)
- **Phasor**: phase accumulator (0..1 ramp)
- **SampleAndHold**: latch on trigger

Stateful operations must be blocks. All transforms are blocks; edges are pure connections.
