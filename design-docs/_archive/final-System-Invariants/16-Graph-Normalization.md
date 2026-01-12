# Graph Normalization: System Invariants

**Status**: Final System Invariant

---

## Core Principle

The compiler consumes a **NormalizedGraph**, not the raw UI graph.

The compiler should never see:
- "bus UI"
- "wire sidecar state"
- "default-source badge"

It should only see:
- Ordinary blocks
- Ordinary edges
- Roles (for debug labeling only)

---

## The Two Graphs

### 1. RawGraph (UI Graph)

What the user edits: blocks, edges, plus role metadata.

This graph may contain "attached" concepts that are not represented as explicit nodes yet:
- Default source attachments (badges on ports)
- Wire-state indicators (slew/delay markers)
- Bus tap UI affordances

**RawGraph is the authoritative, undoable user intent.**

### 2. NormalizedGraph (Compiler Graph)

A fully explicit graph where:
- Every default-source is an actual `BlockInstance` + `Edge`
- Every bus tap/publish is an actual block + edges
- Every wire-state sidecar is an actual state block + edges
- No implicit attachments remain

**NormalizedGraph is what you compile.**

---

## Invariant 1: Normalization is a Pure, Deterministic Rewrite

```typescript
normalized = normalize(raw, previousNormalized?)
```

**Key properties:**

1. **Id-stable**: Structural nodes/wires get stable IDs derived from anchors (not from creation order)
2. **Deterministic**: Same raw input → same normalized output
3. **Incremental**: Can reuse previous normalized mapping to avoid churn, but correctness must not depend on it

---

## Invariant 2: Structural IDs Derive from Anchors

Structural things must be keyed by what they attach to.

### Anchor Examples

| Structural Type | Anchor Format |
|-----------------|---------------|
| Default source | `defaultSource:<blockId>:<portName>:<in\|out>` |
| Wire-state | `wireState:<wireId>` |
| Bus junction | `bus:<busId>:<pub\|sub>:<typeKey>` |

### ID Generation

```typescript
structNodeId = hash("structNode", anchor)
structEdgeId = hash("structEdge", anchor, localEdgeName)
```

**Why anchors matter:** Structural objects stop thrashing when the user rearranges things. Moving a block doesn't regenerate all its default-source IDs.

---

## Invariant 3: Single Writer for Structural Artifacts

**Hard rule:**
- User actions can create/remove/edit user blocks/edges
- Structural artifacts are derived, not directly edited (even if visible in UI)

**Store flow:**
```
user edits → mutate RawGraph → run normalization → produce NormalizedGraph → compile
```

This eliminates:
- Compiler inserting anything "helpful"
- Runtime repairing missing structural pieces
- Multiple "writers" of structural artifacts (guaranteed drift)

---

## Invariant 4: Structural Artifacts Have Strong Validation

A validator runs after normalization:

1. Every structural node has a valid anchor target
2. Every default-source edge points to the correct port
3. No cycles unless mediated by allowed memory blocks
4. Role kinds are consistent (no `wireState` node not connected to its wire)

**If validation fails: the editor throws, not the compiler.**

---

## Invariant 5: History Operates on User Intent

Undo/redo operates on RawGraph user intent, not on expanded normalized artifacts.

For debugging and selection, maintain a bidirectional mapping:
- `structuralId` → `anchor`
- `anchor` → `structuralId(s)`

So UI can click a badge and select the structural node that represents it.

---

## Architecture

### Module Structure

Create one module that owns all structural behavior:

```
src/editor/graph/
├── RawGraphStore.ts       # Authoritative, undoable user intent
├── GraphNormalizer.ts     # Pure function: RawGraph → NormalizedGraph + Mapping
├── StructuralManager.ts   # Policy engine: decides what structural objects must exist
└── StructuralMapping.ts   # Anchor ↔ IDs, for UI selection + incremental stability
```

### Type Shapes (Minimal)

```typescript
// What the user edits
interface RawGraph {
  blocks: RawBlock[];           // User blocks only
  edges: RawEdge[];             // User edges only
  attachments: Attachment[];    // Default sources, wire-state markers, etc.
}

// What the compiler sees
interface NormalizedGraph {
  blocks: BlockInstance[];      // User + structural blocks
  edges: Edge[];                // User + structural edges
  // No attachments - everything is explicit
}

// Anchor types
type Anchor =
  | { kind: "defaultSource"; blockId: BlockId; port: PortRef; direction: "in" | "out" }
  | { kind: "wireState"; wireId: WireId }
  | { kind: "busJunction"; busId: BusId; role: "pub" | "sub"; typeKey: string };

// Bidirectional mapping for UI
interface StructuralMapping {
  anchorToIds: Map<string, { nodeId?: BlockId; edgeIds: EdgeId[] }>;
  idToAnchor: Map<BlockId | EdgeId, Anchor>;
}
```

### Normalization Passes (Strict Order)

1. **Default sources** → Create structural blocks + edges for unconnected inputs
2. **Bus junctions** → Create explicit junction blocks for bus connections
3. **Wire-state** → Create infrastructure blocks for slew/delay on wires
4. **Final validation** → Type-check, cycle-check, role consistency

---

## What This Enables

1. **Compiler simplicity**: Compiler sees only blocks + edges, no special cases
2. **Deterministic compilation**: Same user intent → same IR
3. **Stable undo/redo**: History is user intent, derived state regenerates
4. **UI flexibility**: Can show/hide structural artifacts per user preference
5. **Validation at the right layer**: Editor catches structural errors before compilation

---

## What This Prevents

1. **Compiler inserting "helpful" blocks** - Compiler is pure transform of NormalizedGraph
2. **Runtime repair** - No missing structural pieces to fix at runtime
3. **Writer conflicts** - Single source of truth for structural artifacts
4. **ID thrashing** - Anchor-based IDs are stable across edits

---

## Relationship to Other Invariants

### Block & Edge Roles (§15)
Normalized graph contains both user and structural blocks/edges, all with explicit roles.
Roles are preserved through normalization for debug visibility.

### Default Sources (§13)
Default sources are one type of structural artifact created during normalization.
The normalization pass implements the invariant: "every input has exactly one source."

### Unified Transforms (§Unified-Transforms-Architecture)
Graph surgery (inserting infrastructure blocks for stateful transforms) is part of normalization.
The editor performs surgery; the compiler sees the result.

---

## Summary

The editor maintains two graph representations:
- **RawGraph**: User intent, undoable, may have implicit attachments
- **NormalizedGraph**: Fully explicit, compiled, structural artifacts materialized

Normalization is pure, deterministic, and anchor-stable. The compiler never sees UI concepts. Structural artifacts are derived, not edited. Validation happens in the editor, not the compiler.
