# Sprint: payload-generic-core - Payload-Generic Block System
Generated: 2026-01-22
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Implement payload-generic block metadata, validation, and diagnostics per spec.

## Scope
**Deliverables:**
1. Registry metadata types for payload constraints
2. Compiler validation for payload constraints
3. Diagnostic codes for payload errors
4. Block annotations with payload metadata

## Work Items

### P0: Registry Metadata Types
Add payload-generic metadata to BlockDef interface.

**Acceptance Criteria:**
- [ ] `BlockPayloadMetadata` interface with allowedPayloads per port
- [ ] `PayloadCombination` type for multi-input combination rules
- [ ] Query functions: `getBlockPayloadMetadata()`, `isPayloadAllowed()`, `getPayloadCombinations()`
- [ ] Default metadata for blocks without explicit constraints

**Technical Notes:**
- Follow pattern from `BlockCardinalityMetadata`
- Located in `src/blocks/registry.ts`

### P1: Diagnostic Codes
Add payload-specific diagnostic codes.

**Acceptance Criteria:**
- [ ] `E_PAYLOAD_NOT_ALLOWED` - Payload not in allowedPayloads for port
- [ ] `E_PAYLOAD_COMBINATION_NOT_ALLOWED` - Input tuple not in combination table
- [ ] `E_UNIT_MISMATCH` - Units present but disallowed by block contract
- [ ] `E_IMPLICIT_CAST_DISALLOWED` - Attempt to coerce payload without explicit cast
- [ ] Each includes TargetRef attribution (block + port)
- [ ] Tests for diagnostic code coverage

**Technical Notes:**
- Add to `src/diagnostics/types.ts`
- Update `src/compiler/diagnosticConversion.ts`
- Update `src/compiler/types.ts` CompileErrorCode

### P2: Compiler Validation
Add payload constraint validation to type checking.

**Acceptance Criteria:**
- [ ] Validate payload against allowedPayloads when resolving types
- [ ] Check multi-input combinations against combination table
- [ ] Unit constraint validation (when units present on both sides)
- [ ] Integration with existing pass2-types.ts

**Technical Notes:**
- Add helper functions in `src/compiler/passes-v2/pass2-types.ts`
- Use metadata queries from registry

### P3: Block Annotations
Annotate existing blocks with payload metadata.

**Acceptance Criteria:**
- [ ] Math blocks (Add, Subtract, Multiply, Divide, Modulo) - homogeneous componentwise
- [ ] Trig blocks (Sin, Cos) - float only with unit constraints
- [ ] Vector blocks - vec2/vec3 specific
- [ ] Color blocks - color specific
- [ ] All blocks have explicit allowedPayloads (no implicit '???')
- [ ] Tests validating metadata consistency

**Technical Notes:**
- Preserve `'???'` only for truly polymorphic blocks (Const)
- Most math ops work on float, vec2, vec3 (not color unless componentwise)

## Dependencies
- Cardinality-generic system (tql) ✅ COMPLETED
- Block registry infrastructure ✅ EXISTS

## Risks
- **Breaking changes**: Some blocks may need allowedPayloads narrower than current `'???'`
  - Mitigation: Start with permissive constraints, tighten incrementally
