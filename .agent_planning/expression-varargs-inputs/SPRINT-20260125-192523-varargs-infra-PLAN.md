# Sprint: varargs-infra - Varargs Input Infrastructure

Generated: 2026-01-25-192523
Updated: 2026-01-26-023153
Confidence: HIGH: 2, MEDIUM: 3, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260125-181203.md
Prerequisite: SPRINT-20260125-192523-canonical-addressing-PLAN.md [COMPLETED]

## Sprint Goal

Extend the block registry and type system to support varargs inputs - input ports that accept a variable number of connections without combining them. This infrastructure enables the Expression block (and potentially other blocks) to reference arbitrary outputs.

## Scope

**Deliverables:**
- VarargInputDef type in block registry
- Varargs port representation in Patch model
- Varargs resolution during normalization
- No-combine passthrough semantics

## Background

The evaluation identified that:
- Current `InputDef` has no varargs concept
- `CombineMode` is designed for combining, not passthrough
- `Block.inputPorts` is a fixed `ReadonlyMap` with static keys

User requirements specify:
- Multi-value inputs (no combine mode)
- Can reference any float output from any block in the patch
- Signal + Field outputs supported
- Float type only

## Work Items

### P0 (Critical) VarargInputDef Type [HIGH]

**Dependencies**: None (runs parallel with Sprint 1)
**Spec Reference**: src/blocks/registry.ts InputDef (lines 214-223)
**Status Reference**: EVALUATION-20260125-181203.md - "No isVararg flag"

#### Description

Extend the `InputDef` interface to support varargs inputs. A varargs input accepts 0..N connections of a specified type, passed through as an array rather than combined.

#### Acceptance Criteria

- [ ] `VarargInputDef` interface or `InputDef.isVararg` flag added to registry
- [ ] Varargs inputs specify base type constraint (e.g., `float`)
- [ ] Varargs inputs have cardinality constraint (`Signal`, `Field`, or `any`)
- [ ] Varargs inputs have no defaultSource (explicit connections only)
- [ ] Type guards: `isVarargInput(def)`
- [ ] `minConnections` / `maxConnections` optional constraints
- [ ] Unit tests for varargs input definition validation

#### Technical Notes

Option A - Flag approach (simpler):
```typescript
interface InputDef {
  // ... existing fields
  readonly isVararg?: boolean;
  readonly varargConstraint?: {
    payloadType: PayloadType;
    cardinality: 'signal' | 'field' | 'any';
    minConnections?: number;
    maxConnections?: number;
  };
}
```

Option B - Discriminated union (cleaner):
```typescript
type InputDef = FixedInputDef | VarargInputDef;

interface VarargInputDef {
  readonly kind: 'vararg';
  readonly label?: string;
  readonly payloadConstraint: PayloadType;
  readonly cardinalityConstraint: 'signal' | 'field' | 'any';
  readonly minConnections?: number;
  readonly maxConnections?: number;
}
```

Recommend Option A for backward compatibility - existing code continues to work.

---

### P0 (Critical) Varargs Port Representation in Patch [HIGH]

**Dependencies**: VarargInputDef Type
**Spec Reference**: src/graph/Patch.ts InputPort (lines 60-71)
**Status Reference**: EVALUATION-20260125-181203.md - "No mechanism for variable-length input port list"

#### Description

Extend the Patch model to represent varargs connections. A varargs port stores its connections explicitly as an ordered list, not through edges.

#### Acceptance Criteria

- [ ] `VarargConnection` type representing a single vararg connection
- [ ] `InputPort` extended with optional `varargConnections?: VarargConnection[]`
- [ ] Connections ordered (order matters for expression indexing)
- [ ] Each connection references a canonical address
- [ ] PatchBuilder supports adding vararg connections
- [ ] Unit tests for patch serialization with varargs

#### Technical Notes

```typescript
interface VarargConnection {
  /** Canonical address of the output being referenced */
  readonly sourceAddress: string; // e.g., "blocks.b3.outputs.radius"
  /** User-provided alias (optional, for display) */
  readonly alias?: string;
  /** Sort key for ordering */
  readonly sortKey: number;
}

interface InputPort {
  readonly id: string;
  readonly defaultSource?: DefaultSource;
  readonly combineMode?: CombineMode;
  /** Vararg connections (only for vararg inputs) */
  readonly varargConnections?: readonly VarargConnection[];
}
```

Note: Varargs connections are stored on the port, NOT as edges. This is intentional - varargs bypass the normal edge/combine system.

---

### P1 (High) Varargs Normalization Pass [MEDIUM]

**Dependencies**: Varargs Port Representation, Canonical Addressing (Sprint 1)
**Spec Reference**: src/graph/normalize.ts
**Status Reference**: EVALUATION-20260125-181203.md - "No mechanism to enumerate all connected sources"

#### Description

Add a normalization pass that validates and resolves varargs connections. This pass runs after default-sources and before type resolution.

#### Acceptance Criteria

- [ ] Validate each vararg connection address exists
- [ ] Validate payload type constraint (must be float)
- [ ] Validate cardinality constraint (signal/field/any)
- [ ] Resolve addresses to actual block outputs
- [ ] Produce diagnostic for invalid references
- [ ] Order connections by sortKey
- [ ] Unit tests for valid and invalid varargs configurations

#### Technical Notes

```typescript
interface ResolvedVarargConnection {
  readonly sourceAddress: CanonicalAddress;
  readonly sourceBlockId: BlockId;
  readonly sourcePortId: PortId;
  readonly resolvedType: SignalType;
}

interface NormalizedVarargInput {
  readonly connections: readonly ResolvedVarargConnection[];
}
```

This should integrate into the existing normalization pipeline in `src/graph/normalize.ts`.

---

### P1 (High) Varargs Type Resolution [MEDIUM]

**Dependencies**: Varargs Normalization Pass
**Spec Reference**: src/compiler/passes-v2/pass4-types.ts
**Status Reference**: EVALUATION-20260125-181203.md - "Varargs type inference"

#### Description

Extend type resolution to handle varargs inputs. All vararg connections must be float; the Expression block's output type is determined by the expression, not the inputs.

#### Acceptance Criteria

- [ ] Type resolution validates all vararg connections are float
- [ ] Non-float vararg connections produce type error
- [ ] Cardinality is unified across vararg connections (all signal OR all field)
- [ ] Mixed signal/field is a type error (for now)
- [ ] Type resolution produces clear errors with connection addresses
- [ ] Unit tests for type validation scenarios

#### Technical Notes

For Expression block specifically:
- All inputs must be float (user requirement)
- Output type is determined by expression compilation, not input types
- Cardinality: if any input is field, output is field (broadcast semantics)

---

### P2 (Medium) Varargs Block Lowering Infrastructure [MEDIUM]

**Dependencies**: Varargs Type Resolution
**Spec Reference**: src/compiler/passes-v2/pass6-block-lowering.ts (lines 103-192)
**Status Reference**: EVALUATION-20260125-181203.md - "Returns single ValueRefPacked per port"

#### Description

Extend block lowering to provide varargs inputs as an array of values rather than a single combined value. This changes the `LowerArgs` interface for blocks with varargs.

#### Acceptance Criteria

- [ ] `LowerArgs.varargInputs` provides `Map<string, ValueRefPacked[]>` for varargs
- [ ] Normal inputs continue to use `inputsById` (unchanged)
- [ ] Blocks can distinguish vararg from normal inputs
- [ ] Lowering resolves each vararg connection to its IR signal
- [ ] Order of array matches connection sortKey order
- [ ] Unit tests for lowering with varargs

#### Technical Notes

```typescript
interface LowerArgs {
  readonly ctx: LowerCtx;
  readonly inputs: readonly ValueRefPacked[];
  readonly inputsById: Record<string, ValueRefPacked>;
  /** Vararg inputs - array of values per vararg port */
  readonly varargInputsById?: Record<string, readonly ValueRefPacked[]>;
  readonly config?: Readonly<Record<string, unknown>>;
}
```

The Expression block's `lower` function will use `varargInputsById` to get all connected values.

## Dependencies

- **Depends on Sprint 1**: Address resolution needed for vararg connection validation
- **Independent of**: Expression DSL changes (Sprint 3) - infrastructure can be built first

## Risks

| Risk | Mitigation |
|------|------------|
| Varargs adds complexity to existing normalization | Isolate in separate pass, minimal changes to existing code |
| Type system changes could break existing blocks | Flag-based approach maintains backward compatibility |
| Lowering changes could affect all blocks | Only blocks with varargs receive varargInputsById |

## Exit Criteria

This sprint is complete when:
1. VarargInputDef can be defined in block registry
2. Patch model can store vararg connections
3. Normalization validates and resolves vararg connections
4. Block lowering provides vararg inputs as arrays
5. All existing tests continue to pass
