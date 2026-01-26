# Sprint: canonical-addressing - Canonical Addressing System

Generated: 2026-01-25-192523
Confidence: HIGH: 3, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY
Source: EVALUATION-20260125-181203.md

## Sprint Goal

Establish a foundational canonical addressing system that provides deterministic, unique, machine-readable addresses for all graph elements (blocks, ports, outputs) enabling programmatic reference from expressions and future tooling.

## Scope

**Deliverables:**
- CanonicalAddress type and address generation functions
- Address registry integrated with Patch model
- Address resolution API (string -> target)
- Output address syntax for expression DSL references

## Background

The user requires a Terraform-like addressing system where everything in Oscilla has a deterministic, unique address. This is foundational for:
1. Expression varargs - referencing arbitrary block outputs by address
2. Future: persistence, debugging, external tooling integration
3. Future: cross-patch references, templates

**Address Format Decision (from user requirements):**
```
blocks.<blockId>.outputs.<portId>   // Block output reference
blocks.<blockId>.inputs.<portId>    // Block input reference
blocks.<blockId>.params.<paramId>   // Block parameter reference
```

Example: `blocks.b3.outputs.radius` references the `radius` output of block `b3`.

For user-facing addresses using displayName:
```
Circle1.radius     // Shorthand using displayName
```

## Work Items

### P0 (Critical) CanonicalAddress Type System [HIGH]

**Dependencies**: None
**Spec Reference**: New concept - extends existing BlockId/PortId types
**Status Reference**: EVALUATION-20260125-181203.md - "No varargs infrastructure exists"

#### Description

Define the core `CanonicalAddress` discriminated union type that can address any element in the Oscilla graph. This is the foundation for all addressing operations.

#### Acceptance Criteria

- [ ] `CanonicalAddress` type defined in `src/types/canonical-address.ts`
- [ ] Union covers: block, input-port, output-port, param
- [ ] Each variant includes the full path components for reconstruction
- [ ] Type guards for discriminating address variants (`isBlockAddress`, `isOutputAddress`, etc.)
- [ ] `addressToString()` and `parseAddress()` functions are inverses (roundtrip property)
- [ ] Addresses are case-sensitive and use dots as separators
- [ ] Unit tests cover all variants and edge cases (empty strings, invalid formats)

#### Technical Notes

```typescript
type CanonicalAddress =
  | { kind: 'block'; blockId: BlockId }
  | { kind: 'output'; blockId: BlockId; portId: PortId }
  | { kind: 'input'; blockId: BlockId; portId: PortId }
  | { kind: 'param'; blockId: BlockId; paramId: string };

function addressToString(addr: CanonicalAddress): string;
function parseAddress(str: string): CanonicalAddress | null;
```

---

### P0 (Critical) Address Generation from Patch [HIGH]

**Dependencies**: CanonicalAddress Type System
**Spec Reference**: Patch.ts - Block/InputPort/OutputPort structures
**Status Reference**: EVALUATION-20260125-181203.md - "Patch Model Port Structure"

#### Description

Implement functions to generate canonical addresses from Patch graph elements. Every block and port must be addressable.

#### Acceptance Criteria

- [ ] `getBlockAddress(blockId: BlockId): CanonicalAddress` generates block address
- [ ] `getOutputAddress(blockId: BlockId, portId: PortId): CanonicalAddress` generates output address
- [ ] `getInputAddress(blockId: BlockId, portId: PortId): CanonicalAddress` generates input address
- [ ] `getAllAddresses(patch: Patch): CanonicalAddress[]` enumerates all addressable elements
- [ ] Addresses are deterministic - same patch produces same addresses
- [ ] Addresses survive patch edits when the underlying element is unchanged
- [ ] Unit tests verify address generation for patches with various topologies

#### Technical Notes

Address generation is trivial construction - the BlockId and PortId already provide uniqueness. The value is in the uniform type and string representation.

---

### P1 (High) Address Resolution Service [MEDIUM]

**Dependencies**: Address Generation from Patch
**Spec Reference**: Patch.ts Block/Port lookup patterns
**Status Reference**: EVALUATION-20260125-181203.md - "No syntax for referencing external block outputs"

#### Description

Implement an address resolution service that resolves string addresses to their targets within a Patch context. This is essential for the expression DSL to resolve block output references.

#### Acceptance Criteria

- [ ] `resolveAddress(patch: Patch, address: string): ResolvedAddress | null`
- [ ] `ResolvedAddress` includes the target element plus its type information
- [ ] For output addresses, resolution includes the SignalType of the output
- [ ] Resolution fails gracefully for invalid/unknown addresses (returns null, not throws)
- [ ] Resolution validates that the target exists in the patch
- [ ] Clear error messages via `resolveAddressWithDiagnostic()` variant
- [ ] Unit tests cover: valid addresses, invalid syntax, missing targets, type information

#### Technical Notes

```typescript
type ResolvedAddress =
  | { kind: 'block'; block: Block }
  | { kind: 'output'; block: Block; port: OutputPort; type: SignalType }
  | { kind: 'input'; block: Block; port: InputPort; type: SignalType }
  | { kind: 'param'; block: Block; paramId: string; value: unknown };
```

Resolution requires access to block registry to get type information.

---

### P1 (High) User-Friendly Address Aliases [MEDIUM]

**Dependencies**: Address Resolution Service
**Spec Reference**: Block.displayName in Patch.ts
**Status Reference**: EVALUATION-20260125-181203.md - "Option B: Block Reference"

#### Description

Support user-friendly address aliases using block displayNames for ergonomic expression authoring. `Circle1.radius` should resolve to `blocks.b3.outputs.radius` where `Circle1` is the displayName of block `b3`.

#### Acceptance Criteria

- [ ] `resolveAlias(patch: Patch, alias: string): CanonicalAddress | null`
- [ ] Alias format: `<displayName>.<portId>` (e.g., `Circle1.radius`)
- [ ] Resolution prefers displayName, falls back to blockId if displayName is null
- [ ] Ambiguity detection: error if multiple blocks have same displayName
- [ ] `getAliasForOutput(patch: Patch, blockId: BlockId, portId: PortId): string` generates alias
- [ ] Unit tests cover: unique names, duplicate names, null displayNames, port variants

#### Technical Notes

This is a convenience layer on top of canonical addresses. The canonical form (`blocks.<id>.outputs.<port>`) remains the source of truth. Aliases are resolved to canonical form before use.

---

### P1 (High) Address Registry Index [HIGH]

**Dependencies**: Address Generation from Patch
**Spec Reference**: None - new infrastructure
**Status Reference**: EVALUATION-20260125-181203.md

#### Description

Build an index structure that efficiently maps addresses to elements for fast lookup during expression compilation. Avoids O(n) patch traversal for each address resolution.

#### Acceptance Criteria

- [ ] `AddressRegistry` class with `buildFromPatch(patch: Patch)` constructor
- [ ] O(1) lookup by canonical address string
- [ ] O(1) lookup by alias (displayName-based)
- [ ] Registry is immutable once built (rebuilt on patch changes)
- [ ] Registry invalidation strategy documented (caller responsibility)
- [ ] Memory efficient - stores references, not copies
- [ ] Unit tests verify O(1) behavior and index correctness

#### Technical Notes

```typescript
class AddressRegistry {
  private readonly byCanonical: Map<string, ResolvedAddress>;
  private readonly byAlias: Map<string, CanonicalAddress>;

  static buildFromPatch(patch: Patch): AddressRegistry;
  resolve(address: string): ResolvedAddress | null;
  resolveAlias(alias: string): CanonicalAddress | null;
}
```

## Dependencies

This sprint has NO external dependencies. It is foundational.

## Risks

| Risk | Mitigation |
|------|------------|
| DisplayName collisions causing ambiguity | Require unique displayNames or fall back to blockId |
| Address format changes breaking persistence | Version the address format, provide migration |
| Performance of registry rebuild on large patches | Lazy rebuild, incremental updates in future sprint |

## Exit Criteria

This sprint is complete when:
1. All tests pass
2. Addresses can be generated for any patch element
3. Addresses can be resolved back to their targets
4. User-friendly aliases work for expression authoring
