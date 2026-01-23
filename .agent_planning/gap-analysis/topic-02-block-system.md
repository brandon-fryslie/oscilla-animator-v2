---
topic: 02
name: Block System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.md
audited: 2026-01-23T12:00:00Z
has_gaps: true
counts: { done: 22, partial: 7, wrong: 3, missing: 8, na: 3 }
---

# Topic 02: Block System

## DONE

- **Block structure (id, type, params, role)**: `src/graph/Patch.ts:38-54`
- **BlockRole discriminated union (user, derived, etc.)**: `src/types/index.ts:279-285`
- **DerivedBlockMeta (defaultSource, wireState, lens, adapter)**: `src/types/index.ts:300-304`
- **EdgeRole discriminated union (user, default, auto)**: `src/types/index.ts:341-344`
- **Block registry system (one canonical registry)**: `src/blocks/registry.ts:282-330`
- **BlockDef interface with lower function**: `src/blocks/registry.ts:234-276`
- **Cardinality-generic block metadata**: `src/blocks/registry.ts:86-123` — `CardinalityMode`, `LaneCoupling`, `BroadcastPolicy`
- **Payload-generic block metadata**: `src/blocks/registry.ts:129-177` — `PayloadSemantics`, `PayloadImplRef`, `PayloadCombination`
- **isCardinalityGeneric query function**: `src/blocks/registry.ts:398-401`
- **isPayloadGeneric query function**: `src/blocks/registry.ts:481-490`
- **Array block (Stage 2: cardinality transform)**: `src/blocks/array-blocks.ts:34-115`
- **GridLayout (Stage 3: layout)**: `src/blocks/instance-blocks.ts:31-100`
- **CircleLayout (Stage 3: layout)**: `src/blocks/instance-blocks.ts:196-264`
- **LineLayout (Stage 3: layout)**: `src/blocks/instance-blocks.ts:275-351`
- **Add block (math, cardinality-generic, payload-generic)**: `src/blocks/math-blocks.ts:16-61`
- **Multiply block (math, cardinality-generic, payload-generic)**: `src/blocks/math-blocks.ts:118-163`
- **UnitDelay block (stateful primitive)**: `src/blocks/signal-blocks.ts:229-279`
- **Hash block**: `src/blocks/signal-blocks.ts:285-332`
- **HSVToColor block (color conversion)**: `src/blocks/color-blocks.ts:74-113`
- **RenderInstances2D block (render sink)**: `src/blocks/render-blocks.ts:122-171`
- **Ellipse/Rect primitives (Stage 1: shape primitives)**: `src/blocks/primitive-blocks.ts:32-226`
- **Three-stage architecture (Primitive -> Array -> Layout)**: Correctly implemented across `primitive-blocks.ts`, `array-blocks.ts`, `instance-blocks.ts`
- **Default source materialization (graph normalization pass)**: `src/graph/passes/pass1-default-sources.ts`
- **Cycle validation (Tarjan's SCC)**: `src/compiler/passes-v2/pass5-scc.ts`
- **InfiniteTimeRoot block (time source)**: `src/blocks/time-blocks.ts:14-68`

## PARTIAL

- **Block.kind property**: `src/graph/Patch.ts:40` — Spec says use `kind` property, NOT `type`. Implementation uses `type: BlockType` instead of `kind`. The `BlockDef` in registry also uses `type` field. This is a NAMING divergence from spec.
- **BlockRole union variants**: `src/types/index.ts:279-285` — Spec defines only `user | derived`. Implementation adds `timeRoot | bus | domain | renderer` as additional top-level roles. The spec says buses/rails should be `{ kind: 'derived', meta: { kind: 'bus' | 'rail', ... } }`, not separate top-level roles.
- **DerivedBlockMeta variants**: `src/types/index.ts:300-304` — Missing `bus` and `rail` variants that spec requires. Has `adapter` variant not in spec. Spec defines: `defaultSource | wireState | bus | rail | lens`. Implementation has: `defaultSource | wireState | lens | adapter`.
- **CombineMode on ports**: `src/types/index.ts:140-146` and `src/blocks/registry.ts` — Spec says every port has a CombineMode (PortBinding structure). Implementation doesn't store CombineMode on port definitions. CombineMode is handled in the compiler pass (`combine-utils.ts`) but isn't a per-port declaration.
- **MVP stateful primitives**: Only UnitDelay implemented (`src/blocks/signal-blocks.ts:229-279`). Spec requires 4 MVP stateful primitives: UnitDelay, Lag, Phasor, SampleAndHold. Missing 3 of 4.
- **MVP basic block set**: Spec lists 13 MVP blocks. Present: TimeRoot (InfiniteTimeRoot), Circle (Ellipse), Array, Grid Layout, Hash, Add, Mul (Multiply), UnitDelay, HSV->RGB (HSVToColor/HsvToRgb), RenderInstances2D. Missing from list: Noise, Length, Normalize.
- **Edge has no role field**: `src/graph/Patch.ts:72-87` — Edge interface has `id, from, to, enabled, sortKey` but NO `role: EdgeRole` field. EdgeRole is defined in types/index.ts but never used in the Edge interface.

## WRONG

- **Block uses `type` instead of `kind`**: `src/graph/Patch.ts:40` — Spec explicitly says `kind: string` not `type`. Spec deprecated terminology table: "`Block.type` → use `Block.kind` instead — Reserved for type system." Implementation uses `type: BlockType`.
- **BlockRole has extra variants not in spec**: `src/types/index.ts:279-285` — Spec only defines `user | derived`. Implementation adds `timeRoot | bus | domain | renderer` as separate top-level kinds. Buses and rails should be derived blocks with appropriate DerivedBlockMeta, not separate role kinds.
- **DerivedBlockMeta missing bus/rail, has adapter**: `src/types/index.ts:300-304` — Spec defines bus and rail as DerivedBlockMeta kinds. Implementation removed them (comment says "bus/rail variants removed - buses are now regular blocks") and added `adapter` which is not in spec.

## MISSING

- **Lag stateful primitive block**: No file — Spec lists Lag as MVP stateful primitive: linear/exponential smooth toward target. Not registered.
- **Phasor stateful primitive block**: No file — Spec lists Phasor as MVP stateful primitive: 0..1 ramp with wrap semantics. Not registered.
- **SampleAndHold stateful primitive block**: No file — Spec lists SampleAndHold as MVP stateful primitive: latch on trigger. Not registered.
- **Noise block**: No file — Spec lists Noise as MVP basic block (#6). Not registered.
- **Length block**: No file — Spec lists Length as MVP basic block (#9): vector length. Not registered.
- **Normalize block**: No file — Spec lists Normalize as MVP basic block (#10): vector normalize. Not registered.
- **validateRoleInvariants function**: No file — Spec provides example implementation for validating role invariants (default edges must reference derived blocks). Not implemented.
- **PortBinding structure with CombineMode**: No file — Spec defines `PortBinding { id, dir, type, combine }` where every port carries its CombineMode. Implementation has `InputDef`/`OutputDef` in registry and `InputPort`/`OutputPort` in Patch, neither of which carries CombineMode.

## N/A

- **Polygon primitive block (MVP)**: `src/blocks/path-blocks.ts:91` — ProceduralPolygon exists but as a path block, not a primitive in the spec sense. Adequate for now.
- **Random Scatter layout (MVP)**: Spec lists it but implementation has CircleLayout/LineLayout/GridLayout which covers the core layout patterns. Random scatter is a future extension.
- **Spiral Layout (MVP)**: Spec lists it. Not implemented but not blocking for core MVP.
