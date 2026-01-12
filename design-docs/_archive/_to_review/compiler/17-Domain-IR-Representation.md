# Domain IR Representation

**Status**: CANONICAL
**Created**: 2025-12-26
**References**:
- design-docs/12-Compiler-Final/02-IR-Schema.md
- design-docs/12-Compiler-Final/16-Block-Lowering.md
- .agent_planning/block-compiler-migration/STATUS-2025-12-26-030000.md § line 352

---

## Executive Summary

This document defines the authoritative IR representation for Domain artifacts in the block compiler migration. Domain is the foundational concept that creates element populations with stable IDs - the iteration space for Field expressions.

**Key Decisions**:
1. Domain is represented as a **special value** in `ValueRefPacked` using the `{ k: "special"; tag: "domain"; id: DomainId }` variant
2. Domain metadata is stored in a dedicated **DomainTable** indexed by `DomainId`
3. Field blocks reference domains via the **domainRef parameter** in lowering context
4. Domain producers use `IRBuilder.domainFromN()` and related methods to allocate domains

---

## 1. Domain in ValueRefPacked

### 1.1 Type Definition

Domain is represented using the `special` variant of `ValueRefPacked`:

```typescript
export type ValueRefPacked =
  | { k: "sig"; id: SigExprId }
  | { k: "field"; id: FieldExprId }
  | { k: "scalarConst"; constId: number }
  | { k: "special"; tag: string; id: number };

// Domain-specific helper
export function domainRef(id: DomainId): ValueRefPacked {
  return { k: "special", tag: "domain", id };
}
```

### 1.2 Rationale

**Why `special` instead of a dedicated `domain` variant?**

The `special` variant with a `tag` field provides:
- **Extensibility**: Other special values (RenderTree, TimeModel, etc.) use the same pattern
- **Type safety**: Tag discrimination prevents cross-type confusion
- **Consistency**: Matches design doc § 16-Block-Lowering.md line 79
- **Future-proof**: Easy to add new special value types without changing ValueRefPacked

**Why not just use a number directly?**

Domain IDs must be typed to prevent accidental use as indices or slot numbers. The explicit `{ k: "special", tag: "domain" }` wrapper enforces this at compile time.

---

## 2. DomainId Type and Allocation

### 2.1 Type Definition

```typescript
/**
 * DomainId: Dense index into DomainTable
 *
 * Opaque branded type prevents accidental mixing with ValueSlot, SigExprId, etc.
 */
export type DomainId = number & { readonly __brand: "DomainId" };
```

### 2.2 Allocation Strategy

**Dense sequential allocation:**
- DomainIds start at 0 and increment
- No gaps, no reuse within a compilation
- Maps directly to array index in DomainTable

**Stability guarantee:**
- Given the same patch + seed, same DomainId is allocated for the same block instance
- IDs are stable across hot-swap if the block instance persists
- IDs change if domain-defining parameters (n, rows, cols, seed) change

---

## 3. DomainTable Structure

### 3.1 Table Schema

The DomainTable stores domain metadata indexed by DomainId:

```typescript
export interface DomainEntry {
  /** Domain identifier (for debugging and provenance) */
  readonly domainId: DomainId;

  /** Stable domain name (e.g., "domain-DomainN-42-seed0") */
  readonly id: string;

  /** Number of elements in this domain */
  readonly n: number;

  /** Optional: Field of base positions (for GridDomain, SVGSampleDomain) */
  readonly positions?: FieldExprId;

  /** Domain source type (for debugging) */
  readonly source: "N" | "grid" | "svg" | "scene";

  /** Element ID generation strategy */
  readonly elementIdGen: ElementIdGenStrategy;

  /** Optional: Topology information for neighbor queries */
  readonly topology?: TopologyDef;

  /** Provenance: which block created this domain */
  readonly prov: Prov;
}

export interface DomainTable {
  readonly entries: readonly DomainEntry[];
}
```

### 3.2 Element ID Generation Strategy

```typescript
export type ElementIdGenStrategy =
  | { kind: "sequential" }                    // "0", "1", "2", ...
  | { kind: "grid"; rows: number; cols: number }  // "row-R-col-C"
  | { kind: "sample"; prefix: string }        // "sample-N"
  | { kind: "custom"; fn: (index: number) => string };
```

**Stability guarantee:**
- Element IDs are deterministic given (DomainId, elementIndex)
- Runtime can reconstruct element IDs without storing arrays
- Field expressions reference domains by DomainId, not by element arrays

### 3.3 Position Field Reference

For domains that produce base positions (GridDomain, SVGSampleDomain), the `positions` field references a FieldExprId:

```typescript
// GridDomain example:
const domainId = ctx.b.domainFromGrid(rows, cols, seed);
const positionsFieldId = ctx.b.domainPositions(domainId);
```

This pattern:
- Keeps position computation lazy (Field expression, not materialized array)
- Allows positions to be animated (spacing, origin can be Signal inputs)
- Preserves domain-field separation (domain defines IDs, field defines positions)

---

## 4. IRBuilder Methods

### 4.1 Domain Creation Methods

```typescript
export interface IRBuilder {
  /**
   * Create a domain from element count.
   *
   * @param nSig - Signal expression for element count (evaluated at compile time)
   * @param prov - Provenance for debugging
   * @returns DomainId referencing the created domain
   */
  domainFromN(nSig: SigExprId, prov?: Prov): DomainId;

  /**
   * Create a grid domain with positions.
   *
   * @param rows - Row count (compile-time constant or scalar signal)
   * @param cols - Column count (compile-time constant or scalar signal)
   * @param spacing - Spacing signal (can be animated)
   * @param originX - Origin X signal (can be animated)
   * @param originY - Origin Y signal (can be animated)
   * @param prov - Provenance
   * @returns DomainId and positions FieldExprId
   */
  domainFromGrid(
    rows: number,
    cols: number,
    spacing: SigExprId,
    originX: SigExprId,
    originY: SigExprId,
    prov?: Prov
  ): { domainId: DomainId; positions: FieldExprId };

  /**
   * Create domain from SVG path sampling.
   *
   * @param svgPath - SVG path data string
   * @param sampleCount - Number of samples
   * @param distribution - Sampling distribution mode
   * @param seed - Random seed
   * @param prov - Provenance
   * @returns DomainId and sampled positions FieldExprId
   */
  domainFromSVG(
    svgPath: string,
    sampleCount: number,
    distribution: "even" | "parametric",
    seed: number,
    prov?: Prov
  ): { domainId: DomainId; positions: FieldExprId };

  /**
   * Get the base positions field for a domain (if it exists).
   *
   * @param domainId - Domain to query
   * @returns FieldExprId for positions, or undefined if domain has no positions
   */
  domainPositions(domainId: DomainId): FieldExprId | undefined;
}
```

### 4.2 Implementation Pattern

IRBuilder implementations maintain:
- Internal counter for DomainId allocation
- DomainTable array for metadata
- Deduplication map to reuse identical domains (optional optimization)

```typescript
class IRBuilderImpl implements IRBuilder {
  private nextDomainId = 0;
  private domainTable: DomainEntry[] = [];

  domainFromN(nSig: SigExprId, prov?: Prov): DomainId {
    // Evaluate nSig to get compile-time element count
    const n = this.evalConstSig(nSig);

    // Allocate DomainId
    const domainId = this.nextDomainId++ as DomainId;

    // Create domain entry
    this.domainTable.push({
      domainId,
      id: `domain-${prov?.label ?? 'unknown'}-${n}`,
      n,
      source: "N",
      elementIdGen: { kind: "sequential" },
      prov: prov ?? { kind: "block", blockIdx: -1 },
    });

    return domainId;
  }

  domainFromGrid(
    rows: number,
    cols: number,
    spacing: SigExprId,
    originX: SigExprId,
    originY: SigExprId,
    prov?: Prov
  ): { domainId: DomainId; positions: FieldExprId } {
    const n = rows * cols;
    const domainId = this.nextDomainId++ as DomainId;

    // Build grid position field expression
    const positionsFieldId = this.buildGridPositions(
      domainId,
      rows,
      cols,
      spacing,
      originX,
      originY
    );

    // Create domain entry with positions
    this.domainTable.push({
      domainId,
      id: `grid-${rows}x${cols}`,
      n,
      positions: positionsFieldId,
      source: "grid",
      elementIdGen: { kind: "grid", rows, cols },
      prov: prov ?? { kind: "block", blockIdx: -1 },
    });

    return { domainId, positions: positionsFieldId };
  }
}
```

---

## 5. Field Block Domain Reference

### 5.1 Lowering Context

Field blocks receive domain references through `LowerCtx`:

```typescript
export interface LowerCtx {
  // ... existing fields ...

  /**
   * Domain reference for this block instance (if applicable).
   *
   * Field blocks that consume a Domain input will have this set.
   * The compiler extracts the domain from inputs and provides it here.
   */
  readonly domainRef?: DomainId;
}
```

### 5.2 Usage Pattern

```typescript
// Field block lowering example: FieldConstNumber
function lowerFieldConstNumber(args: {
  ctx: LowerCtx;
  inputs: readonly ValueRefPacked[];
  config?: unknown;
}): LowerResult {
  const { ctx, inputs } = args;

  // Extract domain from first input (domain is always input[0] for field blocks)
  const domainInput = inputs[0];
  if (domainInput.k !== "special" || domainInput.tag !== "domain") {
    throw new Error("FieldConstNumber requires Domain input");
  }

  const domainId = domainInput.id as DomainId;

  // Extract value signal from second input
  const valueSig = inputs[1];
  if (valueSig.k !== "sig") {
    throw new Error("FieldConstNumber value must be Signal");
  }

  // Create field expression: broadcast signal to field
  const fieldId = ctx.b.broadcastSigToField(
    valueSig.id,
    domainId,
    ctx.outTypes[0]
  );

  return {
    outputs: [{ k: "field", id: fieldId }],
  };
}
```

### 5.3 Broadcast and Reduce

Domain references enable the bridge operations between Signal and Field worlds:

```typescript
// Broadcast: Signal → Field (requires domain)
broadcastSigToField(sig: SigExprId, domainId: DomainId, outType: TypeDesc): FieldExprId

// Reduce: Field → Signal (domain implicit in field)
reduceFieldToSig(field: FieldExprId, reducer: FieldReduceOp, outType: TypeDesc): SigExprId
```

---

## 6. Runtime Materialization

### 6.1 Domain Lookup

At runtime, the evaluator uses DomainId to look up domain metadata:

```typescript
class FieldMaterializer {
  constructor(
    private domainTable: DomainTable,
    private sigEvaluator: SignalEvaluator
  ) {}

  materialize(fieldExprId: FieldExprId, domainId: DomainId): unknown[] {
    // Look up domain metadata
    const domain = this.domainTable.entries[domainId];

    // Generate element IDs
    const elementIds = this.generateElementIds(domain);

    // Evaluate field expression for each element
    const results: unknown[] = [];
    for (let i = 0; i < domain.n; i++) {
      const elementId = elementIds[i];
      const value = this.evalFieldExpr(fieldExprId, elementId, i);
      results.push(value);
    }

    return results;
  }

  private generateElementIds(domain: DomainEntry): string[] {
    const { n, elementIdGen } = domain;
    const ids: string[] = [];

    switch (elementIdGen.kind) {
      case "sequential":
        for (let i = 0; i < n; i++) {
          ids.push(String(i));
        }
        break;

      case "grid":
        for (let i = 0; i < n; i++) {
          const row = Math.floor(i / elementIdGen.cols);
          const col = i % elementIdGen.cols;
          ids.push(`row-${row}-col-${col}`);
        }
        break;

      case "sample":
        for (let i = 0; i < n; i++) {
          ids.push(`${elementIdGen.prefix}-${i}`);
        }
        break;

      case "custom":
        for (let i = 0; i < n; i++) {
          ids.push(elementIdGen.fn(i));
        }
        break;
    }

    return ids;
  }
}
```

### 6.2 Position Field Evaluation

For domains with positions, the positions field is evaluated lazily:

```typescript
// GridDomain materialization
const { domainId, positions } = domainFromGrid(10, 10, spacing, originX, originY);

// Later, at render time:
const positionArray = materializer.materialize(positions, domainId);
// positionArray: Vec2[] with 100 elements
```

This ensures:
- Positions are not computed until needed
- Animated spacing/origin signals are evaluated at current time
- No redundant storage of position data

---

## 7. Domain Compatibility and Validation

### 7.1 Compile-Time Validation

The compiler enforces domain compatibility for field operations:

```typescript
// FieldZipNumber: both fields must reference the same domain
function lowerFieldZipNumber(args: { ctx: LowerCtx; inputs: ValueRefPacked[] }): LowerResult {
  const fieldA = inputs[0];
  const fieldB = inputs[1];

  // Both must be field expressions
  if (fieldA.k !== "field" || fieldB.k !== "field") {
    throw new Error("FieldZipNumber requires Field inputs");
  }

  // Extract domain references (stored in field metadata)
  const domainA = getFieldDomain(fieldA.id);
  const domainB = getFieldDomain(fieldB.id);

  if (domainA !== domainB) {
    throw new DomainMismatchError(
      domainA,
      domainB,
      "FieldZipNumber requires fields over the same domain"
    );
  }

  // Create zip expression
  const resultFieldId = ctx.b.fieldZip(fieldA.id, fieldB.id, opFn);

  return { outputs: [{ k: "field", id: resultFieldId }] };
}
```

### 7.2 Runtime Validation

Runtime validation is minimal (fail-fast on critical errors only):

```typescript
// Materialize validates domain matches field
function materialize(fieldExprId: FieldExprId, domainId: DomainId): unknown[] {
  const fieldDomain = getFieldDomain(fieldExprId);

  if (fieldDomain !== domainId) {
    throw new Error(
      `Domain mismatch: field expects ${fieldDomain}, got ${domainId}`
    );
  }

  // Proceed with materialization...
}
```

---

## 8. Block Compiler Examples

### 8.1 DomainN Block

```typescript
export const DomainNLowering: BlockLowerFn = (args) => {
  const { ctx, inputs } = args;

  // Input[0]: n (Signal<number> or scalarConst)
  const nInput = inputs[0];

  let nSig: SigExprId;
  if (nInput.k === "sig") {
    nSig = nInput.id;
  } else if (nInput.k === "scalarConst") {
    // Create constant signal from scalar
    nSig = ctx.b.sigConst(nInput.constId, { world: "signal", domain: "number" });
  } else {
    throw new Error("DomainN n input must be Signal or scalarConst");
  }

  // Create domain
  const domainId = ctx.b.domainFromN(nSig, {
    kind: "block",
    blockIdx: ctx.blockIdx,
    label: ctx.label,
  });

  return {
    outputs: [{ k: "special", tag: "domain", id: domainId }],
    declares: {
      domainOut: { outPortIndex: 0, domainKind: "domain" },
    },
  };
};
```

### 8.2 GridDomain Block

```typescript
export const GridDomainLowering: BlockLowerFn = (args) => {
  const { ctx, inputs, config } = args;

  // Compile-time parameters (Scalar world)
  const rows = (config as any).rows as number;
  const cols = (config as any).cols as number;

  // Runtime parameters (Signal world)
  const spacing = (inputs[0] as { k: "sig"; id: SigExprId }).id;
  const originX = (inputs[1] as { k: "sig"; id: SigExprId }).id;
  const originY = (inputs[2] as { k: "sig"; id: SigExprId }).id;

  // Create grid domain with positions
  const { domainId, positions } = ctx.b.domainFromGrid(
    rows,
    cols,
    spacing,
    originX,
    originY,
    { kind: "block", blockIdx: ctx.blockIdx, label: ctx.label }
  );

  return {
    outputs: [
      { k: "special", tag: "domain", id: domainId },
      { k: "field", id: positions },
    ],
    declares: {
      domainOut: { outPortIndex: 0, domainKind: "domain" },
    },
  };
};
```

### 8.3 FieldHash01ById Block

```typescript
export const FieldHash01ByIdLowering: BlockLowerFn = (args) => {
  const { ctx, inputs, config } = args;

  // Input[0]: domain
  const domainInput = inputs[0];
  if (domainInput.k !== "special" || domainInput.tag !== "domain") {
    throw new Error("FieldHash01ById requires Domain input");
  }
  const domainId = domainInput.id as DomainId;

  // Config: seed (compile-time constant)
  const seed = (config as any).seed as number;

  // Create field expression: hash(elementId, seed) -> [0,1)
  const hashFieldId = ctx.b.fieldMap(
    ctx.b.fieldElementId(domainId),
    {
      kind: "kernel",
      kernel: "hashU01",
      params: { seed },
    }
  );

  return {
    outputs: [{ k: "field", id: hashFieldId }],
  };
};
```

---

## 9. Future Extensions

### 9.1 Topology Support

For neighbor queries and spatial operations:

```typescript
export interface TopologyDef {
  readonly kind: "grid" | "graph" | "custom";
  readonly neighbors?: (elementIndex: number) => readonly number[];
}

// Grid topology example
const topology: TopologyDef = {
  kind: "grid",
  neighbors: (index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    // Return indices of 4-connected neighbors
    return [
      (row - 1) * cols + col,  // north
      (row + 1) * cols + col,  // south
      row * cols + (col - 1),  // west
      row * cols + (col + 1),  // east
    ].filter((i) => i >= 0 && i < n);
  },
};
```

### 9.2 Scene Domains

For 3D scene graphs:

```typescript
domainFromScene(
  sceneGraph: SceneGraphRef,
  selector: NodeSelector,
  prov?: Prov
): { domainId: DomainId; transforms: FieldExprId }
```

### 9.3 Dynamic Domains

For particle systems with variable element counts:

```typescript
domainFromParticleSystem(
  maxParticles: number,
  activeCount: SigExprId,
  prov?: Prov
): { domainId: DomainId; activeField: FieldExprId }
```

---

## 10. Migration Checklist

### 10.1 Implementation Tasks

- [ ] Add `DomainId` branded type to `src/editor/compiler/ir/types.ts`
- [ ] Add `DomainEntry` and `DomainTable` interfaces to `src/editor/compiler/ir/types.ts`
- [ ] Update `IRBuilder` interface with domain creation methods
- [ ] Implement domain methods in `IRBuilderImpl`
- [ ] Add domain tag to `ValueRefPacked` special values
- [ ] Create helper function `domainRef(id: DomainId): ValueRefPacked`
- [ ] Update `LowerCtx` with optional `domainRef` field
- [ ] Migrate DomainN block to use `domainFromN()`
- [ ] Migrate GridDomain block to use `domainFromGrid()`
- [ ] Migrate SVGSampleDomain block to use `domainFromSVG()`

### 10.2 Testing Tasks

- [ ] Unit test: `domainFromN()` allocates sequential IDs
- [ ] Unit test: `domainFromGrid()` creates positions field
- [ ] Unit test: Domain metadata stored correctly in DomainTable
- [ ] Unit test: `domainRef()` helper produces correct ValueRefPacked
- [ ] Integration test: Field block receives domain reference
- [ ] Integration test: Domain compatibility validation
- [ ] Golden test: DomainN IR output matches closure behavior
- [ ] Golden test: GridDomain positions match closure output

---

## 11. Conclusion

This design establishes Domain as a first-class IR concept, providing:

1. **Type safety**: DomainId is a branded type, preventing mixing with other IDs
2. **Explicit representation**: Domain metadata lives in DomainTable, not hidden in closures
3. **Lazy evaluation**: Positions are FieldExprs, computed on demand
4. **Stable identity**: Element IDs are deterministic and stable across frames
5. **Compiler compatibility**: Aligns with IRBuilder patterns and ValueRefPacked structure
6. **Runtime efficiency**: Dense indexing and optional deduplication

The design is compatible with existing Domain producer blocks (DomainN, GridDomain, SVGSampleDomain) and supports all current field operations while enabling future extensions for topology, scenes, and dynamic domains.

---

**Review Status**: Ready for implementation
**Dependencies**: ValueRefPacked (exists), IRBuilder (exists), lowerTypes.ts (exists)
**Blocks this**: Field block migrations (15 blocks), Position map migrations (3 blocks)
