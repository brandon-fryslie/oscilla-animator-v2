# Authored Control Graph Contract

Status: accepted contract for `lit-b90e7a20-4db23d94`

## Purpose

Freeze one canonical authored representation for control-bearing author intent before the follow-on migration issues land.

The current runtime spreads authored control state across:

- `block.params` for exposed-port literal values
- `inputPort.defaultSource` for fallback/default authoring
- `inputPort.lenses` for ordered per-port transforms
- UI/compiler projection code that re-derives "controls" by inspecting those fields together

This document defines the steady-state replacement and the exact migration invariants.

// [LAW:one-source-of-truth] This document names one canonical authored-control representation and forbids parallel steady-state ownership paths.
// [LAW:single-enforcer] PatchStore remains the only mutable boundary for authored-control state.
// [LAW:one-type-per-behavior] Const/default-source/lens authoring are represented as one typed authored-control node model, not bespoke side channels.

## Scope

In scope:

- PatchStore-owned authored control data
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

Steady-state authored control data lives on the owning input port and nowhere else.

```ts
type ControlOwnerId = `${BlockId}:${PortId}`;
type ControlNodeId = 'source' | `lens:${string}`;

interface AuthoredControlNode {
  readonly id: ControlNodeId;
  readonly blockType: BlockType;
  readonly outputPortId: PortId;
  readonly params: Readonly<Record<string, unknown>>;
}

type LensTarget =
  | { readonly kind: 'authored-source' }
  | { readonly kind: 'incoming-edge'; readonly sourceAddress: string };

interface AuthoredLensNode extends AuthoredControlNode {
  readonly id: `lens:${string}`;
  readonly target: LensTarget;
}

interface AuthoredInputControl {
  readonly ownerId: ControlOwnerId;
  readonly source: AuthoredControlNode | null;
  readonly lenses: readonly AuthoredLensNode[];
}

interface InputPort {
  readonly id: PortId;
  readonly combineMode: CombineMode;
  readonly authoredControl?: AuthoredInputControl;
}
```

Interpretation:

- Every exposed input port may own one `AuthoredInputControl`.
- `source` is the authored fallback/default producer for that port. It is explicit structure, not a hidden param/default bag.
- `lenses` is an ordered list owned by the same input port.
- Each lens is explicit authored structure and declares what upstream value it transforms:
  - `authored-source` means the port's inline fallback/default source
  - `incoming-edge` means a real graph edge identified by the upstream source address

// [LAW:locality-or-seam] Port-owned control state changes remain local to the owning input port instead of cascading through unrelated block metadata.
// [LAW:dataflow-not-control-flow] Normalization/compiler/UI always read the same authored-control structure in the same order; optionality is encoded as `null` and empty arrays.

## Ownership Rules

### Block Fields That Remain

`Block.params` remains only for true block-instance metadata/config:

- inputs with `exposedAsPort === false`
- block-specific non-control config that is not represented as graph authoring

`displayName`, `domainId`, `role`, `inputPorts`, and `outputPorts` remain block metadata or topology.

### Block Fields That Are Deleted From Steady State

The following instance-level fields are not allowed to remain authoritative after the migration:

- exposed input values mirrored in `block.params`
- `inputPort.defaultSource`
- `inputPort.lenses`

Registry metadata may still describe authoring seeds, but registry metadata is not instance state and is never read as a steady-state substitute for `InputPort.authoredControl`.

### Authoring Seeds

`InputDef.defaultSource` and `InputDef.defaultValue` may remain only as creation/import seeds:

- `PatchStore.addBlock()` may consume them once to initialize `inputPort.authoredControl`
- HCL/JSON import migration may consume them once when upgrading old patches
- editor/compiler/UI reads must not consult them as fallback instance state after initialization

// [LAW:single-enforcer] Seed application happens at one boundary only: PatchStore creation/import.

## Structural Semantics

### Source Nodes

`AuthoredInputControl.source` is an authored block-like node with:

- `blockType`
- `outputPortId`
- `params`

Examples:

- a literal knob value is `blockType: 'Const', outputPortId: 'out', params: { value: 0.5 }`
- a time fallback is an authored source node whose `blockType` has time capability
- a non-const default producer such as `Ellipse.shape` is represented by that source block type plus params and output port

The source node is explicit even when the editor presents it as a compact inline control rather than as a visible graph block.

### Lens Nodes

Lens nodes are explicit authored-control nodes, not metadata hanging off a port.

Rules:

- lens order is array order in `AuthoredInputControl.lenses`
- `lens.id` stays stable once created
- `lens.target.kind === 'authored-source'` means the lens transforms the port's inline source node
- `lens.target.kind === 'incoming-edge'` means the lens transforms the matching upstream connection selected by `sourceAddress`

`sortKey` is not needed in steady state because order is represented structurally by array position. If persistence needs explicit ordering during migration, it must derive array order once and then delete `sortKey`.

// [LAW:one-type-per-behavior] Lens blocks and source blocks share one authored node shape; role differences are data, not separate storage systems.

## Stable Identity And Address Contract

Internal canonical identity is block-id based, not display-name based.

Stable IDs:

- control owner: `${blockId}:${portId}`
- source node id: `source`
- lens node id: `lens:${legacyLensId}`

Stable addresses exposed to later control-surface work:

- owner: `control:${blockId}:${portId}`
- source: `control:${blockId}:${portId}:source`
- lens: `control:${blockId}:${portId}:lens:${legacyLensId}`

Migration rules:

- existing lens ids generated by `nextLensAttachmentId()` are preserved byte-for-byte
- the current derived default-source pseudo-block id `_ds_${blockId}_${portId}` is not preserved as a canonical identity; it is replaced by the stable source address above
- any code that currently keys fast-path updates by `{blockId}:{portId}` or derived lens ids must cut over to the new owner/node ids without inventing a second handle system

The current user-facing canonical-address helpers may continue to project friendly strings, but patch mutation, persistence, and control publication must use the IDs above as the authoritative handles.

// [LAW:one-source-of-truth] Stable control handles derive from owner and node ids once; display-name projections are derived views only.

## Composite Rule

Only exposed input ports surface controls outside a composite boundary.

Implications:

- internal composite block ports may own authored controls, but those controls remain internal
- composite publication projects authored controls only for `exposedInputs`
- `ExposedInputPort` must not duplicate control values in `defaultSource` or a second params bag
- if an exposed input forwards an internal port, the exposed input is the published control seam and the internal port remains implementation detail

Steady-state composite behavior:

- composite definition storage keeps one authoritative authored-control owner per semantic input
- editor/UI lists controls only for exposed inputs
- compile/expansion carries the authored control through the exposed input seam without publishing internal-only controls

// [LAW:one-way-deps] Composite internals feed the published exposed-input seam; the UI must not crawl back inward and invent hidden controls.

## Migration Matrix

| Current field/path | Steady-state replacement | Notes |
| --- | --- | --- |
| `block.params[inputId]` for `exposedAsPort !== false` | `inputPort.authoredControl.source.params.value` when the source node is `Const` | Exposed-port literals stop living in `block.params`. |
| `block.params[*]` for config-only inputs | `block.params[*]` | These remain canonical config. |
| `inputPort.defaultSource` | `inputPort.authoredControl.source` | Same semantics, explicit node shape. |
| `inputPort.lenses[]` | `inputPort.authoredControl.lenses[]` | Preserve per-port ownership and order. |
| `LensAttachment.sortKey` | array order in `authoredControl.lenses` | Derived once, then deleted. |
| `derivedDefaultSourceBlockId()` | `control:${blockId}:${portId}:source` | Pseudo block ids stop being identity. |
| `derivedLensParamKey(portId, lensId, paramId)` | `control:${blockId}:${portId}:lens:${legacyLensId}:param:${paramId}` | Fast-path keys follow authored node identity. |
| `PatchStore.updateBlockParams()` for exposed inputs | new authored-control mutation APIs on PatchStore | `updateBlockParams()` becomes config-only. |
| `PatchStore.updateInputPort(... defaultSource ...)` | `PatchStore.updateInputControlSource(...)` | No silent mirroring back to params. |
| `PatchStore.addLens/removeLens/updateLensParams` | same operations against `inputPort.authoredControl.lenses` | API names may stay; ownership path changes. |
| `materializeInputDefaultSource()/dematerializeInputDefaultSource()` | projection helpers over `authoredControl.source` | They no longer move ownership between two models. |
| Patch JSON `inputPorts[].defaultSource` | Patch JSON `inputPorts[].authoredControl.source` | Storage key/version bump required. |
| Patch JSON `inputPorts[].lenses` | Patch JSON `inputPorts[].authoredControl.lenses` | Preserve ids and order. |
| HCL `port.defaultSource = ...` | HCL nested authored source structure | DSL must serialize the canonical structure directly. |
| HCL top-level `lens "..." { port=..., sourceAddress=... }` | HCL nested lens list inside the owning `port` block | Lens ownership becomes explicit in syntax too. |
| `PatchStoreAdapter` fallback to registry `defaultSource` | adapter reads `inputPort.authoredControl` only | Registry defaults are creation seeds, not runtime instance state. |
| `nodeDataTransform()` control reconstruction from params/defaults | direct projection from `inputPort.authoredControl` | No heuristic merge of params + defaults. |
| `FrontendResultStore` synthesized `DefaultSource` from normalized default wire | provenance derived from authored source node identity | The compiler stops inventing a parallel default-source descriptor. |
| `CompositeEditorStore` copying `exposed.defaultSource` | exposed-input publication references the canonical authored owner | No duplicated composite control state. |

## Mutation Boundary Contract

PatchStore is the sole mutable owner of authored-control state.

Required steady-state PatchStore API split:

- `updateBlockParams(blockId, params)` only accepts config-only keys
- `setInputControlSource(blockId, portId, source | null)`
- `updateInputControlSourceParams(blockId, portId, params)`
- `addInputControlLens(blockId, portId, lens)`
- `removeInputControlLens(blockId, portId, lensId)`
- `updateInputControlLensParams(blockId, portId, lensId, params)`
- `reorderInputControlLenses(blockId, portId, nextOrder)`

Mutation invariants:

- authored control edits never mirror back into `block.params`
- authored control edits never write `inputPort.defaultSource` or `inputPort.lenses`
- block creation/import is the only place allowed to synthesize authored control from block-definition seeds or legacy data

// [LAW:single-enforcer] Cross-cutting migration and validation happen at PatchStore, not duplicated across UI/compiler callsites.

## Persistence Contract

Patch JSON and HCL must persist the canonical authored-control structure 1:1.

Required JSON shape:

```ts
inputPorts: Array<{
  id: string;
  combineMode: string;
  authoredControl?: {
    ownerId: string;
    source: { id: 'source'; blockType: string; outputPortId: string; params: Record<string, unknown> } | null;
    lenses: Array<{
      id: `lens:${string}`;
      blockType: string;
      outputPortId: string;
      params: Record<string, unknown>;
      target: { kind: 'authored-source' } | { kind: 'incoming-edge'; sourceAddress: string };
    }>;
  };
}>
```

Required HCL semantics:

- block inline attributes contain config-only params only
- each owning input port serializes one canonical authored-control block
- authored source and authored lenses are nested under the owning `port` block so ownership is visible in syntax

Concrete HCL shape:

```hcl
block "Rotate2D" "spin" {
  port "angle" {
    source "Const" {
      output = "out"
      value = 0.125
    }

    lens "Clamp" {
      id = "lens:clamp_ab12"
      target = "authored-source"
    }

    lens "StepQuantize" {
      id = "lens:step_cd34"
      target = "incoming-edge"
      sourceAddress = "v1:blocks.clock.outputs.phaseA"
      steps = 16
    }
  }
}
```

Required parser/serializer rules:

- `source "<BlockType>" {}` maps 1:1 to `authoredControl.source`
- `lens "<BlockType>" { id, target, sourceAddress?, ...params }` maps 1:1 to `authoredControl.lenses[*]`
- legacy `defaultSource = ...` and top-level `lens { port = ... }` syntax is import-only during the migration window and is not emitted after cutover

No serializer or parser may reconstruct authored control by guessing from `block.params`, `defaultSource`, and `lenses` after the cutover.

## Compiler Contract

Compiler/frontend normalization consumes authored control directly.

Required behavior:

- default-source planning reads `inputPort.authoredControl.source`, not `inputPort.defaultSource`
- lens expansion reads `inputPort.authoredControl.lenses`, not `inputPort.lenses`
- normalization may still lower authored control to explicit graph blocks/edges, but that lowering is a derived compiler view, not the authored store
- provenance in `FrontendResultStore` must point back to authored control owner/node ids, not synthesize a second default-source identity system

This keeps the authored model explicit while still allowing the compiler to operate on ordinary blocks/edges after expansion.

## Editor Adapter And UI Projection Contract

Editor adapters and node/control projections read authored controls directly.

Steady-state rules:

- control enumeration starts from exposed input ports and their `authoredControl`
- a disconnected exposed input with `authoredControl.source = Const` renders as a compact inline value editor
- a connected input with authored lenses renders those lenses from `authoredControl.lenses`
- no UI code falls back to `block.params[inputId]` for exposed controls
- no UI code falls back to registry `defaultSource` as if it were current instance state

The adapter may still derive display-friendly summaries, but those summaries are derived from canonical authored-control data only.

## Cutover Plan By Issue

### CTRL-AUTH-02

- add `inputPort.authoredControl` to PatchStore data types
- migrate existing exposed-input literal ownership out of `block.params`
- make PatchStore mutation APIs authored-control aware
- keep one import-only upgrader from legacy fields into the new structure

### CTRL-AUTH-03

- replace `inputPort.defaultSource` reads/writes with `authoredControl.source`
- rewrite materialize/dematerialize helpers as projection helpers over the canonical source node
- delete instance-level `defaultSource` steady-state ownership

### CTRL-AUTH-04

- replace `inputPort.lenses` reads/writes with `authoredControl.lenses`
- preserve lens ids and per-port order
- move lens params and fast-path keys onto authored lens node ids

### CTRL-AUTH-05

- cut JSON/HCL persistence to the canonical structure
- cut compiler/frontend normalization to authored control inputs
- cut `PatchStoreAdapter`, `nodeDataTransform`, `FrontendResultStore`, and composite publication to authored control reads only
- delete legacy field readers/writers and any heuristic reconstruction paths

## Deletion Plan

The following must be deleted by the end of the epic, not left dormant:

- instance-level `inputPort.defaultSource`
- instance-level `inputPort.lenses`
- exposed-input mirrors inside `block.params`
- PatchStore synchronization logic between `block.params` and `defaultSource`
- default-source pseudo-block identity helpers as authoritative handles
- UI/editor fallback logic that merges `block.params`, instance defaultSource, and registry defaults to decide what a control is
- persistence/DSL support that treats legacy fields as steady-state authored state

The only allowed temporary legacy code is a narrow one-way import upgrader at the PatchStore/persistence boundary. That upgrader is removed once all persisted data and tests are migrated in `CTRL-AUTH-05`.

// [LAW:no-mode-explosion] The migration allows one narrow import upgrader only; it does not create a permanent dual-mode runtime.

## Invariants

1. One exposed input port has at most one authored source node.
2. One exposed input port owns exactly one ordered lens list.
3. `block.params` never stores exposed-input control values in steady state.
4. Compiler, persistence, editor adapter, and UI all read the same authored-control structure.
5. Control publication surfaces only exposed ports across composite boundaries.
6. Lens ids survive migration unchanged.
7. Control owner/node ids are deterministic functions of block id, port id, and preserved lens id.
8. Materialized graph blocks/edges derived from authored controls are projections, not ownership transfers.

## Non-Goals

- preserving the old HCL surface syntax if it obscures canonical ownership
- keeping `defaultSource` or `lenses` as convenience mirrors
- supporting both legacy and canonical authored-control models in normal runtime behavior
- publishing internal composite controls that are not exposed at the boundary

## Verification Checklist

This contract is complete only if all of the following remain true:

- one authoritative authored-control structure is named in this document
- the document explicitly forbids steady-state parallel ownership in `block.params`, `defaultSource`, and `lenses`
- the migration matrix covers PatchStore, persistence, compiler, editor adapter, UI projection, and composites
- stable ids/addresses and deletion steps are explicit enough to implement the follow-on issues without guessing
