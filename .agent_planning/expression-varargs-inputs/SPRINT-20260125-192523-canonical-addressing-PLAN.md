# Sprint: canonical-addressing - Canonical Addressing System

Generated: 2026-01-25-192523
Updated: 2026-01-26-023153
Confidence: HIGH: 3, MEDIUM: 2, LOW: 0
Status: COMPLETED
Source: EVALUATION-20260125-181203.md
Completion: WORK-EVALUATION-2026-01-26-022757.md

## Completion Summary

**Sprint 1 completed successfully on 2026-01-26.**

- Tests: 144 passing (canonical addressing specific)
- Files created: 5 implementation files, 5 test files
- Commits: 7 semantic commits
- All acceptance criteria met
- No regressions to existing tests

## Sprint Goal

Establish a foundational canonical addressing system (Terraform-style) that provides deterministic, unique, machine-readable hierarchical addresses for ALL graph elements (blocks, ports, edges, adapters, defaults, domain instances, intrinsics) enabling robust error messages, tooling integration, and future programmatic access. Addresses are comprehensive and cover system internals (for diagnostics) even where user expressions have limited access.

## Scope

**Deliverables:**
- Canonical name normalization utility (single source of truth)
- DisplayName uniqueness validation
- CanonicalAddress type covering all element types (blocks, ports, edges, adapters, defaults, domains, instances, intrinsics)
- Address generation functions for all addressable elements
- Address registry with O(1) lookup
- Address parsing with version support (v1:)
- Hierarchical path resolution for nested elements (edges, adapters, intrinsics)
- Error message generation using addresses

## Background

The user requires a Terraform-like addressing system where everything in Oscilla has a deterministic, unique address. This is foundational for:
1. Expression varargs - referencing arbitrary block outputs by address
2. Future: persistence, debugging, external tooling integration
3. Future: cross-patch references, templates

**Comprehensive Addressing Hierarchy (see CANONICAL-ADDRESSING-REFERENCE.md for full details):**

```
v1:blocks.<canonicalName>                          // Block
v1:blocks.<canonicalName>.outputs.<portId>         // Output port
v1:blocks.<canonicalName>.inputs.<portId>          // Input port
v1:blocks.<canonicalName>.params.<paramId>         // Parameter

v1:edges.<edgeId>                                  // Edge
v1:edges.<edgeId>/from                             // Edge source endpoint
v1:edges.<edgeId>/to                               // Edge target endpoint
v1:edges.<edgeId>/enabled                          // Edge enabled state
v1:edges.<edgeId>/sortKey                          // Edge combine order
v1:edges.<edgeId>/role                             // Edge role (user, default, auto, adapter)

v1:blocks.<canonicalName>.inputs.<portId>/combineMode      // Combine mode config
v1:blocks.<canonicalName>.inputs.<portId>/defaultSource    // Default source config

v1:domains.<canonicalName>/instances[n]                    // Domain instance
v1:domains.<canonicalName>/instances[n]/intrinsics.<prop>  // Instance property
```

**Philosophy**: Nothing is implicit. All topology elements are addressable for error messages and tooling.

**User Expression Access** (subset of full addressing):
- ✓ Can access: `v1:blocks.<canonicalName>.outputs.<portId>`
- ✗ Cannot access: Edges, adapters, defaults, intrinsics (equivalent to direct wiring)

**Canonical Names:**
- Derived from displayName by: stripping special chars (not replacing), replacing spaces with `_`
- DisplayName: `My Circle!` → canonical: `my_circle`
- DisplayName: `My Block! (it's a great block-o)` → canonical: `my_block_its_a_great_block-o`
- Case-insensitive (always converted to lowercase)
- Special chars allowed in displayName: `!@#&()[]{}|'"+-=*^%<>?.` but stripped for canonical
- **Uniqueness constraint**: Canonical names must be unique across all blocks
  - Collision example (illegal): displayName `My Block!` and `My block` both produce `my_block`
  - Collision detection: Perform strip+lowercase normalization, reject duplicates

## Work Items

This sprint focuses on **infrastructure only** - addressing scheme design and implementation. Expression DSL integration happens in Sprint 3.

### P0 (Critical) Canonical Name Normalization Utilities [HIGH]

**Dependencies**: None
**Spec Reference**: New utility module
**Status Reference**: EVALUATION-20260125-181203.md - "No varargs infrastructure exists"

#### Description

Implement reusable utilities for converting displayNames to canonical names and detecting collisions. These functions are the SINGLE SOURCE OF TRUTH for canonical naming and are used everywhere canonical names are needed (addresses, validation, collision detection).

#### Acceptance Criteria

- [ ] `normalizeCanonicalName(displayName: string): string` function
  - Strips special chars: `!@#&()[]{}|'"+-=*^%<>?.`
  - Replaces spaces with `_`
  - Converts to lowercase
  - Returns empty string for empty input (validator catches this)
- [ ] `detectCanonicalNameCollisions(displayNames: string[]): { collisions: string[] }`
  - Applies normalization to all displayNames
  - Returns any canonical names that appear more than once
  - Case-insensitive collision detection
- [ ] `validateDisplayNameUniqueness(patch: Patch): PatchError | null`
  - Checks all blocks in patch for canonical name collisions
  - Returns error if collisions found, null if valid
  - Error includes: which displayNames collide, what canonical name they produce
- [ ] `isValidDisplayName(name: string): boolean`
  - Rejects empty strings, null, undefined
  - Returns true for any non-empty string (displayName is very permissive)
- [ ] Unit tests:
  - Basic normalization: `My Circle!` → `my_circle`
  - Space replacement: `My Block!` → `my_block` (not `my_block!`)
  - Complex example: `My Block! (it's a great block-o)` → `my_block_its_a_great_block-o`
  - Case insensitivity: `My Block` and `my block` both produce `my_block`
  - Collision detection across patch
  - Edge cases: only spaces, only special chars, unicode

#### Technical Notes

Create `src/core/canonical-name.ts`:

```typescript
/** Special characters allowed in displayName but stripped for canonical */
const CANONICAL_STRIP_CHARS = /[!@#&()\[\]{}|'"+-=*^%<>?.]/g;

/**
 * Convert displayName to canonical name.
 * Strips special chars, replaces spaces with underscores, converts to lowercase.
 * This is the SINGLE SOURCE OF TRUTH for canonical naming.
 */
export function normalizeCanonicalName(displayName: string): string {
  return displayName
    .replace(CANONICAL_STRIP_CHARS, '')  // Strip special chars
    .replace(/\s+/g, '_')                 // Replace spaces with underscores
    .toLowerCase();                       // Lowercase
}

/**
 * Detect if displayNames produce collisions in canonical form.
 */
export function detectCanonicalNameCollisions(displayNames: string[]): {
  collisions: string[];
} {
  const canonical = new Map<string, string[]>();

  for (const name of displayNames) {
    const norm = normalizeCanonicalName(name);
    if (!canonical.has(norm)) {
      canonical.set(norm, []);
    }
    canonical.get(norm)!.push(name);
  }

  return {
    collisions: Array.from(canonical.entries())
      .filter(([_, names]) => names.length > 1)
      .map(([norm]) => norm),
  };
}

/**
 * Validate that all block displayNames are unique in canonical form.
 */
export function validateDisplayNameUniqueness(
  patch: Patch
): PatchError | null {
  const displayNames = patch.blocks
    .map(b => b.displayName)
    .filter((name): name is string => name !== null);

  const { collisions } = detectCanonicalNameCollisions(displayNames);

  if (collisions.length > 0) {
    return compileError(
      'DISPLAYNAME_COLLISION',
      `Block displayName collisions in canonical form: ${collisions.join(', ')}. ` +
      `DisplayNames must be unique when normalized (special chars stripped, lowercase).`
    );
  }

  return null;
}

export function isValidDisplayName(name: unknown): boolean {
  return typeof name === 'string' && name.length > 0;
}
```

---

### P0 (Critical) CanonicalAddress Type System [HIGH]

**Dependencies**: Canonical Name Normalization Utilities
**Spec Reference**: New concept - extends existing BlockId/PortId types
**Status Reference**: EVALUATION-20260125-181203.md - "No varargs infrastructure exists"

#### Description

Define the core `CanonicalAddress` discriminated union type that can address any element in the Oscilla graph. This is the foundation for all addressing operations. Addresses use canonical names (not blockIds) for user-facing readability.

#### Acceptance Criteria

- [ ] `CanonicalAddress` type defined in `src/types/canonical-address.ts`
- [ ] Union covers: block, input-port, output-port, param
- [ ] Each variant includes blockId AND canonicalName (for reconstruction and display)
- [ ] Type guards for discriminating address variants (`isBlockAddress`, `isOutputAddress`, etc.)
- [ ] `addressToString()` and `parseAddress()` functions are inverses (roundtrip property)
- [ ] Addresses are case-insensitive (canonical names lowercased)
- [ ] Address format is versioned for future migration support
- [ ] Unit tests cover all variants and edge cases (empty strings, invalid formats)

#### Technical Notes

Address format is versioned: `v1:blocks.<canonicalName>.outputs.<portId>`

```typescript
/** Versioned format string for addresses */
export type AddressFormat = 'v1';

type CanonicalAddress =
  | { kind: 'block'; blockId: BlockId; canonicalName: string }
  | { kind: 'output'; blockId: BlockId; canonicalName: string; portId: PortId }
  | { kind: 'input'; blockId: BlockId; canonicalName: string; portId: PortId }
  | { kind: 'param'; blockId: BlockId; canonicalName: string; paramId: string };

/** Convert address to string format (includes version) */
export function addressToString(addr: CanonicalAddress): string;

/** Parse address string, returns null if invalid */
export function parseAddress(str: string): CanonicalAddress | null;

/** Get the format version from an address string */
export function getAddressFormatVersion(addressStr: string): AddressFormat | null;
```

Example addresses:
- `v1:blocks.my_circle.outputs.radius`
- `v1:blocks.my_oscillator.inputs.phase`
- `v1:blocks.random_gen.params.seed`

---

### P0 (Critical) Address Generation from Patch [HIGH]

**Dependencies**: CanonicalAddress Type System, Canonical Name Normalization Utilities
**Spec Reference**: Patch.ts - Block/InputPort/OutputPort structures
**Status Reference**: EVALUATION-20260125-181203.md - "Patch Model Port Structure"

#### Description

Implement functions to generate canonical addresses from Patch graph elements. Every block and port must be addressable. Address generation uses canonical names computed from displayNames.

#### Acceptance Criteria

- [ ] `getBlockAddress(block: Block): CanonicalAddress` generates block address using canonical name
- [ ] `getOutputAddress(block: Block, portId: PortId): CanonicalAddress` generates output address
- [ ] `getInputAddress(block: Block, portId: PortId): CanonicalAddress` generates input address
- [ ] `getAllAddresses(patch: Patch): CanonicalAddress[]` enumerates all addressable elements
- [ ] Addresses are deterministic - same patch produces same addresses
- [ ] Addresses survive patch edits when the underlying element is unchanged
- [ ] Addresses use canonical name from displayName (or fallback to blockId if no displayName)
- [ ] Unit tests verify address generation for patches with various topologies
- [ ] Validate patch has no displayName collisions before generating addresses

#### Technical Notes

```typescript
/**
 * Generate block address from block.
 * Uses displayName if present (normalized to canonical form),
 * otherwise falls back to blockId.
 */
export function getBlockAddress(block: Block): CanonicalAddress {
  const canonicalName = block.displayName
    ? normalizeCanonicalName(block.displayName)
    : block.id; // Fallback to blockId

  return {
    kind: 'block',
    blockId: block.id,
    canonicalName,
  };
}

/**
 * Generate output address from block and port.
 */
export function getOutputAddress(
  block: Block,
  portId: PortId
): CanonicalAddress {
  const blockAddr = getBlockAddress(block);
  return {
    kind: 'output',
    blockId: block.id,
    canonicalName: blockAddr.canonicalName,
    portId,
  };
}

// Similar for input, param
```

---

### P1 (High) Address Resolution Service [MEDIUM]

**Dependencies**: Address Generation from Patch
**Spec Reference**: Patch.ts Block/Port lookup patterns, CANONICAL-ADDRESSING-REFERENCE.md
**Status Reference**: EVALUATION-20260125-181203.md - "No syntax for referencing external block outputs"

#### Description

Implement a comprehensive address resolution service that resolves versioned address strings to their targets within a Patch context. Must handle all address types: blocks, ports, edges, adapters, defaults, domains, instances, intrinsics.

#### Acceptance Criteria

- [ ] `resolveAddress(patch: Patch, address: string): ResolvedAddress | null`
- [ ] Supports all address formats: blocks, ports, edges, edges/properties, domains, instances, intrinsics
- [ ] Parses version prefix (e.g., `v1:`) and routes to appropriate handler
- [ ] For output addresses, includes CanonicalType of the output
- [ ] For edge addresses, resolves from/to endpoints and edge metadata
- [ ] For domain instances, validates instance index is in bounds
- [ ] For intrinsics, validates property name is valid for domain type
- [ ] Resolution fails gracefully for invalid/unknown addresses (returns null, not throws)
- [ ] `resolveAddressWithDiagnostic()` variant provides clear error messages
- [ ] Unit tests cover: all address types, invalid syntax, missing targets, out-of-bounds indices

#### Technical Notes

```typescript
type ResolvedAddress =
  | { kind: 'block'; block: Block; addr: CanonicalAddress }
  | { kind: 'output'; block: Block; port: OutputPort; type: CanonicalType; addr: CanonicalAddress }
  | { kind: 'input'; block: Block; port: InputPort; type: CanonicalType; addr: CanonicalAddress }
  | { kind: 'edge'; edge: Edge; addr: CanonicalAddress }
  | { kind: 'edge-property'; edge: Edge; property: 'from'|'to'|'enabled'|'sortKey'|'role'; value: unknown; addr: CanonicalAddress }
  | { kind: 'domain-instance'; domainBlockId: BlockId; instanceIndex: number; addr: CanonicalAddress }
  | { kind: 'intrinsic'; domainBlockId: BlockId; instanceIndex: number; propertyName: string; type: PayloadType; addr: CanonicalAddress };
```

Resolution requires access to block registry for type information and domain registry for intrinsic validation.

---

### P1 (High) User-Facing Shorthand Support [MEDIUM]

**Dependencies**: Address Resolution Service
**Spec Reference**: Block.displayName in Patch.ts
**Status Reference**: EVALUATION-20260125-181203.md - "Option B: Block Reference"

#### Description

Support user-facing shorthand for addressing using canonical names. `my_circle.radius` should resolve to `v1:blocks.my_circle.outputs.radius`. This is a convenience layer on top of canonical addresses for ergonomic expression authoring.

#### Acceptance Criteria

- [ ] `resolveShorthand(patch: Patch, shorthand: string): CanonicalAddress | null`
- [ ] Shorthand format: `<canonicalName>.<portId>` (e.g., `my_circle.radius`)
- [ ] Resolution handles canonical names (lowercased)
- [ ] Ambiguity detection: error if multiple blocks have same canonical name (caught during normalization)
- [ ] `getShorthandForOutput(patch: Patch, block: Block, portId: PortId): string` generates shorthand
- [ ] Unit tests cover: canonical names, null displayNames, port variants

#### Technical Notes

This is a convenience layer on top of canonical addresses. Shorthands are always resolved to their full canonical address form (`v1:blocks.<canonicalName>.<type>.<portId>`) before use. The normalization happens once during address generation, avoiding repeated computation.

---

### P2 (Medium) Address Registry Index [HIGH]

**Dependencies**: Address Generation from Patch, Address Resolution Service
**Spec Reference**: None - new infrastructure
**Status Reference**: EVALUATION-20260125-181203.md

#### Description

Build an index structure that efficiently maps all addressable elements to their resolved targets for O(1) lookup during compilation and error generation. Covers blocks, ports, edges, adapters, defaults, domains, instances, intrinsics.

#### Acceptance Criteria

- [ ] `AddressRegistry` class with `buildFromPatch(patch: Patch)` constructor
- [ ] O(1) lookup by canonical address string (all types)
- [ ] O(1) lookup by shorthand (e.g., `my_circle.radius`)
- [ ] Registry indexes: blocks, edges, adapters, defaults, domain instances
- [ ] Intrinsic properties indexed per domain (instance[n].intrinsics.property)
- [ ] Registry is immutable once built (rebuilt on patch changes)
- [ ] Registry invalidation strategy documented (caller responsibility)
- [ ] Memory efficient - stores references, not copies
- [ ] Unit tests verify O(1) behavior for all address types

#### Technical Notes

```typescript
class AddressRegistry {
  // Index maps
  private readonly byCanonical: Map<string, ResolvedAddress>;  // v1:blocks.name.outputs.port → ResolvedAddress
  private readonly byShorthand: Map<string, CanonicalAddress>; // name.port → CanonicalAddress
  private readonly edgesByCanonical: Map<string, Edge>;        // v1:edges.id → Edge
  private readonly domainsById: Map<BlockId, DomainInfo>;      // domain block ID → instance count

  static buildFromPatch(patch: Patch): AddressRegistry;
  resolve(address: string): ResolvedAddress | null;
  resolveShorthand(shorthand: string): CanonicalAddress | null;
  getEdge(edgeId: string): Edge | null;
  getDomainInstanceCount(blockId: BlockId): number | null;
}
```

## Dependencies

This sprint has NO external dependencies. It is foundational.

## Risks

| Risk | Mitigation |
|------|------------|
| DisplayName collision detection complexity | Single normalization function (`normalizeCanonicalName`) is ONLY source of truth, used everywhere |
| Special char stripping inconsistency | Explicit list of allowed chars, comprehensive tests |
| Address format changes breaking persistence | Versioned format (`v1:blocks.<name>...`), migration path for future versions |
| Performance of registry rebuild on large patches | Lazy rebuild, incremental updates in future sprint |

## Exit Criteria

This sprint is complete when:
1. All tests pass (canonical names, addresses, resolution, registry)
2. Canonical name normalization is implemented as **single source of truth** used everywhere
3. Display name uniqueness is validated (catches collisions like `My Block!` and `My block`)
4. CanonicalAddress type covers all element types (blocks, ports, edges, adapters, defaults, domains, instances, intrinsics)
5. Addresses can be generated for all addressable elements in patch
6. Addresses can be resolved back to their targets via AddressRegistry
7. Hierarchical path resolution works for nested elements (edges/properties, instances/intrinsics)
8. Versioned address format (v1:) supports migration path
9. User-facing shorthand (e.g., `my_circle.radius`) resolves correctly
10. Error message generation using addresses tested and working
11. All existing tests continue to pass (no regressions)
