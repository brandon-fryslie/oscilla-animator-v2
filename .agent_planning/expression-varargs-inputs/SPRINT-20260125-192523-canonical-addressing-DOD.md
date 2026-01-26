# Definition of Done: canonical-addressing

Generated: 2026-01-25-192523
Status: PARTIALLY READY
Plan: SPRINT-20260125-192523-canonical-addressing-PLAN.md

## Acceptance Criteria

### CanonicalAddress Type System

- [ ] Type defined at `src/types/canonical-address.ts`
- [ ] Discriminated union with variants: block, output, input, param
- [ ] Type guards: `isBlockAddress()`, `isOutputAddress()`, `isInputAddress()`, `isParamAddress()`
- [ ] `addressToString(addr)` produces string like `blocks.b0.outputs.radius`
- [ ] `parseAddress(str)` returns CanonicalAddress or null for invalid
- [ ] Roundtrip property: `parseAddress(addressToString(addr))` equals `addr`
- [ ] Unit tests in `src/types/__tests__/canonical-address.test.ts`

### Address Generation from Patch

- [ ] `getBlockAddress(blockId)` returns `{ kind: 'block', blockId }`
- [ ] `getOutputAddress(blockId, portId)` returns output address
- [ ] `getInputAddress(blockId, portId)` returns input address
- [ ] `getAllAddresses(patch)` returns array of all addressable elements
- [ ] Deterministic: same patch always produces same address set
- [ ] Unit tests verify generation for various patch topologies

### Address Resolution Service

- [ ] `resolveAddress(patch, addressString)` returns target or null
- [ ] Resolution includes SignalType for port addresses
- [ ] `resolveAddressWithDiagnostic()` provides error messages
- [ ] Invalid syntax returns null (no exceptions)
- [ ] Missing target returns null with clear diagnostic
- [ ] Unit tests cover valid, invalid, missing cases

### User-Friendly Address Aliases

- [ ] `resolveAlias(patch, "Circle1.radius")` works
- [ ] Falls back to blockId when displayName is null
- [ ] Detects and rejects ambiguous displayNames (duplicates)
- [ ] `getAliasForOutput()` generates the alias string
- [ ] Unit tests cover all alias scenarios

### Address Registry Index

- [ ] `AddressRegistry.buildFromPatch(patch)` creates index
- [ ] `registry.resolve(address)` is O(1)
- [ ] `registry.resolveAlias(alias)` is O(1)
- [ ] Registry is immutable
- [ ] Unit tests verify lookup performance characteristics

## Integration Verification

- [ ] `npm run typecheck` passes with new types
- [ ] `npm run test` passes all new and existing tests
- [ ] No circular dependencies introduced
- [ ] Exported from appropriate index files

## Documentation

- [ ] JSDoc comments on all public functions
- [ ] README or inline comments explaining address format
- [ ] Migration notes if this affects existing code (unlikely for greenfield)
