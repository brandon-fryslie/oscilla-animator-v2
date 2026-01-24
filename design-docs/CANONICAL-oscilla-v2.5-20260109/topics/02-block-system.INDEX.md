---
indexed: true
source: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.md
source_hash: 72564b7be9f8
source_mtime: 2026-01-12T00:00:00Z
original_tokens: ~2443
index_tokens: ~1200
compression: 49.1%
index_version: 1.0
tier: T1
---

# Index: Block System (02-block-system.md)

## Key Assertions

1. **Everything is a block or wire at compile time** [L19] — Buses, default sources, and lenses all derive from blocks for uniformity and simplicity.

2. **Blocks are the only compute units; everything else derives from them** [L9] — This eliminates special cases and creates uniform architecture.

3. **Block system has two orthogonal concerns** [L21-23] — Block structure (id, kind, ports) and block role (user-created vs system-derived).

4. **Roles exist for the editor, not the compiler** [L153-169] — Compiler ignores roles; only sees (blocks, edges). Roles inform UI, undo/redo, persistence.

5. **User entities are the source of truth** [L191-196] — For undo/redo, persistence, and diffing. Derived entities regenerate from invariants.

6. **The vast majority of blocks are pure and stateless** [L200-202] — Only 4 MVP stateful primitives: UnitDelay, Lag, Phasor, SampleAndHold.

7. **Both user and derived blocks exist in patch data** [L75-77] — Both are compiled and real. The difference is intent and lifecycle, not visibility.

## Definitions

### Core Types and Structures

- **Block** [L30-36] — Compute unit with id, kind, role, inputs[], outputs[]
  - **kind** property, NOT type (reserved for SignalType) [L41-43]

- **BlockRole** [L63-65] — Discriminated union:
  - `{ kind: "user" }` — Explicit user action, persisted as authored
  - `{ kind: "derived"; meta: DerivedBlockMeta }` — Satisfies architectural invariants, can be regenerated

- **DerivedBlockMeta** [L86-91] — 3 variants specify purpose of derived block:
  - `defaultSource` — Fallback value for unconnected input port
  - `wireState` — State on a wire for feedback cycles
  - `lens` — Type adapter/transform block

- **PortBinding** [L48-53] — Port with id, direction (in|out), type (SignalType), combine (CombineMode)

- **EdgeRole** [L111-115] — 3 variants:
  - `user` — Explicit user connection, persisted
  - `default` — From defaultSource block, suppressed when real connection exists
  - `auto` — Editor maintenance, can be deleted/regenerated

- **CombineMode** [L265-268] — How multiple writers aggregate on an input:
  - `numeric`: sum, avg, min, max, mul
  - `any`: last, first, layer
  - `bool`: or, and

### Stateful Primitives

- **MVP Stateful Primitives (4)** [L204-211]:
  - UnitDelay: `y(t) = x(t-1)` — fundamental feedback gate
  - Lag: linear/exponential smooth toward target
  - Phasor: 0..1 ramp with wrap semantics
  - SampleAndHold: `if trigger(t): y(t) = x(t) else y(t) = y(t-1)` — latch on trigger

- **Post-MVP**: Accumulator: `y(t) = y(t-1) + x(t)`

### Basic Block Library

- **Basic 12 Blocks (MVP)** [L237-254]:
  1. TimeRoot (Time) — system-managed time source
  2. DomainN (Domain) — create N-element domain
  3. Id/U01 (Domain) — element ID normalized to [0,1]
  4. Hash (Math) — deterministic hash
  5. Noise (Math) — procedural noise
  6. Add (Math) — addition
  7. Mul (Math) — multiplication
  8. Length (Math) — vector length
  9. Normalize (Math) — vector normalize
  10. UnitDelay (State) — one-frame delay
  11. HSV->RGB (Color) — color space conversion
  12. RenderInstances2D (Render) — render sink

### Rails (System-Provided Buses)

- **MVP Rails (5)** [L318-326]:
  - `time` — one+continuous+int, tMs value
  - `phaseA` — one+continuous+phase, primary phase
  - `phaseB` — one+continuous+phase, secondary phase
  - `pulse` — one+discrete+unit, frame tick trigger
  - `palette` — one+continuous+color, chromatic reference frame

- **Key Property**: Rails are immutable, cannot be deleted/renamed, but are blocks [L316-330]

- **Palette Special Role**: Chromatic reference frame provides default color atmosphere [L332]

### Default Values by PayloadType

[L299-310] Use useful defaults (prefer rails), not zeros:
- float: phaseA rail or Constant(0.5)
- int: Constant(1)
- vec2: Constant([0.5, 0.5])
- color: HueRainbow(phaseA) or Constant(white)
- phase: phaseA rail
- bool: Constant(true)
- unit: phaseA rail or Constant(0.5)
- domain: DomainN(100)

### State Allocation by Cardinality

[L221-229] State keyed by `(blockId, laneIndex)`:
- `one` → one state cell
- `many(domain)` → N(domain) state cells (one per lane)
- `zero` → no runtime state

## Invariants

### I1: Every Entity Has an Explicit Role [L131-133]
Every block and edge carries explicit role declaration. No hidden flags.

### I2: Roles Are Discriminated Unions [L135-139]
- Closed union (no free-form keys)
- Single discriminator: `kind`
- Meta types are nested discriminated unions

### I3: No Compiler-Inserted Invisible Blocks [L141-149]
- Rejected: invisible blocks inserted by compiler not in patch.blocks
- Allowed: derived blocks that exist in patch.blocks, are visible, compile normally, have inspectable role metadata

### I4: Compiler Ignores Roles [L151-169]
Compiler sees: `(blocks, edges)`

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

### I5: Role Invariants Are Validatable [L171-189]
Default edges must reference derived defaultSource blocks. Validation enforces consistency mechanically.

### I6: User Entities Are Canonical [L191-196]
For undo/redo, persistence, and diffing:
- User entities are source of truth
- Derived entities can regenerate from invariants
- Serialization may elide derived entities

### I7: Every Cycle Must Cross a Stateful Boundary [L369-382]
Detection via Tarjan's algorithm for strongly connected components (SCC).
Each SCC must contain at least one stateful primitive (UnitDelay, Lag, Phasor, SampleAndHold).
Invalid cycles emit errors showing cycle path, involved blocks, and suggestion.

### I8: Default Source Invariant [L287-295]
DefaultSource block is ALWAYS connected during GraphNormalization.
Satisfies: every input has exactly one aggregated value per frame.
Combine mode decides how explicit writers interact with the default.

### I9: Rails Are Immutable System-Provided Buses [L314-332]
Cannot be deleted or renamed.
The palette rail is the chromatic reference frame.

### I10: State Allocation by Cardinality [L221-229]
State keyed by `(blockId, laneIndex)` tuple:
- `one` — one state cell
- `many(domain)` — N(domain) state cells (one per lane)
- `zero` — no runtime state

## Data Structures

### TypeScript Interfaces

```typescript
interface Block {
  id: BlockId;
  kind: string;
  role: BlockRole;
  inputs: PortBinding[];
  outputs: PortBinding[];
}

interface PortBinding {
  id: PortId;
  dir: { kind: 'in' } | { kind: 'out' };
  type: SignalType;
  combine: CombineMode;
}

type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };

type DerivedBlockMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState";     target: { kind: "wire"; wire: WireId } }
  | { kind: "lens";          target: { kind: "node"; node: NodeRef } };

type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };

type CombineMode =
  | { kind: 'numeric'; op: 'sum' | 'avg' | 'min' | 'max' | 'mul' }
  | { kind: 'any'; op: 'last' | 'first' | 'layer' }
  | { kind: 'bool'; op: 'or' | 'and' };
```

### Validation Function

```typescript
function validateRoleInvariants(patch: Patch): Diagnostic[] {
  const errors: Diagnostic[] = [];
  for (const edge of patch.edges) {
    if (edge.role.kind === "default") {
      const sourceBlock = patch.blocks.find(b => b.id === edge.role.meta.defaultSourceBlockId);
      if (!sourceBlock || sourceBlock.role.kind !== "derived") {
        errors.push({ message: "Default edge must reference derived block" });
      }
    }
  }
  return errors;
}
```

### UI Filtering Example

```typescript
// User-visible blocks only
const userBlocks = patch.blocks.filter(b => b.role.kind === "user");

// With UI preference
const visibleBlocks = patch.blocks.filter(b =>
  b.role.kind === "user" || settings.showDerivedBlocks
);
```

## Dependencies

### Depends On (Preconditions)

- **[01-type-system](./01-type-system.md)** [L419]
  - SignalType for port types
  - PayloadType for default value selection
  - Cardinality for state allocation
  - Extent (temporality, binding, perspective, branch)

- **[03-time-system](./03-time-system.md)** [L420]
  - TimeRoot block definition
  - Rail definitions (time, phaseA, phaseB, pulse, palette)

### Referenced By (Dependents)

- **[04-compilation](./04-compilation.md)** [L421]
  - How blocks compile through IR generation
  - GraphNormalization creates derived blocks
  - Type checking on ports

- **[GLOSSARY.md](../GLOSSARY.md)** [L422-423]
  - Block, BlockRole, DerivedBlockMeta terms

- **[INVARIANTS.md](../INVARIANTS.md)** [L423-424]
  - I6: Compiler never mutates the graph
  - I26: Every input has a source

### Cross-References

- Other systems that instantiate blocks: Runtime, Renderer, Diagnostics
- Systems that depend on role structure: Undo/Redo, Persistence, UI

## Decisions

### D1: Use `kind` Property, NOT `type` [L41-43]
**Rationale**: `type` is reserved for SignalType in the type system. Using `kind` prevents ambiguity and namespace pollution.

**Alternative Rejected**: Overload `type` — causes naming collision and confusion between block definition and signal type.

### D2: Roles Are Explicit Discriminated Unions, Not Flags [L135-139]
**Rationale**: Discriminated unions make unrepresentable states impossible. Role intent is always legible and validatable.

**Alternative Rejected**: Hidden/boolean flags or optional fields — harder to validate, easier to miss edge cases.

### D3: Derived Blocks Exist in patch.blocks, Not Phantom [L141-149]
**Rationale**: Derived blocks are real and compile normally. Making them phantom/invisible hides complexity and creates asymmetries between user and system concerns.

**Alternative Rejected**: Compiler-inserted phantom blocks — violates visibility, makes invariant validation harder, breaks undo/redo consistency.

### D4: Compiler Ignores Roles, Only Editor Uses Them [L151-169]
**Rationale**: Roles describe editor intent, not scheduling/execution semantics. Separating concerns makes both simpler and more testable.

**Alternative Rejected**: Roles influence scheduling — couples presentation layer with execution logic.

### D5: Four Stateful Primitives (MVP) [L204-211]
**Rationale**: Minimal irreducible set covering feedback, smoothing, phase, sampling. All other blocks are pure for simplicity.

**Alternative Rejected**: More primitives (Accumulator, Time functions) — deferred post-MVP after MVP stabilizes.

### D6: Default Sources Create Blocks, Not Implicit Defaults [L287-295]
**Rationale**: Explicit blocks make invariants checkable and undo/redo consistent. No invisible defaults.

**Alternative Rejected**: Implicit runtime defaults — hides actual graph structure and makes serialization ambiguous.

### D7: Rails Are System-Provided Derived Blocks [L314-332]
**Rationale**: Uniform treatment with all other blocks. Rails are just specialized derived blocks with immutability constraints.

**Alternative Rejected**: Magic constants or environment variables — harder to reason about and breaks composition.

### D8: CombineMode Is Closed Built-In Set, Not Registry [L280-283]
**Rationale**: Closed set of well-defined modes prevents proliferation. Type system defines valid modes per PayloadType.

**Alternative Rejected**: Custom combine modes or plugin registry — introduces complexity without clear value.

### D9: State Keyed by (blockId, laneIndex) [L221-229]
**Rationale**: Simple, predictable allocation. LaneIndex derived from Cardinality; no dynamic allocation.

**Alternative Rejected**: Named state variables — harder to track and limits composition.

### D10: Cycle Validation via SCC + Stateful Check [L369-382]
**Rationale**: Mechanical enforcement via Tarjan's algorithm. O(V+E) complexity, well-understood.

**Alternative Rejected**: Heuristics or warnings — too loose; should be errors.

### D11: Transforms/Lenses Normalize to Explicit Derived Blocks [L336-365]
**Rationale**: Uniform treatment. Lenses are just blocks with derived role and specific target metadata.

**Alternative Rejected**: Special-case lens handling — adds asymmetry.

### D12: UI Filtering Is Presentation Choice, Not Architecture [L386-400]
**Rationale**: All blocks are real in the model. UI chooses what to show based on settings and context.

**Alternative Rejected**: Architecture distinguishing visible vs invisible — conflates presentation with structure.

## Tier Classification

**Tier: T1 (Foundational)**

**Rationale**: Blocks are the only compute units. Everything in Oscilla flows through the block model. The block system is prerequisite for:
- Type system instantiation (ports carry SignalType)
- Time system initialization (TimeRoot and rails are blocks)
- Compilation (all compilation operates on block graph)
- Graph normalization (creates and manages derived blocks)
- Runtime execution (blocks are scheduled and executed)
- Persistence and undo/redo (user blocks are canonical)

**Stability**: Core concepts are stable. May add new derived block types or stateful primitives post-MVP without breaking core structure.

**Verification**:
- Block structure validated at deserialization
- Roles validated by `validateRoleInvariants()`
- Cycle invariant checked before compilation via SCC detection
- GraphNormalizer tests cover role preservation and derivation
- Default sources always connected during normalization
- State allocation deterministic and consistent
