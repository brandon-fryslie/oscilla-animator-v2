# Context: Adapter System Improvement

**Topic**: adapter-system-improvement
**Date**: 2026-01-27

## Problem Statement

The current adapter system inserts adapters at the edge level during normalization, but lacks:

1. **Proper resource addressing**: Adapters should be addressable as `my_block.inputs.count.adapters.<name>`, not as standalone blocks
2. **Per-port-per-connection support**: A single port can have multiple incoming connections, each needing its own adapter
3. **UI visualization**: Adapters should appear on wires near the target port
4. **Auto-insertion UX**: Editor should auto-insert adapters when creating type-mismatched connections

## User Requirements

From the user's specification:

> - Adapters allow us to adapt outputs to an appropriate input
> - Adapters can convert between units and do simple transformations on the data (ie converting Deg -> Radians by running the appropriate formula, convert float to phase01 by normalizing to 0..1 and wrapping the values, convert phase01 to float by changing type)
> - Adapters are normalized to blocks within the graph normalization process. 1 adapter == 1 block
> - Adapters are visualized in the patch editor as being on the connection (wire) near the port they are attached to
> - Adapters are per-port-per-connection. A single port can have separate adapters for each connection.
> - Adapters have a valid resource address within the resource addressing system (my_block.inputs.count.adapters.<name> where <name> is auto-generated block name: MUST USE CANONICAL BLOCK NAMING HELPERS)
> - Adapters are inserted automatically by the editor as needed to convert inputs and outputs between types

## Current Implementation

### Adapter Registry (`src/graph/adapters.ts`)

Defines adapter rules for type conversion:
- Phase ↔ Scalar: `PhaseToScalar01`, `ScalarToPhase01`
- Phase ↔ Radians: `PhaseToRadians`, `RadiansToPhase01`
- Degrees ↔ Radians: `DegreesToRadians`, `RadiansToDegrees`
- Time: `MsToSeconds`, `SecondsToMs`
- Normalization: `ScalarToNorm01Clamp`, `Norm01ToScalar`
- Cardinality: Broadcast (signal → field)

### Adapter Blocks (`src/blocks/adapter-blocks.ts`)

Pre-registered primitive blocks implementing each adapter. Pure conversion semantics, cardinality-preserving.

### Normalization Pass 2 (`src/graph/passes/pass2-adapters.ts`)

Current adapter insertion logic:
1. Iterates all edges
2. Looks up source/target port types from registry
3. If types mismatch, calls `findAdapter(from, to)`
4. Creates adapter block with ID `_adapter_{edgeId}`
5. Replaces original edge with two edges through adapter

**Current addressing**: `v1:blocks._adapter_e0.outputs.out` (standalone block)

### Canonical Addressing (`src/types/canonical-address.ts`)

Current address types:
- `BlockAddress`: `v1:blocks.my_circle`
- `OutputAddress`: `v1:blocks.my_circle.outputs.radius`
- `InputAddress`: `v1:blocks.my_circle.inputs.x`
- `ParamAddress`: `v1:blocks.my_circle.params.size`

**Missing**: `AdapterAddress` for `v1:blocks.my_circle.inputs.x.adapters.adapter_0`

## Design Decision: Adapters as Port Metadata

**Choice**: Store adapters on `InputPort` as metadata, expand to blocks during normalization.

**Rationale**:
1. Required addressing format implies ownership by port
2. Cleaner model for UI (adapter "attached to" port)
3. Allows per-connection adapters on same port

**Trade-off**: Two representations (metadata vs block) must stay in sync during normalization.

## Key Files

| File | Purpose |
|------|---------|
| `src/types/index.ts` | Type definitions (will add `AdapterAttachment`) |
| `src/types/canonical-address.ts` | Addressing system (will add `AdapterAddress`) |
| `src/graph/Patch.ts` | Graph model (will extend `InputPort`) |
| `src/graph/adapters.ts` | Adapter rule registry (no changes needed) |
| `src/graph/passes/pass2-adapters.ts` | Normalization pass (refactor to read port adapters) |
| `src/core/canonical-name.ts` | Name helpers (will add adapter ID generation) |
| `src/ui/reactFlowEditor/sync.ts` | Editor connection handling (will auto-insert) |
| `src/stores/PatchStore.ts` | State management (will add adapter CRUD) |

## Constraints

1. **Backwards Compatibility**: Existing patches without explicit adapters must still work
2. **Determinism**: Same input → same adapter IDs/blocks
3. **Single Enforcer**: Adapter insertion happens only in normalization (not runtime)
4. **One-Way Dependencies**: UI → Store → Graph (no back-edges)

## Related Work

- Varargs support (Sprint 2026-01-26): Similar pattern of port-attached metadata
- Canonical addressing (already implemented): Foundation for adapter addresses
- Default sources (Pass 1): Similar normalization pattern

## Success Metrics

1. Adapters addressable via `my_block.inputs.count.adapters.<name>`
2. Visual indicators on wires near target port
3. Auto-insertion on type-mismatched connections
4. All existing tests pass
5. No performance regression
