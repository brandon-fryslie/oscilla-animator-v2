# Core Invariants (Unified Spec)

These are non-negotiable rules. If any of these are violated, the system becomes unstable, non-deterministic, or impossible to debug.

## 1) Graph and Compilation Boundaries

- **Compiler never mutates the graph.** No blocks or edges are inserted during compilation, ever.
- **GraphNormalization is required.** The compiler consumes a fully explicit NormalizedGraph produced by the Graph Normalizer component.
- **Everything is a block or wire at compile time.** Buses, default sources, lenses/adapters (transforms), and stateful infrastructure are derived blocks in the NormalizedGraph.  The compiler NEVER deals with buses, default sources, lenses, etc
- **Transforms are blocks.** Lenses/adapters are UI affordances that normalize into explicit derived blocks. Edges are pure stateless connections.
- **Derived blocks are real blocks.** The UI may render them differently, but they are compiled and executed like any other block.

## 2) Time

- **Time is monotonic and unbounded.** `t` never wraps, resets, or clamps (except as necessary for performance reasons, to prevent t from growing unbounded).
- **TimeRoot is a 'special block' that is managed by the system.**  
- There is a separate UI for configuring Time (TimeRoot blocks do NOT need to be on the patch)
- **Only two TimeRoot kinds exist:** finite and infinite. Nothing else is allowed.
- **TimeRoot** is a "block" in a sense, but it has no inputs, and is global (not user placeable on the patch).  Blocks may have time wired to them on demand

## 2.1) Rails
- TimeRoot outputs only to the Rails.  Every block MAY consume TimeRoot's output through the Rails mechanism
    - Rails = system buses that cannot be deleted or renamed.  Buses = globally addressable blocks 
      - Note: ALL functionality that buses or rails have is a capability of BLOCKS, NOT any special capability of rails or buses.  All blocks have the same capabilities.  Rails and Buses themselves are a UI convenience
- Rails are fixed and globally addressable.  The output of a rail can be a default source for any input of the correct type

## 2.5) Type System - Canonical

All of this, including the outputs of TimeRoot, and inputs and outputs of Rails, Buses, Lenses, Adapters, Default Sources, and everything else, follows the type system described below.

@design-docs/spec/compiler/canonical-types-and-constraints.md

This ^^^ is the canonical Type System for this project.

## 3) Multi-Writer Inputs (Combine is Mandatory)

- **Every input supports multiple writers.** No implicit single-writer assumption.
- **Every input has a CombineMode.** The compiler must combine writers deterministically each frame (strict block ordering)
- **a DefaultSource block is ALWAYS connected during GraphNormalization.** 
- **Default sources can be combined with explicit writers.**

## 3.5 Default Sources

- **A 'default source' is automatically created along with every port.  Default source always has the lowest priority (default combine mode on user created blocks is 'priority')
- **Default sources can be set any block that takes ZERO inputs (primitive or composite).  A user can choose the default source for a User Block
- Default sources are materialized in the Graph Normalizer to standard blocks
- The compiler never sees default sources

## 4) Buses Are Normalized to Blocks

- **Buses are just blocks with a special UI.**
- **Bus publish/subscribe is UI sugar.** GraphNormalization expands it into normal blocks and edges.
- **Bus combination uses the same multi-writer rules as any other input.**
- **Rails are immutable global bus blocks present in every patch.**

## 4.5) Rails

- **"Rails** are simply global immutable systme buses that every patch starts with. (time, phase, etc)

## 5) State and Feedback

- The vast majority of blocks are PURE and STATELESS
- **Statefulness must be explicit.** Any operation with memory is a block.
- **Feedback is allowed only through explicit stateful blocks (UnitDelay or equivalent).**
- **Cycle validation is mandatory.** Every cycle must cross a stateful boundary.

- 4 stateful primitive blocks:
**UnitDelay**: one-frame delay, used to break feedback loops
**Lag**: smoothing (linear/exponential)
**Phasor**: phase accumulator (0..1 ramp)
**SampleAndHold**: latch on trigger

ALL additional stateful blocks, without exception, are composite blocks that include one or more of these primitives 

## 6) Types: Fields, Domains, and Identity

- **Domains provide stable element identity.** IDs survive edits and enable deterministic state mapping.
- **Fields are lazy.** They are evaluated only at render sinks or explicit materialization points.
- **Materialization is scheduled and attributable.** No hidden bulk evaluation.
- When an edit happens in the patch, we transition between the patches, rather than 'cut' suddenly.  there must always be a sense of continuity in the animation

## 7) Determinism and Replay

- **No Math.random() at runtime.** All randomness is seeded and deterministic.
- **Order-dependent combine is deterministic.** Writer ordering is stable and explicit.
- **Replay is exact.** Given patch revision + seed + inputs, output is identical.
- **Pure evaluation contract.** Output is a pure function of (Patch, TimeCtx, Explicit State); no hidden influences.

## 8) Runtime Continuity

- **Hot-swap preserves time.** Recompilation never resets `t`.
- **State continuity follows explicit StateIds.** If identity changes, state is reset with diagnostics.
- **Old program renders until new program is ready.** Swap is atomic.
