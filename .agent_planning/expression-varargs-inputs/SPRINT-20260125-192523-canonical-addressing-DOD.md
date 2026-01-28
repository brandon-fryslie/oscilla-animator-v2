# Definition of Done: canonical-addressing

Generated: 2026-01-25-192523
Updated: 2026-01-26-023153
Status: COMPLETED
Plan: SPRINT-20260125-192523-canonical-addressing-PLAN.md
Verification: WORK-EVALUATION-2026-01-26-022757.md

## Acceptance Criteria

### CanonicalAddress Type System

- [x] Type defined at `src/types/canonical-address.ts`
- [x] Discriminated union with variants: block, output, input, param
- [x] Type guards: `isBlockAddress()`, `isOutputAddress()`, `isInputAddress()`, `isParamAddress()`
- [x] `addressToString(addr)` produces string like `v1:blocks.my_circle.outputs.radius`
- [x] `parseAddress(str)` returns CanonicalAddress or null for invalid
- [x] Roundtrip property: `parseAddress(addressToString(addr))` equals `addr` (except blockId by design)
- [x] Unit tests in `src/types/__tests__/canonical-address.test.ts` (36 tests)

### Address Generation from Patch

- [x] `getBlockAddress(block)` returns `{ kind: 'block', blockId, canonicalName }`
- [x] `getOutputAddress(block, portId)` returns output address
- [x] `getInputAddress(block, portId)` returns input address
- [x] `getAllAddresses(patch)` returns array of all addressable elements
- [x] Deterministic: same patch always produces same address set
- [x] Unit tests verify generation for various patch topologies (34 tests)

### Address Resolution Service

- [x] `resolveAddress(patch, addressString)` returns target or null
- [x] Resolution includes CanonicalType for port addresses
- [x] `resolveAddressWithDiagnostic()` provides error messages
- [x] Invalid syntax returns null (no exceptions)
- [x] Missing target returns null with clear diagnostic
- [x] Unit tests cover valid, invalid, missing cases (19 tests)

### User-Friendly Address Shorthands (renamed from Aliases)

- [x] `resolveShorthand(patch, "my_circle.radius")` works
- [x] Falls back to blockId when displayName is null
- [x] Detects collisions via validateDisplayNameUniqueness
- [x] `getShorthandForOutput()` generates the shorthand string
- [x] Unit tests cover all scenarios

### Address Registry Index

- [x] `AddressRegistry.buildFromPatch(patch)` creates index
- [x] `registry.resolve(address)` is O(1)
- [x] `registry.resolveShorthand(shorthand)` is O(1)
- [x] Registry is immutable
- [x] Unit tests verify lookup performance (23 tests)

## Integration Verification

- [x] `npm run typecheck` passes with new types (no errors in new files)
- [x] `npm run test` passes all 144 new tests
- [x] No circular dependencies introduced
- [x] Exported from `src/types/index.ts` and `src/graph/index.ts`

## Documentation

- [x] JSDoc comments on all public functions
- [x] Inline comments explaining address format and SINGLE SOURCE OF TRUTH
- [x] N/A - greenfield, no migration needed
