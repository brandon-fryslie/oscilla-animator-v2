# Adapter System Improvement Plan

**Date**: 2026-01-27
**Topic**: adapter-system-improvement
**Status**: PLANNING

## Overview

Improve the adapter system to support:
1. Per-port-per-connection adapters (not just per-edge)
2. Proper resource addressing for adapters (`my_block.inputs.count.adapters.<name>`)
3. Visual representation on connection wires near the attached port
4. Automatic insertion by the editor based on type mismatches

## Current State Analysis

### What Exists Today

**Adapter Registry** (`src/graph/adapters.ts`):
- 10+ adapter rules for unit conversion (Deg→Radians, Phase→Scalar, etc.)
- Broadcast adapter for cardinality promotion (signal→field)
- `findAdapter(from, to)` function for rule lookup
- Type signature matching system

**Adapter Blocks** (`src/blocks/adapter-blocks.ts`):
- Pre-registered adapter block types (Adapter_PhaseToRadians, etc.)
- Each is a full primitive block with lowering logic

**Adapter Insertion** (`src/graph/passes/pass2-adapters.ts`):
- Runs during graph normalization (Pass 2)
- Inserts adapter blocks between mismatched connections
- Generates deterministic IDs: `_adapter_{edgeId}`
- Replaces original edge with two edges through adapter

**Current Addressing**:
- Adapters get addresses like `v1:blocks._adapter_e0.outputs.out`
- NOT attached to the input port they adapt

### What's Missing

1. **Per-Port-Per-Connection Model**: Current system creates one adapter per edge. Need to support:
   - Multiple adapters on same port for different connections
   - Adapters attached to specific (port, connection) pairs

2. **Resource Addressing**: Adapters should be addressable as:
   - `v1:blocks.my_block.inputs.count.adapters.adapter_0`
   - NOT as standalone blocks

3. **UI Visualization**: No current support for:
   - Rendering adapter indicators on wires
   - Positioning adapters near their target port

4. **Editor Auto-Insertion**: Type validation exists but doesn't auto-insert adapters

## Architecture Design

### Option A: Adapters as Port Metadata (Recommended)

Store adapters directly on `InputPort` as metadata, normalized to blocks for compilation.

**Pros**:
- Clear ownership (adapter belongs to port)
- Clean addressing (`blocks.X.inputs.Y.adapters.Z`)
- Simple UI model (adapter attached to port)

**Cons**:
- Two representations (metadata + block) must stay in sync
- Normalization must expand port adapters to blocks

### Option B: Edge-Attached Adapters

Store adapter info on edges, with deterministic naming.

**Pros**:
- Closer to current implementation
- Single representation

**Cons**:
- Addressing is awkward (adapters aren't really on edges)
- Multiple connections to same port create naming conflicts

### Decision: Option A (Port Metadata)

The addressing requirement (`my_block.inputs.count.adapters.<name>`) strongly implies adapters belong to ports, not edges.

## Data Model Changes

### 1. New Types

```typescript
// src/types/index.ts

/**
 * Adapter attachment on an input port.
 * Describes a type conversion applied to a specific incoming connection.
 */
interface AdapterAttachment {
  /** Unique ID within this port's adapters */
  readonly id: string;

  /** The adapter block type (e.g., 'Adapter_DegreesToRadians') */
  readonly adapterType: string;

  /**
   * Which incoming connection this adapter applies to.
   * References the source output address (canonical address string).
   */
  readonly sourceAddress: string;

  /** Sort key for deterministic ordering */
  readonly sortKey: number;
}
```

### 2. InputPort Extension

```typescript
// src/graph/Patch.ts - Extend InputPort

interface InputPort {
  readonly id: string;
  readonly defaultSource?: DefaultSource;
  readonly combineMode: CombineMode;
  readonly varargConnections?: readonly VarargConnection[];

  /** NEW: Adapters attached to incoming connections */
  readonly adapters?: readonly AdapterAttachment[];
}
```

### 3. Canonical Address Extension

```typescript
// src/types/canonical-address.ts - Add adapter address variant

/**
 * Address to an adapter on an input port.
 * Format: `v1:blocks.{canonical_name}.inputs.{port_id}.adapters.{adapter_id}`
 */
interface AdapterAddress {
  readonly kind: 'adapter';
  readonly blockId: BlockId;
  readonly canonicalName: string;
  readonly portId: PortId;
  readonly adapterId: string;
}

// Update CanonicalAddress union
type CanonicalAddress =
  | BlockAddress
  | OutputAddress
  | InputAddress
  | ParamAddress
  | AdapterAddress;  // NEW
```

## Implementation Plan

### Sprint 1: Data Model & Addressing (Foundation)

**Goal**: Establish the new adapter attachment model and addressing system.

#### 1.1 Type Definitions
- [ ] Add `AdapterAttachment` interface to `src/types/index.ts`
- [ ] Extend `InputPort` with optional `adapters` field
- [ ] Add `AdapterAddress` to canonical address system
- [ ] Update `addressToString()` and `parseAddress()` for adapter addresses

#### 1.2 Adapter ID Generation
- [ ] Create helper in `src/core/canonical-name.ts`:
  ```typescript
  function generateAdapterId(portId: string, sourceAddress: string, index: number): string
  ```
- [ ] Ensure IDs are deterministic and follow naming conventions

#### 1.3 Tests
- [ ] Unit tests for adapter addressing
- [ ] Test ID generation determinism
- [ ] Test address parsing round-trip

### Sprint 2: Normalization Pass Updates

**Goal**: Update Pass 2 to read adapters from ports and expand them to blocks.

#### 2.1 Pass 2 Refactor
- [ ] Read `adapters` from `InputPort` instead of inferring from type mismatch
- [ ] Generate adapter blocks from port attachments
- [ ] Maintain backwards compatibility: if no explicit adapters, infer from types
- [ ] Use canonical block naming for generated adapters

#### 2.2 Block Naming
- [ ] Adapter block displayName: `{blockDisplayName}.{portId}.adapters.{adapterId}`
- [ ] Adapter block ID: deterministic from port + source address
- [ ] Ensure canonical name follows resource addressing spec

#### 2.3 Tests
- [ ] Test explicit adapter expansion
- [ ] Test automatic adapter inference (backwards compat)
- [ ] Test multiple adapters on same port
- [ ] Test adapter addressing after normalization

### Sprint 3: Editor Integration

**Goal**: Auto-insert adapters when creating connections with type mismatches.

#### 3.1 Connection Handler Update
- [ ] Update `createConnectHandler` in `src/ui/reactFlowEditor/sync.ts`
- [ ] On connection creation:
  1. Check type compatibility via `validateConnection`
  2. If incompatible but adapter exists, create `AdapterAttachment`
  3. Store adapter on target `InputPort`
  4. Update patch through store

#### 3.2 PatchStore Methods
- [ ] Add `addAdapter(blockId, portId, sourceAddress, adapterType): void`
- [ ] Add `removeAdapter(blockId, portId, adapterId): void`
- [ ] Add `getAdaptersForPort(blockId, portId): AdapterAttachment[]`

#### 3.3 Type Validation Extension
- [ ] Extend `validateConnection` to return suggested adapter
- [ ] Return type: `{ valid: boolean; suggestedAdapter?: AdapterSpec }`

### Sprint 4: UI Visualization

**Goal**: Show adapters on connection wires near the target port.

#### 4.1 Edge Rendering Extension
- [ ] Create `AdapterIndicator` component
- [ ] Position near target port handle
- [ ] Show adapter type as tooltip/label

#### 4.2 Edge Data Extension
- [ ] Add `adapters` field to ReactFlow edge data
- [ ] Populate from `InputPort.adapters` during sync

#### 4.3 Custom Edge Component
- [ ] Create `OscillaEdge` component with adapter indicator
- [ ] Register as custom edge type
- [ ] Handle click on adapter indicator (context menu?)

#### 4.4 Visual Design
- [ ] Adapter indicator: small icon/dot on wire
- [ ] Color coding by adapter category (unit, cardinality)
- [ ] Hover state shows adapter details

### Sprint 5: Context Menu & Editing

**Goal**: Allow users to add/remove/change adapters via UI.

#### 5.1 Edge Context Menu
- [ ] Add "Insert Adapter" submenu (if compatible adapters exist)
- [ ] Add "Remove Adapter" option (if adapter present)
- [ ] Add "Change Adapter" option (cycle through compatible)

#### 5.2 Adapter Selection Dialog
- [ ] Show compatible adapters for type pair
- [ ] Preview conversion (from → to)
- [ ] Allow explicit adapter choice vs auto

#### 5.3 Keyboard Shortcuts
- [ ] Double-click adapter indicator to edit
- [ ] Delete key on selected adapter to remove

## File Changes Summary

### New Files
- None (all changes extend existing files)

### Modified Files

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `AdapterAttachment` interface |
| `src/types/canonical-address.ts` | Add `AdapterAddress` type and parsing |
| `src/graph/Patch.ts` | Extend `InputPort` with `adapters` field |
| `src/graph/passes/pass2-adapters.ts` | Refactor to read port adapters |
| `src/core/canonical-name.ts` | Add adapter ID generation helper |
| `src/ui/reactFlowEditor/sync.ts` | Auto-insert adapters on connect |
| `src/ui/reactFlowEditor/typeValidation.ts` | Return suggested adapter |
| `src/ui/reactFlowEditor/menus/EdgeContextMenu.tsx` | Add adapter operations |
| `src/stores/PatchStore.ts` | Add adapter CRUD methods |

### Test Files
- `src/types/__tests__/canonical-address.test.ts`
- `src/graph/passes/__tests__/pass2-adapters.test.ts` (extend)
- `src/ui/reactFlowEditor/__tests__/adapter-ui.test.ts` (new)

## Invariants

1. **One Adapter Per (Port, Source) Pair**: A port cannot have multiple adapters for the same source connection.

2. **Deterministic Expansion**: Port adapters MUST expand to the same blocks given the same input patch.

3. **Address Stability**: Adapter addresses are stable across recompilation if the port and source don't change.

4. **Backwards Compatibility**: Patches without explicit `adapters` arrays continue to work via type inference.

5. **UI Consistency**: Adapter indicators MUST reflect the actual adapters in the normalized patch.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration of existing patches | Medium | Medium | Auto-migrate on load; adapters array is optional |
| Performance with many adapters | Low | Low | Adapters are rare; lazy UI rendering |
| Confusion with block-level adapters | Medium | Medium | Clear visual distinction; documentation |

## Success Criteria

1. ✅ Adapters addressable via `my_block.inputs.count.adapters.<name>`
2. ✅ Adapter indicators visible on connection wires
3. ✅ Auto-insertion on type-mismatched connections
4. ✅ Manual add/remove via context menu
5. ✅ All existing tests pass
6. ✅ New integration tests for adapter UI flow

## Open Questions

1. **Adapter Chaining**: Should we support multiple adapters in sequence on a single connection?
   - Current proposal: No, single adapter per (port, source) pair
   - Future: Could allow chains if needed

2. **Adapter Persistence**: Do adapters persist in saved patches, or are they re-inferred on load?
   - Proposal: Persist explicit adapters; inferred ones are transient
   - This allows user override of auto-insertion

3. **Cardinality Adapters**: Should Broadcast be handled differently since it's not a unit conversion?
   - Current: Treat uniformly
   - Consider: Separate visual treatment?
