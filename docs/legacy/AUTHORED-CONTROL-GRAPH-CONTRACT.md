# Authored Control Graph Contract

Status: accepted contract for `lit-b90e7a20-4db23d94`

## Purpose

Freeze one canonical PatchStore-owned representation for block input semantics before the follow-on migration issues land.

The current runtime spreads input semantics across:

- `block.params` for some exposed-input literal values
- `inputPort.defaultSource` for some fallback/default authoring
- `inputPort.lenses` for ordered per-port transforms
- UI/compiler code that re-derives "controls" by inspecting those fields together

That split is wrong. Controls are projections of canonical input semantics. They are not the source of those semantics.

This document defines the steady-state replacement and the exact migration invariants.

// [LAW:one-source-of-truth] This document names one canonical input-binding representation and forbids parallel steady-state ownership paths.
// [LAW:single-enforcer] PatchStore remains the only mutable boundary for input-binding state.
// [LAW:one-type-per-behavior] Literal values, default-like sources, and lens chains are one input-binding model with different projections, not separate storage systems.

## Scope

In scope:

- PatchStore-owned block input semantics
- patch persistence and Patch DSL import/export
- compiler/frontend normalization inputs
- editor adapter and UI control projection
- composite exposure rules
- stable identities used by later control-surface work

Out of scope:

- control-pane product design
- new control publication APIs beyond the identities defined here
- any long-lived compatibility layer that keeps legacy fields authoritative

## Canonical Model

Steady-state semantic state for any graph-backed block input lives in one PatchStore-owned input-binding structure on the owning input port.

```ts
type InputBindingOwnerId = `${BlockId}:${PortId}`;
type InputBindingNodeId = 'source' | `lens:${string}`;

interface InputBindingSourceNode {
  readonly id: 'source';
  readonly blockType: BlockType;
  readonly outputPortId: PortId;
  readonly params: Readonly<Record<string, unknown>>;
}

type LensTarget =
  | { readonly kind: 'inline-source' }
  | { readonly kind: 'incoming-edge'; readonly sourceAddress: string };

interface InputBindingLensNode {
  readonly id: `lens:${string}`;
  readonly blockType: BlockType;
  readonly outputPortId: PortId;
  readonly params: Readonly<Record<string, unknown>>;
  readonly target: LensTarget;
}

interface InputBinding {
  readonly ownerId: InputBindingOwnerId;
  readonly source: InputBindingSourceNode | null;
  readonly lenses: readonly InputBindingLensNode[];
}

interface InputPort {
  readonly id: PortId;
  readonly combineMode: CombineMode;
  readonly inputBinding?: InputBinding;
}
```

Interpretation:

- Every exposed input port may own one `InputBinding`.
- `source` is the canonical inline/derived producer for that input when the binding is not represented by a separate visible source block and visible user edge.
- `lenses` is an ordered list owned by the same input port.
- A visible graph edge remains an ordinary patch edge. It is not duplicated into a second value bag.
- A compact inline literal editor, a default-like source UI, and a lens editor are all projections of the same canonical input-binding model.

// [LAW:locality-or-seam] Input-binding changes remain local to the owning input port instead of cascading through unrelated block metadata.
// [LAW:dataflow-not-control-flow] Compiler and UI always read the same binding structure; optionality is encoded as `null`, empty arrays, and ordinary patch edges.

## Ownership Rules

### Block Fields That Remain

`Block.params` remains only for true block-instance config that is not represented as graph-backed input binding state.

Examples:

- `Const.value`
- expression text or mode values for blocks whose semantics are not modeled as incoming bindings
- other non-graph config aligned to the block instance rather than to an incoming bound input

`displayName`, `domainId`, `role`, `inputPorts`, and `outputPorts` remain block metadata or topology.

### Block Fields That Are Deleted From Steady State

The following instance-level fields are not allowed to remain authoritative after the migration:

- exposed-input values mirrored in `block.params`
- `inputPort.defaultSource`
- `inputPort.lenses`

Registry metadata may still describe creation seeds, but registry metadata is not instance state and is never read as a steady-state substitute for `InputPort.inputBinding`.

### Authoring Seeds

`InputDef.defaultSource` and `InputDef.defaultValue` may remain only as block-creation seeds:

- `PatchStore.addBlock()` may consume them once to initialize `inputPort.inputBinding`
- parser/import may consume them once while constructing canonical in-memory state from stable user-facing syntax
- editor/compiler/runtime reads must not consult them as fallback instance state after initialization

// [LAW:single-enforcer] Seed application happens at one boundary only: PatchStore creation/import.

## Structural Semantics

### Inline Source Nodes

`InputBinding.source` represents the canonical inline or derived source for an input when that source is not represented by a separately materialized visible block and edge.

Examples:

- a literal knob value is `blockType: 'Const', outputPortId: 'out', params: { value: 0.5 }`
- a time-like default is a source node whose `blockType` has time capability
- a non-const derived source such as `Ellipse.shape` is represented by that source block type plus params and output port

This source is semantic graph state. A compact control is only one way to render it.

### Lens Nodes

Lens nodes are explicit input-binding nodes, not metadata hanging off a port.

Rules:

- lens order is array order in `InputBinding.lenses`
- `lens.id` stays stable once created
- `lens.target.kind === 'inline-source'` means the lens transforms the port's inline source node
- `lens.target.kind === 'incoming-edge'` means the lens transforms the matching upstream connection selected by `sourceAddress`

`sortKey` is not needed in steady state because order is represented structurally by array position. If persistence needs explicit ordering during migration, it must derive array order once and then delete `sortKey`.

### Materialization

Materializing an inline source as a visible graph block and edge, or dematerializing that visible representation back into an inline source, is a projection change over one semantic binding.

It is not an ownership transfer between two semantic models.

// [LAW:one-type-per-behavior] Inline source nodes, materialized source blocks, and lens chains are one binding model with different presentations and lowering forms.

## Stable Identity And Address Contract

Internal canonical identity is block-id based, not display-name based.

Stable IDs:

- binding owner: `${blockId}:${portId}`
- inline source node id: `source`
- lens node id: `lens:${legacyLensId}`

Stable addresses exposed to later control-surface work:

- owner: `control:${blockId}:${portId}`
- source: `control:${blockId}:${portId}:source`
- lens: `control:${blockId}:${portId}:lens:${legacyLensId}`

Migration rules:

- existing lens ids generated by `nextLensAttachmentId()` are preserved byte-for-byte
- the current derived default-source pseudo-block id `_ds_${blockId}_${portId}` is not preserved as a canonical identity
- any code that currently keys fast-path updates by `{blockId}:{portId}` or derived lens ids must cut over to the new owner/node ids without inventing a second handle system

The current user-facing canonical-address helpers may continue to project friendly strings, but patch mutation, persistence, and control publication must use the IDs above as the authoritative handles.

// [LAW:one-source-of-truth] Stable control handles derive from one binding identity system; display-name projections are derived views only.

## Composite Rule

Only exposed input ports surface controls outside a composite boundary.

Implications:

- internal composite block ports may own canonical input bindings, but those bindings remain internal
- composite publication projects controls only for `exposedInputs`
- `ExposedInputPort` must not duplicate binding semantics in `defaultSource` or a second params bag
- if an exposed input forwards an internal port, the exposed input is the published control seam and the internal port remains implementation detail

Steady-state composite behavior:

- composite definition storage keeps one authoritative binding owner per semantic input
- editor/UI lists controls only for exposed inputs
- compile/expansion carries the canonical binding through the exposed input seam without publishing internal-only controls

// [LAW:one-way-deps] Composite internals feed the published exposed-input seam; the UI must not crawl back inward and invent hidden controls.

## Migration Matrix

| Current field/path | Steady-state replacement | Notes |
| --- | --- | --- |
| `block.params[inputId]` for graph-backed exposed inputs | `inputPort.inputBinding.source.params.value` when the inline source node is `Const` | Exposed-input literals stop living in `block.params`. |
| `block.params[*]` for true non-graph config | `block.params[*]` | These remain canonical config. |
| `inputPort.defaultSource` | `inputPort.inputBinding.source` | Default-like source authoring becomes canonical input-binding source state. |
| `inputPort.lenses[]` | `inputPort.inputBinding.lenses[]` | Preserve per-port ownership and order. |
| `LensAttachment.sortKey` | array order in `inputBinding.lenses` | Derived once, then deleted. |
| `derivedDefaultSourceBlockId()` | `control:${blockId}:${portId}:source` | Pseudo block ids stop being identity. |
| `derivedLensParamKey(portId, lensId, paramId)` | `control:${blockId}:${portId}:lens:${legacyLensId}:param:${paramId}` | Fast-path keys follow binding node identity. |
| `PatchStore.updateBlockParams()` for graph-backed exposed inputs | input-binding mutation APIs on PatchStore | `updateBlockParams()` becomes true-config-only. |
| `PatchStore.updateInputPort(... defaultSource ...)` | binding-source mutation API on PatchStore | No silent mirroring back to params. |
| `PatchStore.addLens/removeLens/updateLensParams` | same operations against `inputPort.inputBinding.lenses` | API names may stay; ownership path changes. |
| `materializeInputDefaultSource()/dematerializeInputDefaultSource()` | projection helpers over `inputBinding.source` and ordinary patch edges | They no longer move ownership between two semantic models. |
| Patch JSON `inputPorts[].defaultSource` | Patch JSON `inputPorts[].inputBinding.source` | Storage shape cuts over to canonical binding state. |
| Patch JSON `inputPorts[].lenses` | Patch JSON `inputPorts[].inputBinding.lenses` | Preserve ids and order. |
| Existing HCL inline assignment for an exposed input | unchanged HCL syntax, parsed into canonical `inputBinding.source = Const(...)` | HCL remains user-facing syntax, not object-shape syntax. |
| Existing HCL `port.defaultSource = ...` syntax | unchanged HCL syntax, parsed into canonical `inputBinding.source` | Parser/serializer map stable syntax to canonical binding state. |
| Existing HCL lens syntax | unchanged HCL syntax, parsed into canonical `inputBinding.lenses` | Lens ownership becomes canonical in memory even if surface syntax stays stable. |
| `PatchStoreAdapter` fallback to registry `defaultSource` | adapter reads canonical binding state plus ordinary patch edges only | Registry defaults are creation seeds, not runtime instance state. |
| `nodeDataTransform()` control reconstruction from params/defaults | direct projection from canonical binding state and true config | No heuristic merge of params, defaults, and port metadata. |
| `FrontendResultStore` synthesized `DefaultSource` identity | provenance derived from binding owner/node identity | No second default-source identity system. |
| `CompositeEditorStore` copying `exposed.defaultSource` | exposed-input publication references the canonical binding owner | No duplicated composite control state. |

## Mutation Boundary Contract

PatchStore is the sole mutable owner of canonical input-binding state.

Required steady-state PatchStore API split:

- `updateBlockParams(blockId, params)` only accepts true config-only keys
- `setInputBindingSource(blockId, portId, source | null)`
- `updateInputBindingSourceParams(blockId, portId, params)`
- `addInputBindingLens(blockId, portId, lens)`
- `removeInputBindingLens(blockId, portId, lensId)`
- `updateInputBindingLensParams(blockId, portId, lensId, params)`
- `reorderInputBindingLenses(blockId, portId, nextOrder)`

Mutation invariants:

- graph-backed input edits never mirror back into `block.params`
- graph-backed input edits never write `inputPort.defaultSource` or `inputPort.lenses`
- block creation/import is the only place allowed to synthesize canonical binding state from block-definition seeds or stable user-facing syntax

// [LAW:single-enforcer] Cross-cutting migration and validation happen at PatchStore, not duplicated across UI/compiler callsites.

## Persistence Contract

Patch JSON must persist the canonical input-binding structure 1:1.

Required JSON shape:

```ts
inputPorts: Array<{
  id: string;
  combineMode: string;
  inputBinding?: {
    ownerId: string;
    source: { id: 'source'; blockType: string; outputPortId: string; params: Record<string, unknown> } | null;
    lenses: Array<{
      id: `lens:${string}`;
      blockType: string;
      outputPortId: string;
      params: Record<string, unknown>;
      target: { kind: 'inline-source' } | { kind: 'incoming-edge'; sourceAddress: string };
    }>;
  };
}>
```

Required HCL semantics:

- HCL remains a stable user-facing language rather than a dump of runtime object shape
- inline block attributes continue to express either true config or exposed-input literal bindings depending on the block definition
- `port` and lens syntax continue to express user intent, but parser/serializer map that syntax to canonical input-binding state
- parser and serializer must agree on one semantic model even when the surface syntax stays compact

Required parser/serializer rules:

- existing HCL syntax for exposed-input inline literals maps to canonical `inputBinding.source`
- existing HCL syntax for explicit source/default authoring maps to canonical `inputBinding.source`
- existing HCL lens syntax maps to canonical `inputBinding.lenses`
- serializer emits stable user-facing syntax; it does not expose JS object layout choices
- there is no compatibility requirement for external legacy saved patches beyond checked-in repository fixtures, so the repo must migrate its own fixtures instead of keeping parser/runtime fallback logic

No serializer or parser may reconstruct runtime semantics by guessing from multiple legacy fields after the cutover.

## Compiler Contract

Compiler/frontend normalization consumes canonical binding state directly.

Required behavior:

- graph-backed input planning reads `inputPort.inputBinding` plus ordinary patch edges
- true non-graph config reads `block.params`
- normalization may lower canonical binding state to explicit graph blocks and edges, but that lowering is a derived compiler view, not the authored store
- provenance in `FrontendResultStore` must point back to binding owner/node ids, not synthesize a second default-source identity system

This keeps the semantic model explicit while still allowing the compiler to operate on ordinary blocks and edges after lowering.

## Editor Adapter And UI Projection Contract

Editor adapters and node/control projections read canonical input bindings and true config directly.

Steady-state rules:

- controls are projections of canonical binding state or true config state
- control enumeration starts from block inputs and block config, not from UI-local heuristics
- a disconnected exposed input with `inputBinding.source = Const` may render as a compact inline value editor
- a connected input with lenses renders those lenses from `inputBinding.lenses`
- no UI code falls back to `block.params[inputId]` for graph-backed inputs
- no UI code falls back to registry `defaultSource` as if it were current instance state

The adapter may still derive display-friendly summaries, but those summaries are derived from canonical binding state and true config only.

## Cutover Plan By Issue

### CTRL-AUTH-02

- add `inputPort.inputBinding` to PatchStore data types
- classify block fields into true config vs graph-backed input binding state
- migrate exposed-input literal ownership out of `block.params`
- make PatchStore mutation APIs binding-aware and config-only where appropriate

### CTRL-AUTH-03

- replace `inputPort.defaultSource` ownership with canonical `inputBinding.source`
- rewrite materialize/dematerialize helpers as projection helpers over one semantic binding
- keep visible source blocks/edges and inline source projections semantically aligned

### CTRL-AUTH-04

- replace `inputPort.lenses` ownership with canonical `inputBinding.lenses`
- preserve lens ids and per-port order
- move lens params and fast-path keys onto canonical binding lens node ids

### CTRL-AUTH-05

- cut JSON and HCL persistence to canonical binding state
- cut compiler/frontend normalization to canonical binding inputs
- cut `PatchStoreAdapter`, `nodeDataTransform`, `FrontendResultStore`, and composite publication to canonical binding reads only
- delete legacy field readers/writers and any heuristic reconstruction paths

## Deletion Plan

The following must be deleted by the end of the epic, not left dormant:

- instance-level `inputPort.defaultSource`
- instance-level `inputPort.lenses`
- graph-backed input mirrors inside `block.params`
- PatchStore synchronization logic between `block.params` and `defaultSource`
- default-source pseudo-block identity helpers as authoritative handles
- UI/editor fallback logic that merges `block.params`, instance defaultSource, and registry defaults to decide what a control is
- persistence or DSL support that treats legacy runtime fields as steady-state authored state

There is no requirement to preserve runtime or parser fallback behavior for external legacy saved patches. Checked-in repository fixtures are migrated as part of this epic instead.

// [LAW:no-mode-explosion] The migration removes dual-mode runtime behavior instead of institutionalizing it.

## Invariants

1. One exposed input port has at most one canonical inline source node.
2. One exposed input port owns exactly one ordered lens list.
3. `block.params` never stores graph-backed input values in steady state.
4. Compiler, persistence, editor adapter, and UI all read the same canonical binding structure for graph-backed inputs.
5. Controls are projections of canonical binding state or true config state; they are never the source of semantic truth.
6. Control publication surfaces only exposed ports across composite boundaries.
7. Lens ids survive migration unchanged.
8. Binding owner/node ids are deterministic functions of block id, port id, and preserved lens id.
9. Materialized graph blocks and edges derived from canonical bindings are projections, not ownership transfers.

## Non-Goals

- preserving JS-object-shaped HCL syntax
- keeping `defaultSource` or `lenses` as convenience mirrors
- supporting both legacy and canonical runtime models in normal behavior
- publishing internal composite controls that are not exposed at the boundary

## Verification Checklist

This contract is complete only if all of the following remain true:

- one authoritative canonical binding structure is named in this document
- the document explicitly forbids steady-state parallel ownership in `block.params`, `defaultSource`, and `lenses`
- the migration matrix covers PatchStore, persistence, compiler, editor adapter, UI projection, and composites
- the document makes clear that controls are projections of semantic state rather than the source of values
- stable ids/addresses and deletion steps are explicit enough to implement the follow-on issues without guessing
