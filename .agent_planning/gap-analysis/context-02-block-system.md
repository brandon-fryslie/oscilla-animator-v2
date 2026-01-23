---
topic: 02
name: Block System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.md
generated: 2026-01-23T12:00:00Z
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: []
---

# Context: Topic 02 — Block System

## What the Spec Requires

1. Block structure: `{ id: BlockId, kind: string, role: BlockRole, inputs: PortBinding[], outputs: PortBinding[] }`
2. Use `kind` property NOT `type` — `type` is reserved for the type system
3. PortBinding: `{ id: PortId, dir: {kind:'in'}|{kind:'out'}, type: SignalType, combine: CombineMode }`
4. BlockRole: `{ kind: 'user' } | { kind: 'derived'; meta: DerivedBlockMeta }`
5. DerivedBlockMeta: `defaultSource | wireState | bus | rail | lens`
6. EdgeRole: `user | default | busTap | auto`
7. Every block and edge carries explicit role declaration
8. Roles are closed discriminated unions with `kind` discriminator
9. No compiler-inserted invisible blocks (all blocks in patch.blocks)
10. Compiler ignores roles (roles are for editor only)
11. User entities are canonical (source of truth for undo/redo)
12. MVP stateful primitives: UnitDelay, Lag, Phasor, SampleAndHold
13. Three-stage architecture: Primitive (domain) -> Array (cardinality) -> Layout (spatial)
14. Array is the ONLY place where instances are created
15. MVP basic blocks (13): TimeRoot, Circle, Array, Grid Layout, Hash, Noise, Add, Mul, Length, Normalize, UnitDelay, HSV->RGB, RenderInstances2D
16. Cardinality-generic block formal contract (4 properties)
17. Payload-generic block formal contract (4 properties)
18. CombineMode as discriminated union (numeric, any, bool categories)
19. Default sources: every input always has exactly one source
20. Default values by PayloadType (useful defaults, not zeros)
21. Rails: time, phaseA, phaseB, pulse, palette (immutable system buses)
22. Cycle validation: every cycle must cross a stateful boundary (Tarjan's SCC)
23. Block categories: Primitive, Instance, Layout, Math, State, Color, Render, Time
24. validateRoleInvariants function

## Current State (Topic-Level)

### How It Works Now

Blocks are defined via `registerBlock()` in `src/blocks/registry.ts` with a unified `BlockDef` type containing metadata, port definitions, and IR lowering functions. The Patch graph in `src/graph/Patch.ts` uses `Block` with `type: BlockType` (not `kind`). BlockRole is extended beyond spec with extra top-level variants (timeRoot, bus, domain, renderer). The three-stage architecture (Primitive -> Array -> Layout) is correctly implemented. Cycle validation via Tarjan's SCC exists in `src/compiler/passes-v2/pass5-scc.ts`. Default source materialization happens in graph normalization pass 1.

### Patterns to Follow

- Block registration: `registerBlock({ type, label, category, form, capability, cardinality, payload, inputs, outputs, lower })`
- Port definitions: `InputDef { type, value?, defaultSource?, uiHint?, exposedAsPort? }`
- Lower functions: `(args: LowerArgs) => LowerResult` with `outputsById` and optional `instanceContext`
- Cardinality metadata: `{ cardinalityMode, laneCoupling, broadcastPolicy }`
- Payload metadata: `{ allowedPayloads, combinations?, semantics }`

## Work Items

### WI-1: Rename Block.type to Block.kind

**Status**: WRONG
**Spec requirement**: Block uses `kind: string` property, NOT `type`. `type` is reserved for the type system (SignalType).
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/graph/Patch.ts` | Block interface | 40, 56 |
| `src/blocks/registry.ts` | BlockDef.type field | 236 |
| All block definition files | `type: 'Add'` etc. | Throughout src/blocks/ |
| `src/graph/passes/pass1-default-sources.ts` | `block.type` usage | 47 |
| Many consumer files | `block.type` references | Throughout |

**Current state**: `Block.type: BlockType` and `BlockDef.type: string`
**Required state**: `Block.kind: string` and `BlockDef.kind: string`
**Suggested approach**: Rename `type` to `kind` in Block interface and BlockDef. This is a wide codebase rename. Use find-and-replace carefully (many files reference `block.type` or `def.type`). Note: `BlockType` type alias should become `BlockKind` or just be removed (it's just `string`).
**Risks**: Very wide refactor. Must be done atomically. `type` is also used as a JS keyword in imports (`import type`) so regex must be careful.
**Depends on**: None

### WI-2: Simplify BlockRole to Match Spec (user | derived)

**Status**: WRONG
**Spec requirement**: BlockRole is only `{ kind: 'user' } | { kind: 'derived'; meta: DerivedBlockMeta }`
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/types/index.ts` | BlockRole definition | 279-285 |
| `src/types/index.ts` | Helper functions | 309-331 |
| All block definitions | Role assignment | Throughout |
| `src/graph/Patch.ts` | PatchBuilder default role | 152 |

**Current state**: BlockRole has 6 variants: `user | timeRoot | bus | domain | renderer | derived`
**Required state**: BlockRole has 2 variants: `user | derived`. TimeRoot, bus, domain, renderer should become derived blocks with appropriate meta kinds.
**Suggested approach**: Collapse timeRoot/bus/domain/renderer into derived with new DerivedBlockMeta kinds. E.g., `{ kind: 'derived', meta: { kind: 'timeRoot' } }`. Update DerivedBlockMeta to include `timeRoot | bus | rail | domain | renderer` alongside existing `defaultSource | wireState | lens`.
**Risks**: Semantic change. Must update all role checks in UI and normalization code.
**Depends on**: WI-3 (DerivedBlockMeta update)

### WI-3: Fix DerivedBlockMeta to Match Spec

**Status**: WRONG
**Spec requirement**: DerivedBlockMeta includes `bus` and `rail` variants with `target: { kind: 'bus', busId: BusId }`. Does NOT include `adapter`.
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/types/index.ts` | DerivedBlockMeta definition | 300-304 |

**Current state**: Has `defaultSource | wireState | lens | adapter`. Missing `bus | rail`.
**Required state**: Has `defaultSource | wireState | bus | rail | lens` (plus possibly timeRoot/domain/renderer per WI-2)
**Suggested approach**: Add `bus` and `rail` variants. Remove `adapter` or make it part of `lens`. Add BusId branded type.
**Risks**: Must coordinate with WI-2 if collapsing top-level role variants into derived
**Depends on**: None

### WI-4: Add Edge.role Field

**Status**: MISSING
**Spec requirement**: Every edge carries explicit role declaration
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/graph/Patch.ts` | Edge interface | 72-87 |
| `src/types/index.ts` | EdgeRole type | 341-344 |
| `src/graph/Patch.ts` | PatchBuilder.addEdge | 159-168 |

**Current state**: Edge has no `role` field. EdgeRole type is defined in types but unused.
**Required state**: Edge interface includes `readonly role: EdgeRole`. PatchBuilder sets role on edges. Add `busTap` variant back per spec.
**Suggested approach**: Add `role: EdgeRole` to Edge interface. Default to `{ kind: 'user' }` in PatchBuilder. Add busTap variant back to EdgeRole.
**Risks**: Needs migration for existing edge construction. Default source pass should set role to `{ kind: 'default', ... }`.
**Depends on**: None

### WI-5: Add PortBinding with CombineMode

**Status**: MISSING
**Spec requirement**: Each port has `{ id, dir, type, combine: CombineMode }`
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/graph/Patch.ts` | InputPort/OutputPort interfaces | 19-32 |
| `src/types/index.ts` | CombineMode type | 140-146 |
| `src/blocks/registry.ts` | InputDef/OutputDef | 206-228 |

**Current state**: InputPort/OutputPort only have `id` and optional `defaultSource`. CombineMode is separate.
**Required state**: Ports carry CombineMode as part of their structure (even if defaulted for outputs)
**Suggested approach**: Add `combine: CombineMode` to InputDef in registry (as the definition-level default). Add it to InputPort in Patch (as the per-instance value). Outputs can have a fixed `last`.
**Risks**: Moderate refactor. Must choose where CombineMode is specified vs resolved.
**Depends on**: WI-6 (CombineMode discriminated union refactor, from Topic 01)

### WI-6: Implement Lag Stateful Primitive

**Status**: MISSING
**Spec requirement**: Lag: smoothing filter, linear/exponential smooth toward target
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/blocks/signal-blocks.ts` | New block registration | After UnitDelay (line 279) |

**Current state**: Only UnitDelay exists as stateful primitive
**Required state**: Lag block registered with state allocation, smooth toward target behavior
**Suggested approach**: Register new block with `capability: 'state'`, allocate state slot for current value, lower to state read + lerp toward input + state write
**Risks**: None - additive. Follow UnitDelay pattern.
**Depends on**: None

### WI-7: Implement Phasor Stateful Primitive

**Status**: MISSING
**Spec requirement**: Phasor: phase accumulator, 0..1 ramp with wrap semantics
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/blocks/signal-blocks.ts` | New block registration | After UnitDelay |

**Current state**: Not implemented
**Required state**: Phasor block: `state += rate; state %= 1.0; output = state`
**Suggested approach**: Register with state slot, rate input, wrap semantics in lower function
**Risks**: None - additive
**Depends on**: None

### WI-8: Implement SampleAndHold Stateful Primitive

**Status**: MISSING
**Spec requirement**: SampleAndHold: latch on trigger, `if trigger: y=x else y=prev`
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/blocks/signal-blocks.ts` | New block registration | After UnitDelay |

**Current state**: Not implemented
**Required state**: SampleAndHold with signal input, trigger input, state for held value
**Suggested approach**: Register with state slot, check trigger (discrete temporality input), conditionally update state
**Risks**: Requires discrete/trigger input handling which may not be fully implemented in lowering
**Depends on**: Event/trigger system maturity

### WI-9: Implement Noise Block

**Status**: MISSING
**Spec requirement**: Noise: procedural noise (MVP basic block #6)
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/blocks/math-blocks.ts` or new file | New block registration | New |

**Current state**: Hash exists but not Noise (different algorithms)
**Required state**: Noise block producing procedural noise values
**Suggested approach**: Register Noise with value/seed inputs, use noise kernel (Perlin, simplex, or value noise)
**Risks**: Need to decide noise algorithm and implement kernel
**Depends on**: None

### WI-10: Implement Length and Normalize Blocks

**Status**: MISSING
**Spec requirement**: Length (vec2/vec3 → float) and Normalize (vec2/vec3 → same) MVP basic blocks
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/blocks/math-blocks.ts` | New block registrations | After existing math blocks |

**Current state**: Not implemented
**Required state**: Length block: vec2 input → float output (magnitude). Normalize: vec2 input → vec2 output (unit vector). Both payload-generic over {vec2} (spec says {vec2, vec3} but vec3 not in PayloadType yet).
**Suggested approach**: Register with payload-generic metadata, lower to appropriate opcodes
**Risks**: None - additive
**Depends on**: None

### WI-11: Implement validateRoleInvariants

**Status**: MISSING
**Spec requirement**: Function that validates role invariants (default edges reference derived blocks, etc.)
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/graph/` or `src/compiler/` | New validation function | New file or addition |

**Current state**: No role invariant validation exists
**Required state**: Function checking: default edges reference derived defaultSource blocks, roles are consistent
**Suggested approach**: Add to graph normalization or as a separate diagnostic pass. Check all Edge roles against Block roles.
**Risks**: Depends on WI-4 (Edge.role) being implemented first
**Depends on**: WI-4

### WI-12: Add Palette Rail

**Status**: PARTIAL (already in InfiniteTimeRoot outputs)
**Spec requirement**: `palette` rail: `one + continuous + color`, chromatic reference frame
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/blocks/time-blocks.ts` | palette output | 36 |

**Current state**: InfiniteTimeRoot has `palette` output of type `signalType('color')`. This is correct per spec.
**Required state**: Already present. But the spec says rails are derived blocks with `{ kind: 'rail', target: { kind: 'bus', busId } }` meta, not outputs of TimeRoot. This is a structural question.
**Suggested approach**: The current approach (palette as TimeRoot output) is pragmatic and works. If rails become separate blocks per spec, this would need refactoring. Leave as-is for now.
**Risks**: None for current approach
**Depends on**: WI-3 (DerivedBlockMeta rail variant)
