# Domain Refactor - Context Document

**Last Updated**: 2026-01-17
**Status**: Design phase complete, implementation not started
**Key Documents**:
- `design-docs/WHAT-IS-A-DOMAIN.md` (comprehensive design)
- `design-docs/WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md` (implementation plan)
- `design-docs/DOMAIN-UI-CONCEPTS.md` (UX patterns)

---

## Mental Model: The Core Insight

### What We Got Wrong Initially

The existing codebase **conflates three orthogonal concerns** into a single "domain" concept:

```typescript
// CURRENT (WRONG) - Conflates everything
export interface DomainDef {
  readonly id: DomainId;
  readonly kind: 'grid' | 'n' | 'path';  // ← Mixes layout with domain
  readonly count: number;                 // ← Mixes instantiation with domain
  readonly elementIds: readonly string[];
  readonly params: Readonly<Record<string, unknown>>;
}
```

**The problem**: "Domain" tries to be three things at once:
1. **Classification** (what KIND of thing: circle, shape, path)
2. **Instantiation** (HOW MANY: count)
3. **Layout** (WHERE: grid arrangement, spacing)

### The Correct Model: Three Orthogonal Stages

```
Stage 1: PRIMITIVE     Stage 2: ARRAY      Stage 3: LAYOUT
(What kind)           (How many)          (Where)
──────────────       ───────────────     ──────────────
Signal<circle>   →   Field<circle>   →   Field<vec2>
  (ONE circle)         (MANY circles)      (positions)
```

**Key architectural principle**: Each stage is a **separate, composable transformation**.

---

## The Three-Stage Architecture

### Stage 1: Primitives (Domain Classification)

**Purpose**: Create **ONE** element of a specific domain type

**Example**: Circle primitive block
```typescript
┌─────────────────────────────┐
│          Circle             │
├─────────────────────────────┤
│ radius: ───────────○        │  ← Input: Signal<float>
├─────────────────────────────┤
│               circle ○──────│  ← Output: Signal<circle> (ONE)
└─────────────────────────────┘
```

**Key points**:
- Domain type = classification (circle, rectangle, path, particle)
- Primitive creates exactly ONE element
- Domain defines intrinsic properties (circle → radius, center)
- Domain defines valid operations (shapes can collide, audio cannot)

### Stage 2: Array (Cardinality Transform)

**Purpose**: Transform **ONE** element into **MANY** elements

**Example**: Array block
```typescript
┌─────────────────────────────┐
│           Array             │
├─────────────────────────────┤
│ element: ──────────○        │  ← Input: Signal<any-domain> (ONE)
│ count: ────────────○        │  ← Input: Signal<int>
├─────────────────────────────┤
│           elements ○────────│  ← Output: Field<same-domain> (MANY)
│              index ○────────│  ← Output: Field<int>
│                  t ○────────│  ← Output: Field<float> [0,1]
│             active ○────────│  ← Output: Field<bool>
└─────────────────────────────┘
```

**Key points**:
- **Cardinality transform**: `Signal<T> → Field<T, instance>`
- Count can be **static OR dynamic** (driven by signal, e.g., audio envelope)
- **Pool-based allocation**: `maxCount` allocated once, `count` varies per-frame
- `active` mask: cheap boolean flag to show/hide elements
- Domain-agnostic: works with ANY domain type
- Outputs universal intrinsics: `index`, `t` (normalized [0,1]), `active`

### Stage 3: Layout (Spatial Operations)

**Purpose**: Compute **positions** for field elements

**Example**: Grid Layout block
```typescript
┌─────────────────────────────┐
│        Grid Layout          │
├─────────────────────────────┤
│ elements: ─────────○        │  ← Input: Field<any>
│ rows: ─────────────○        │  ← Input: Signal<int>
│ cols: ─────────────○        │  ← Input: Signal<int>
│ spacing: ──────────○        │  ← Input: Signal<float>
├─────────────────────────────┤
│          position ○─────────│  ← Output: Field<vec2, same-instance>
└─────────────────────────────┘
```

**Key points**:
- Layout is an **operation**, not a configuration
- Takes field as input, outputs position field
- Position is **just another field** (not special)
- Layout params can be **dynamic signals** (animated grids)
- Domain-agnostic: works with ANY field
- Other layouts: Spiral, Random, Along Path, Custom

---

## Complete Flow Example

### User Scenario: 100 circles in 10×10 grid with noise

```
[Circle] ──element──▶ [Array] ──elements──▶ [Grid Layout] ──position──▶ [Noise] ──▶ [Render]
 radius: 0.02          ↑  ↑                   ↑  ↑                         ↑
                     count maxCount         rows cols                amplitude
                      100   200               10   10                    0.1

[Audio] ──▶ [Envelope] ──▶ [Remap] ────────────┘
             attack: 0.1    in: [0,1]
             release: 0.5   out: [0,100]
```

**Step-by-step execution**:

1. **Circle block**: Creates `Signal<circle>` with radius 0.02
2. **Array block**:
   - Allocates pool of 200 circles (maxCount)
   - Count driven by audio envelope (0-100)
   - Outputs `Field<circle>` + `index`, `t`, `active` fields
3. **Grid Layout block**:
   - Takes `Field<circle>` as input
   - Computes 10×10 grid positions
   - Outputs `Field<vec2>` (positions)
4. **Noise block**:
   - Takes positions as input
   - Adds noise displacement (amplitude 0.1)
   - Outputs perturbed `Field<vec2>`
5. **Render block**:
   - Infers instance from field inputs
   - Renders only `active` circles (count ≤ 100)

---

## Type System

### Signal vs Field

```typescript
// Signal: ONE value (cardinality: one)
type Signal<T> = {
  domain: DomainTypeId;  // e.g., 'circle', 'float', 'vec2'
  cardinality: 'one';
  value: T;
};

// Field: MANY values over an instance (cardinality: many)
type Field<T, I extends InstanceId> = {
  domain: DomainTypeId;  // e.g., 'circle', 'float', 'vec2'
  cardinality: 'many';
  instance: I;           // Which instance these elements belong to
  values: T[];           // Array of values (length = maxCount)
};
```

### Domain Type Hierarchy

```
number ──┬──▶ float
         ├──▶ int
         └──▶ angle

shape ───┬──▶ circle
         ├──▶ rectangle
         ├──▶ polygon
         └──▶ ellipse

spatial ─┬──▶ vec2
         ├──▶ vec3
         └──▶ transform

control ─┬──▶ slider
         ├──▶ knob
         └──▶ toggle

sequence ┬──▶ path
         ├──▶ particle
         └──▶ text
```

**Subtyping**: `circle <: shape` (circle IS-A shape, inherits intrinsics)

---

## IR Representation

### Primitive Declaration (NEW)

```typescript
export type PrimitiveId = string & { readonly __brand: 'PrimitiveId' };

export interface PrimitiveDecl {
  readonly id: PrimitiveId;
  readonly domainType: DomainTypeId;  // 'circle', 'rectangle', etc.
  readonly params: Record<string, SigExprId>;  // e.g., { radius: sig123 }
}
```

### Instance Declaration (Pool-Based)

```typescript
export type InstanceId = string & { readonly __brand: 'InstanceId' };

export interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainTypeId;      // Inherited from primitive
  readonly primitiveId: PrimitiveId;      // Which primitive this instantiates
  readonly maxCount: number;              // Pool size (allocated once)
  readonly countExpr?: SigExprId;         // Dynamic count signal (optional)
  readonly lifecycle: 'static' | 'pooled';
}
```

**Key insight**: No layout information here! Layout is computed separately.

### Field Expressions (NEW)

```typescript
// Created by Array block
export interface FieldExprArray {
  readonly kind: 'array';
  readonly primitiveId: PrimitiveId;
  readonly instanceId: InstanceId;
  readonly type: SignalType;
}

// Created by layout blocks
export interface FieldExprLayout {
  readonly kind: 'layout';
  readonly instanceId: InstanceId;
  readonly layout: 'grid' | 'spiral' | 'random' | 'along-path';
  readonly params: readonly SigExprId[];  // rows, cols, spacing, etc.
  readonly type: SignalType;  // Always vec2 (position)
}
```

---

## Pool-Based Allocation

### Why Pool-Based?

**Problem**: Dynamic count (e.g., driven by audio) requires creating/destroying elements every frame → expensive

**Solution**: Allocate `maxCount` buffers **once**, toggle visibility with `active` mask

### Implementation

```typescript
// Runtime state (allocated once)
const pool = {
  positions: new Float32Array(maxCount * 2),  // vec2 per element
  colors: new Float32Array(maxCount * 3),     // rgb per element
  radii: new Float32Array(maxCount),          // float per element
  active: new Uint8Array(maxCount),           // bool per element (0 or 1)
};

// Per-frame evaluation
const currentCount = evalSignal(countExpr, frame);  // e.g., 73

for (let i = 0; i < maxCount; i++) {
  pool.active[i] = i < currentCount ? 1 : 0;
}

// Render only active elements
for (let i = 0; i < maxCount; i++) {
  if (pool.active[i]) {
    renderElement(pool.positions[i], pool.colors[i], pool.radii[i]);
  }
}
```

**Benefits**:
- No allocation/deallocation per frame
- Cheap to toggle visibility (single byte write)
- Predictable performance (no GC pressure)
- Works with WebGL instancing

---

## Why This Architecture?

### Separation of Concerns

| Concern | Old Model | New Model |
|---------|-----------|-----------|
| **What kind** | Conflated in DomainDef.kind | Primitive (domain type) |
| **How many** | Conflated in DomainDef.count | Array block |
| **Where** | Conflated in DomainDef.kind='grid' | Layout blocks |

### Composability

Each stage is **independent and reusable**:

```
[Circle] ──▶ [Array] ──▶ [Grid Layout] ──▶ [Render]
                ↑              ↑
                │              │
                │              └─ Could swap with [Spiral Layout]
                └─ Could swap with [Rectangle]

[Rectangle] ──▶ [Array] ──▶ [Spiral Layout] ──▶ [Render]
```

### Type Safety

Connections enforce **domain compatibility**:

```
✅ [Circle] ──▶ [Array] ──▶ [Grid Layout]
   Signal<circle> → Field<circle> → Field<vec2>

❌ [Audio] ──▶ [Grid Layout]
   Signal<float> ✗ Field<any> (Grid expects field, not signal)
```

### User Mental Model

Users **never see "domain"** - they see:
1. **Primitives**: Circle, Rectangle, Polygon (concrete shapes)
2. **Array**: "Make multiple copies"
3. **Layout**: Grid, Spiral, Random (spatial arrangements)

Wire colors and connection hints guide them without exposing type theory.

---

## Implementation Roadmap

### Phase 1: Type System Core

**Files to modify**:
- `src/core/canonical-types.ts`: Add `DomainTypeId`, `InstanceId`
- `src/compiler/ir/Indices.ts`: Add `PrimitiveId`, split `DomainId`
- `src/compiler/ir/types.ts`: Add new IR types

**Deliverable**: Type definitions compile

### Phase 2: IR Builder

**Files to modify**:
- `src/compiler/ir/IRBuilder.ts`: Update interface
- `src/compiler/ir/IRBuilderImpl.ts`: Implement new methods

**New methods**:
```typescript
interface IRBuilder {
  // Primitives
  createPrimitive(domainType: DomainTypeId, params: Record<string, SigExprId>): PrimitiveId;

  // Instances
  createInstance(primitiveId: PrimitiveId, maxCount: number, countExpr?: SigExprId): InstanceId;

  // Fields
  fieldArray(instanceId: InstanceId, domainType: DomainTypeId): FieldExprId;
  fieldLayout(instanceId: InstanceId, layout: LayoutKind, params: SigExprId[]): FieldExprId;
}
```

**Deliverable**: IR construction works

### Phase 3: Block Library

**Files to create/modify**:
- `src/blocks/primitive-blocks.ts`: Circle, Rectangle, Polygon, etc.
- `src/blocks/array-block.ts`: Array block
- `src/blocks/layout-blocks.ts`: Grid, Spiral, Random, Along Path
- **DELETE**: `src/blocks/domain-blocks.ts` (old conflated model)

**Deliverable**: Block library compiles

### Phase 4: Runtime

**Files to modify**:
- `src/runtime/Evaluator.ts`: Add pool-based evaluation
- `src/runtime/renderer/`: Update to use active mask

**Deliverable**: Runtime executes programs

### Phase 5: UI/UX

**Files to modify**:
- `src/ui/editor/`: Update block palette, wire rendering
- `src/ui/editor/connection-validator.ts`: Update type checking

**Deliverable**: Users can build programs in UI

---

## Key Invariants

### Architectural Laws (from global CLAUDE.md)

1. **ONE SOURCE OF TRUTH**: Domain type defined in primitive, inherited by instance
2. **SINGLE ENFORCER**: Type checking at connection boundary (not scattered)
3. **ONE-WAY DEPENDENCIES**: Primitive → Array → Layout (no back-edges)
4. **ONE TYPE PER BEHAVIOR**: Array block is domain-agnostic (not Circle Array, Rectangle Array)

### Domain-Specific Invariants

1. **Domain is classification only**: No count, no layout, no configuration
2. **Cardinality explicit**: Signal<T> (one) vs Field<T> (many) - always clear
3. **Position is not special**: Just another field, can be replaced/transformed
4. **Layout is operation**: Takes field input, outputs position field
5. **Pool-based allocation**: maxCount allocated once, count varies per-frame
6. **Active mask required**: Every instance has active flag per element

---

## Current Status

### Completed

- ✅ Design documents written and reviewed
- ✅ Three-stage architecture defined
- ✅ Type system specified
- ✅ IR representation designed
- ✅ Pool-based allocation model defined
- ✅ UI/UX patterns documented

### Not Started

- ❌ Implementation (no code changes yet)
- ❌ Tests
- ❌ Migration plan for existing programs
- ❌ Runtime evaluation
- ❌ UI components

### Open Questions

None currently - design phase is complete and validated.

---

## Mental State Recovery Checklist

When returning to this work, ensure you understand:

1. **The core problem**: Old model conflates domain/count/layout
2. **The solution**: Three orthogonal stages (Primitive → Array → Layout)
3. **The type system**: Signal<T> (one) vs Field<T> (many)
4. **Pool-based allocation**: maxCount + active mask for dynamic count
5. **Layout as operation**: Not configuration, but a transformation block
6. **Position not special**: Just another field that can be replaced

**Key mantras**:
- "Domain is classification, not instantiation"
- "One source of truth: primitive defines domain type"
- "Position is just another field"
- "Layout operates on fields, outputs position fields"

---

## References

- **Design docs**: `design-docs/WHAT-IS-A-DOMAIN.md` (4 parts)
- **Refactor plan**: `design-docs/WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md`
- **UI patterns**: `design-docs/DOMAIN-UI-CONCEPTS.md`
- **Current IR types**: `src/compiler/ir/types.ts` (shows old model)
- **Global laws**: `~/.claude/CLAUDE.md` (architectural constraints)
- **Conversation transcript**: `/Users/bmf/.claude/projects/-Users-bmf-code-oscilla-animator-v2/b0a6ddd5-a09a-40e4-8d20-86dfe6e9654f.jsonl`

---

**End of Context Document**
