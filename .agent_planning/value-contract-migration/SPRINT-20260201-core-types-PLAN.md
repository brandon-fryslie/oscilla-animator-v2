# Sprint: Core Types - Add ValueContract to Type System
Generated: 2026-02-01
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Add the `ValueContract` type and integrate it into `CanonicalType`, equality, constructors, inference types, and adapter-spec pattern matching. This sprint changes the foundation; subsequent sprints migrate callers.

## Scope
**Deliverables:**
- ValueContract discriminated union type
- contract field on CanonicalType and InferenceCanonicalType
- Updated equality, validation, and adapter-spec matching
- Backward-compatible constructors (contract defaults to undefined/none)

## Work Items

### P0: Define ValueContract type
**Acceptance Criteria:**
- [ ] New file `src/core/canonical-types/contract.ts` with ValueContract type
- [ ] 4 initial kinds: `none`, `clamp01`, `wrap01`, `clamp11`
- [ ] Constructor functions: `contractNone()`, `contractClamp01()`, `contractWrap01()`, `contractClamp11()`
- [ ] `contractsEqual(a, b)` function (treats undefined as none)
- [ ] `contractsCompatible(source, target)` function: none→any is incompatible (needs adapter), any→none is compatible (dropping guarantee is OK)
- [ ] Exported from `src/core/canonical-types/index.ts`

**Technical Notes:**
- Compatibility rule: strong→weak is OK (clamp01 output connecting to no-contract input is fine). Weak→strong needs adapter (scalar with no contract connecting to clamp01 input triggers auto-insert).
- `undefined` contract treated as `none` everywhere.

### P1: Add contract to CanonicalType
**Acceptance Criteria:**
- [ ] `CanonicalType` interface gains `readonly contract?: ValueContract`
- [ ] `canonicalType()` constructor accepts optional contract parameter
- [ ] `canonicalSignal()`, `canonicalField()`, `canonicalEvent()`, `canonicalConst()` pass through contract
- [ ] `typesEqual()` updated to compare contracts
- [ ] `withInstance()` preserves contract via spread (verify this works)

**Technical Notes:**
- Optional field means ALL existing code compiles unchanged — no callers need updating in this sprint
- Constructors: `canonicalType(payload, unit?, extentOverrides?, contract?)` or use options object to avoid positional args
- Consider: new helper `canonicalTypeWithContract(payload, unit, contract, extentOverrides?)` for cleaner API

### P2: Add contract to InferenceCanonicalType
**Acceptance Criteria:**
- [ ] `InferenceCanonicalType` gains `readonly contract?: ValueContract`
- [ ] `inferType()` and `inferField()` constructors accept optional contract
- [ ] `finalizeInferenceType()` passes contract through to CanonicalType

**Technical Notes:**
- No contract inference/solving — contracts are explicit declarations, not variables
- This means no InferenceValueContract type needed, just concrete ValueContract

### P3: Add contract to adapter-spec TypePattern
**Acceptance Criteria:**
- [ ] `TypePattern` in adapter-spec.ts gains optional `contract` field
- [ ] `findAdapter()` matches on contract when present in pattern
- [ ] `needsAdapter()` considers contract mismatches
- [ ] Existing adapter specs continue to work (no contract = don't care about contract)
- [ ] All existing tests pass
- [ ] Type check passes

**Technical Notes:**
- TypePattern already has `payload`, `unit`, `extent`, `'same'`, `'any'` — add `contract` as optional
- When TypePattern.contract is undefined, adapter matches regardless of contract (backward compat)
- When TypePattern.contract is specified, source/target contract must match the pattern
- The normalize-adapters.ts Phase 2 (auto-insert) already calls findAdapter() — it will automatically start considering contracts

## Dependencies
- None (this is the foundation sprint)

## Risks
- Adding a 4th axis to CanonicalType could increase type comparison complexity
- Mitigation: contract is optional, defaults to undefined/none, and contractsEqual treats undefined===none
