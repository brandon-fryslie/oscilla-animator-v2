# Block & Edge Roles: System Invariants

**Status**: Final System Invariant

---

## The Core Distinction

The system has two kinds of entities:

1. **User entities** - Created by explicit user action, persisted as authored
2. **Derived entities** - Created by the system to satisfy architectural invariants

Both kinds exist in the patch data. Both are compiled. Both are real.

The difference is **intent and lifecycle**, not visibility or reality.

---

## Invariant 1: Every Entity Has a Role

Every block and every edge carries an explicit role declaration.

```typescript
// Every block
interface BlockInstance {
  id: BlockId
  blockType: BlockTypeId
  role: BlockRole          // Required, not optional
  inputs: PortBinding[]
  outputs: PortBinding[]
}

// Every edge
interface Edge {
  id: WireId
  from: PortRef
  to: PortRef
  role: EdgeRole           // Required, not optional
}
```

**Why this matters:**
- No guessing "is this system-generated?"
- No scattered `if hidden then...` logic
- Role is derived, not presentational

---

## Invariant 2: Roles are Discriminated Unions

Roles carry metadata about their purpose. No stringly-typed guessing.

**These are the minimal types. They can be expanded as necessary.**

### BlockRole

```typescript
type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };

type DerivedBlockMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState";     target: { kind: "wire"; wire: WireId } }
  | { kind: "globalBus";     target: { kind: "bus"; busId: BusId } }
  | { kind: "lens";          target: { kind: "node"; node: NodeRef; port?: string } };
```

### EdgeRole

```typescript
type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "busTap";  meta: { busId: BusId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };
```

### Design Rules

- Make it a **closed union** (no free-form keys, no `Record<string, unknown>` for meta)
- One discriminator name everywhere: **`kind`**
- Don't reuse `kind` values across layers ambiguously (use `"derived"` at top level and `"defaultSource"` | `"wireState"` | ... inside)

---

## Invariant 3: No Compiler-Inserted Invisible Blocks

**What is rejected:** Invisible blocks that are inserted by the compiler and do not exist in the editor's patch data.

**What is NOT rejected:** Derived blocks that:
- ✅ Exist in `patch.blocks`
- ✅ Are visible in the patch data model
- ✅ Are compiled through normal passes
- ✅ Appear in the IR
- ✅ Have explicit, inspectable role metadata

Derived blocks are real blocks. They are created by the editor (not the compiler) to satisfy invariants. The UI may choose to filter them from certain views—that's a presentation choice, not an architectural one.

The compiler never spontaneously generates blocks. All blocks in the IR are direct representations of blocks in the patch.

---

## Invariant 4: The Compiler Ignores Roles

Roles exist for the **editor**, not the compiler.

The compiler sees:
```
(blocks, edges)
```

It does not see:
```
(user blocks, derived blocks, user edges, default edges)
```

Roles inform:
- UI rendering decisions
- Undo/redo behavior
- Persistence strategies
- Validation messages

Roles do NOT inform:
- Scheduling order
- Type checking
- IR generation
- Runtime execution

**The key rule:**
- Blocks express "entities"
- Edges express "relationships"
- Roles on both exist to make the editor's behavior deterministic and maintainable
- The compiler consumes only the erased graph: `(blocks, edges)`

---

## Invariant 5: Role Invariants Are Validatable

The system can validate role consistency. Add a single `validateGraph()` that asserts all role invariants:

1. **Default edges must reference a derived defaultSource block**
2. **WireState blocks must target an existing edge**
3. **GlobalBus blocks must have valid busId**
4. **Lens derived blocks must target valid node**

Violations are compile-time diagnostics, not runtime errors.

---

## Invariant 6: User Entities Are Canonical

For undo/redo, persistence, and diffing:

- User entities are the "source of truth"
- Derived entities can be regenerated from invariants
- Serialization may elide derived entities (they're derived)

This means: deleting a user edge may trigger creation of a default edge. That's not "adding" something—it's restoring the invariant that every input has exactly one source.

---

## Edge Role Semantics

What does an edge role mean?

- **user**: Persisted exactly as authored
- **default**: This edge is suppressed when the port has any real inbound connection (or when a higher-priority writer exists)
- **busTap**: Editor can render it differently and can enforce constraints (e.g., bus id consistency), but compiler still sees it as a normal edge
- **auto**: Editor is allowed to delete/regenerate it as part of keeping derived intent satisfied

Notice: **none of these change compilation**. They change editor invariants and maintenance, which is exactly where you want the complexity.

---

## Relationship to Other Invariants

### Default Sources (§13)
Default Sources are derived blocks with `{ kind: "derived", meta: { kind: "defaultSource", target: { kind: "port", port } } }`.
They satisfy the invariant: **every input always has exactly one source**.

### Unified Transforms (§Unified-Transforms-Architecture)
Graph surgery creates infrastructure blocks. These are derived blocks.
The editor performs the surgery; the compiler sees normal blocks.

### Core Law §9
"Uniform transform semantics" - roles don't change how transforms work.
A derived block compiles the same as a user block of the same type.

---

## Terminology

| Term | Meaning |
|------|---------|
| **User block** | `role.kind === "user"` - explicitly created by user action |
| **Derived block** | `role.kind === "derived"` - created by editor to satisfy invariants |
| **Default edge** | `role.kind === "default"` - connects a defaultSource to its target |
| **Bus tap edge** | `role.kind === "busTap"` - created via bus connection UI |
| **Auto edge** | `role.kind === "auto"` - editor-managed for derived integrity |

**Deprecated terms:**
- ~~Hidden block~~ → Use "derived block" (hidden implies invisible to compiler, which is wrong)
- ~~Phantom block~~ → Use "derived block"
- ~~Implicit block~~ → Use "derived block with specific meta.kind"

---

## Implementation Notes

### Making role required (migration)

1. Add `role: BlockRole` as required field
2. Existing blocks without role get `{ kind: "user" }` default
3. System-generated blocks get appropriate derived role
4. Remove `hidden?: boolean` field (derive from role if needed for UI)

### UI filtering

```typescript
// To get "user-visible" blocks:
const userBlocks = patch.blocks.filter(b => b.role.kind === "user");

// Or with UI preference:
const visibleBlocks = patch.blocks.filter(b =>
  b.role.kind === "user" || settings.showDerivedBlocks
);
```

### Validation

```typescript
function validateRoleInvariants(patch: Patch): Diagnostic[] {
  const errors: Diagnostic[] = [];

  // Default edges must reference derived defaultSource blocks
  for (const edge of patch.edges) {
    if (edge.role.kind === "default") {
      const sourceBlock = patch.blocks.find(b => b.id === edge.role.meta.defaultSourceBlockId);
      if (!sourceBlock || sourceBlock.role.kind !== "derived") {
        errors.push({ message: "Default edge must reference derived block" });
      }
    }
  }

  // WireState blocks must target existing edges
  for (const block of patch.blocks) {
    if (block.role.kind === "derived" && block.role.meta.kind === "wireState") {
      const targetWire = patch.edges.find(e => e.id === block.role.meta.target.wire);
      if (!targetWire) {
        errors.push({ message: "WireState block must target existing edge" });
      }
    }
  }

  return errors;
}
```

---

## Summary

Blocks and edges have roles. Roles are explicit, discriminated, and carry metadata. The compiler ignores them. The editor uses them for behavior, UI, and validation.

**Derived blocks are real blocks that exist in the patch data for architectural reasons.**
They are created by the editor, not the compiler. They are not "invisible"—they are simply not user-authored.
