# Plan: Default Sources as Structural Blocks

**Status**: Updated to align with §15 (Block & Edge Roles) and §16 (Graph Normalization)

---

## Overview

Default Sources implement the invariant: **every input always has exactly one source**.

Default Sources are **structural blocks** with role `{ kind: 'structural', meta: { kind: 'defaultSource', target: { kind: 'port', port } } }`.

They are:
- Created by the **editor** during graph normalization (not by the compiler)
- Real blocks that exist in `patch.blocks` with explicit role metadata
- Visible in the patch data model, compiled through normal passes
- Filtered from certain UI views by presentation logic (not architectural hiding)

The compiler only sees `(blocks, edges)` - it does not distinguish user blocks from structural blocks.

---

## Core Architecture

### Two Graphs (per §16)

| Graph | Purpose | Contents |
|-------|---------|----------|
| **RawGraph** | User intent, undoable | User blocks, user edges, attachments |
| **NormalizedGraph** | What the compiler sees | User + structural blocks/edges, no attachments |

**Flow:**
```
User edits → RawGraph → normalize() → NormalizedGraph → compile()
```

### Normalization (Not Compiler Injection)

Per §16: Normalization is a **pure, deterministic rewrite** that happens in the editor, before compilation.

```typescript
normalized = normalize(raw, previousNormalized?)
```

**Key properties:**
1. **Id-stable**: Structural IDs derived from anchors (not creation order)
2. **Deterministic**: Same raw input → same normalized output
3. **Incremental**: Can reuse previous mapping to avoid churn

### Structural ID Derivation (per §16)

Default source IDs derive from their anchor:

```typescript
// Anchor format
anchor = { kind: 'defaultSource', blockId, port: PortRef, direction: 'in' }

// ID generation
structNodeId = hash('structNode', anchor)   // e.g., "ds:input:blockId:portName"
structEdgeId = hash('structEdge', anchor)   // e.g., "dse:blockId:portName"
```

---

## Data Model

### BlockRole for Default Sources (per §15)

```typescript
type BlockRole =
  | { kind: 'user' }
  | { kind: 'structural'; meta: StructuralMeta };

type StructuralMeta =
  | { kind: 'defaultSource'; target: { kind: 'port'; port: PortRef } }
  | { kind: 'wireState';     target: { kind: 'wire'; wire: WireId } }
  | { kind: 'globalBus';     target: { kind: 'bus'; busId: BusId } }
  | { kind: 'lens';          target: { kind: 'node'; node: NodeRef; port?: string } };
```

### EdgeRole for Default Edges (per §15)

```typescript
type EdgeRole =
  | { kind: 'user' }
  | { kind: 'default'; meta: { defaultSourceBlockId: BlockId } }
  | { kind: 'busTap';  meta: { busId: BusId } }
  | { kind: 'auto';    meta: { reason: 'portMoved' | 'rehydrate' | 'migrate' } };
```

### Default Source Block Instance

```typescript
interface BlockInstance {
  id: BlockId;                   // Derived: "ds:input:blockId:portName"
  blockType: BlockTypeId;        // e.g., 'DSConstSignalFloat'
  role: {
    kind: 'structural';
    meta: {
      kind: 'defaultSource';
      target: { kind: 'port'; port: PortRef };
    };
  };
  inputs: PortBinding[];         // value input from RawGraph attachment
  outputs: PortBinding[];        // single output
}
```

---

## RawGraph Attachments

### Attachment Model

In RawGraph, default source configuration is stored as attachments (not blocks):

```typescript
interface RawGraph {
  blocks: RawBlock[];           // User blocks only
  edges: RawEdge[];             // User edges only
  attachments: Attachment[];    // Default sources, wire-state markers, etc.
}

type Attachment =
  | DefaultSourceAttachment
  | WireStateAttachment
  | BusTapAttachment;

interface DefaultSourceAttachment {
  kind: 'defaultSource';
  target: PortRef;              // Which port this attaches to
  provider: {
    blockType: string;          // e.g., 'DSConstSignalFloat'
    config: Record<string, unknown>;  // Editable values
  };
}
```

### Why Attachments?

- **User intent is compact**: The user doesn't author structural blocks directly
- **Undo/redo operates on intent**: History tracks attachments, not derived blocks
- **Serialization can elide**: Structural artifacts are derived from attachments
- **Normalization is pure**: Attachment → structural block is deterministic

---

## Normalization Pass: Default Sources

### Location

```
src/editor/graph/
├── GraphNormalizer.ts     # Pure function: RawGraph → NormalizedGraph + Mapping
├── StructuralManager.ts   # Policy: decides what structural objects must exist
└── StructuralMapping.ts   # Anchor ↔ IDs for UI selection + stability
```

### Algorithm

```typescript
function normalizeDefaultSources(
  raw: RawGraph,
  previousMapping?: StructuralMapping
): { blocks: BlockInstance[]; edges: Edge[]; mapping: StructuralMapping } {
  const structuralBlocks: BlockInstance[] = [];
  const structuralEdges: Edge[] = [];
  const mapping = new StructuralMapping();

  for (const block of raw.blocks) {
    for (const input of block.inputs) {
      const hasExplicitSource = hasIncomingEdge(raw.edges, block.id, input.name);

      if (!hasExplicitSource) {
        const attachment = findAttachment(raw.attachments, block.id, input.name);
        const anchor = { kind: 'defaultSource', blockId: block.id, port: { blockId: block.id, portName: input.name }, direction: 'in' };

        // Generate stable IDs from anchor
        const dsBlockId = deriveStructuralId('structNode', anchor);
        const dsEdgeId = deriveStructuralId('structEdge', anchor);

        // Create structural block
        structuralBlocks.push({
          id: dsBlockId,
          blockType: attachment?.provider.blockType ?? defaultConstBlockFor(input.type),
          role: { kind: 'structural', meta: { kind: 'defaultSource', target: { kind: 'port', port: anchor.port } } },
          inputs: [{ name: 'value', value: attachment?.provider.config.value ?? defaultValueFor(input.type) }],
          outputs: [{ name: 'out' }],
        });

        // Create structural edge
        structuralEdges.push({
          id: dsEdgeId,
          from: { blockId: dsBlockId, portName: 'out' },
          to: { blockId: block.id, portName: input.name },
          role: { kind: 'default', meta: { defaultSourceBlockId: dsBlockId } },
        });

        mapping.register(anchor, dsBlockId, [dsEdgeId]);
      }
    }
  }

  return { blocks: structuralBlocks, edges: structuralEdges, mapping };
}
```

### Source Replacement Rule (per §13)

> When an explicit source is connected, the Default Source for that input is disconnected. When it is disconnected, the Default Source is reconnected.

This happens automatically through normalization:
- User adds wire → `hasExplicitSource` is true → no structural block created
- User removes wire → `hasExplicitSource` is false → structural block created

---

## Const Provider Blocks

### Block Family

One const-provider block per slot type:

| Slot Type | Block Type | Purpose |
|-----------|------------|---------|
| `Signal<float>` | `DSConstSignalFloat` | Constant float signal |
| `Signal<int>` | `DSConstSignalInt` | Constant int signal |
| `Signal<color>` | `DSConstSignalColor` | Constant color signal |
| `Signal<vec2>` | `DSConstSignalVec2` | Constant vec2 signal |
| `Field<float>` | `DSConstFieldFloat` | Constant float field |
| `Field<vec2>` | `DSConstFieldVec2` | Constant vec2 field |
| `Field<color>` | `DSConstFieldColor` | Constant color field |

### Block Definition

Each const block is a trivial pass-through:

```typescript
const DSConstSignalFloat: BlockDefinition = {
  id: 'DSConstSignalFloat',
  name: 'Const Signal Float',
  category: 'internal',
  tags: ['structural', 'defaultSource'],  // For UI filtering
  inputs: [
    { name: 'value', type: 'Scalar:float', defaultValue: 0 }
  ],
  outputs: [
    { name: 'out', type: 'Signal<float>' }
  ],
  // Compiler: out = lift(value)
};
```

### UI Filtering

Structural blocks are hidden from the block palette:

```typescript
// BlockLibrary.tsx
const visibleBlocks = allBlocks.filter(b => !b.tags?.includes('structural'));
```

---

## Validation (per §15 Invariant 5)

### Location

`src/editor/semantic/validateRoleInvariants.ts`

### Checks

```typescript
function validateDefaultSourceInvariants(normalized: NormalizedGraph): Diagnostic[] {
  const errors: Diagnostic[] = [];

  // 1. Default edges must reference structural defaultSource blocks
  for (const edge of normalized.edges) {
    if (edge.role.kind === 'default') {
      const sourceBlock = normalized.blocks.find(b => b.id === edge.role.meta.defaultSourceBlockId);
      if (!sourceBlock) {
        errors.push({ message: `Default edge ${edge.id} references missing block` });
      }
      if (sourceBlock?.role.kind !== 'structural' || sourceBlock.role.meta.kind !== 'defaultSource') {
        errors.push({ message: `Default edge ${edge.id} must reference structural defaultSource block` });
      }
    }
  }

  // 2. Every input has AT LEAST one source (can have multiple - wire + bus + default)
  for (const block of normalized.blocks) {
    for (const input of block.inputs) {
      const incomingEdges = normalized.edges.filter(e =>
        e.to.blockId === block.id && e.to.portName === input.name
      );
      if (incomingEdges.length === 0) {
        errors.push({ message: `Input ${block.id}:${input.name} has no source` });
      }
      // NOTE: Multiple sources are valid - they get combined/prioritized
    }
  }

  return errors;
}
```

---

## UI Changes

### Inspector: Default Source Controls

When an input has no explicit source, show the attachment configuration:

```typescript
// Inspector.tsx - DefaultSourceSection
function DefaultSourceSection({ blockId, port }: Props) {
  const attachment = useAttachment(blockId, port.name);

  return (
    <div>
      <Label>Default Source</Label>
      <ProviderDropdown
        value={attachment?.provider.blockType ?? 'DSConstSignalFloat'}
        options={compatibleProviders(port.type)}
        onChange={updateAttachment}
      />
      <ValueControl
        value={attachment?.provider.config.value ?? port.defaultValue}
        onChange={updateAttachmentValue}
      />
    </div>
  );
}
```

### PatchBay: Structural Block Visibility

By default, structural blocks are hidden. Optional toggle to show them:

```typescript
const visibleBlocks = showStructuralBlocks
  ? normalized.blocks
  : normalized.blocks.filter(b => b.role.kind === 'user');
```

---

## Implementation Order

### Phase 1: Types and Infrastructure
1. Add role types to `src/editor/types.ts` (BlockRole, EdgeRole, StructuralMeta)
2. Add RawGraph/NormalizedGraph types
3. Add Attachment types

### Phase 2: Normalization Module
1. Create `src/editor/graph/GraphNormalizer.ts`
2. Create `src/editor/graph/StructuralMapping.ts`
3. Implement `normalizeDefaultSources()`

### Phase 3: Const Provider Blocks
1. Add DSConst* block definitions
2. Add DSConst* block compilers
3. Filter from UI

### Phase 4: Store Integration
1. Add attachments to RawGraphStore
2. Wire normalization into compile pipeline
3. Update persistence (save attachments, not structural blocks)

### Phase 5: UI
1. Update Inspector for attachment editing
2. Update PatchBay for structural block filtering
3. Add debug view for normalized graph

### Phase 6: Validation
1. Implement `validateRoleInvariants()`
2. Integrate into compile pipeline
3. Surface errors in diagnostics

---

## Relationship to Other Work

### Block & Edge Roles (§15)
This plan implements the `defaultSource` variant of structural blocks. The role types defined in §15 are used here.

### Graph Normalization (§16)
Default sources are ONE type of structural artifact created during normalization. Other passes (bus junctions, wire-state) follow the same pattern.

### Unified Transforms (§Unified-Transforms-Architecture)
Graph surgery for stateful transforms is also part of normalization. Same single-writer principle applies.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Default Source** | A structural block that provides a fallback value for an unconnected input |
| **Structural block** | `role.kind === 'structural'` - created by editor for architectural reasons |
| **User block** | `role.kind === 'user'` - explicitly created by user action |
| **Attachment** | RawGraph metadata that configures a structural artifact |
| **Normalization** | Pure transform from RawGraph to NormalizedGraph |

**Deprecated:**
- ~~Hidden block~~ → "structural block"
- ~~Compiler injection~~ → "normalization"
- ~~Provider block~~ → "structural defaultSource block"

---

## Acceptance Criteria

1. Every unconnected input gets a structural defaultSource block during normalization
2. Structural blocks have explicit role metadata with target port reference
3. Default edges have role `{ kind: 'default', meta: { defaultSourceBlockId } }`
4. IDs are anchor-derived and stable across normalizations
5. Validation catches missing sources and role mismatches
6. UI filters structural blocks from palette but allows debug visibility
7. Compiler sees only `(blocks, edges)` - roles are ignored
8. Undo/redo operates on attachments (RawGraph), not structural blocks
