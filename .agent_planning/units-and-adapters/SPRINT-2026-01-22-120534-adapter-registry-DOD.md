# Definition of Done: adapter-registry
Generated: 2026-01-22-120534
Confidence: HIGH
Plan: SPRINT-2026-01-22-120534-adapter-registry-PLAN.md

## Acceptance Criteria

### Adapter Block Definitions

#### All 10 Required Adapters Registered
- [ ] PhaseToScalar01: in(float:phase01) → out(float:scalar), lower: identity
- [ ] ScalarToPhase01: in(float:scalar) → out(float:phase01), lower: wrap01
- [ ] PhaseToRadians: in(float:phase01) → out(float:radians), lower: x * 2π
- [ ] RadiansToPhase01: in(float:radians) → out(float:phase01), lower: wrap01(x / 2π)
- [ ] DegreesToRadians: in(float:degrees) → out(float:radians), lower: x * (π/180)
- [ ] RadiansToDegrees: in(float:radians) → out(float:degrees), lower: x * (180/π)
- [ ] MsToSeconds: in(int:ms) → out(float:seconds), lower: x / 1000
- [ ] SecondsToMs: in(float:seconds) → out(int:ms), lower: floor(x * 1000)
- [ ] ScalarToNorm01Clamp: in(float:scalar) → out(float:norm01), lower: clamp(x, 0, 1)
- [ ] Norm01ToScalar: in(float:norm01) → out(float:scalar), lower: identity
- [ ] Each block has category: 'adapter'
- [ ] Each block has form: 'primitive'
- [ ] Each block has capability: 'pure'
- [ ] Each block has exactly 1 input port and 1 output port

#### Adapter Lower Functions Work
- [ ] Each adapter block has lower() function that produces correct IR
- [ ] PhaseToScalar01 produces pass-through (no OpCode needed)
- [ ] ScalarToPhase01 uses OpCode.wrap01
- [ ] PhaseToRadians uses OpCode.mul with constant 6.283185307179586
- [ ] Clamp operations use OpCode.clamp
- [ ] All adapters are cardinality-preserving (work for Signal and Field)
- [ ] Test: Each adapter compiles and runs correctly

### Adapter Registry

#### Unit-Based Rules Added
- [ ] TypeSignature interface includes unit: Unit | 'any'
- [ ] extractSignature() extracts unit from SignalType
- [ ] 10 adapter rules added to ADAPTER_RULES array
- [ ] Each rule specifies exact (payload, unit) for from and to
- [ ] Rules include cardinality: 'any' and temporality: 'continuous'
- [ ] findAdapter() matches on payload AND unit AND cardinality AND temporality
- [ ] Existing Broadcast adapter coexists with unit adapters
- [ ] Order of rules: specific before general

#### Adapter Lookup Works
- [ ] findAdapter(float:phase01, float:radians) returns PhaseToRadians
- [ ] findAdapter(float:radians, float:phase01) returns RadiansToPhase01
- [ ] findAdapter(float:phase01, float:phase01) returns null (no adapter needed)
- [ ] findAdapter(float:phase01, float:norm01) returns null (disallowed conversion)
- [ ] findAdapter respects cardinality (Signal→Signal and Field→Field both work)
- [ ] Test coverage for all 10 adapter lookup cases

### DerivedBlockMeta Extension

#### Adapter Variant Added
- [ ] DerivedBlockMeta includes `{ kind: 'adapter'; edgeId: string; adapterType: string }`
- [ ] Type compiles and exports from types/index.ts
- [ ] Existing defaultSource variant unchanged
- [ ] BlockRole accepts derived + adapter meta
- [ ] Pass1 default sources unaffected

### Adapter Anchor System

#### Stable ID Generation
- [ ] Function generateAdapterAnchor(edgeId, adapterType) implemented
- [ ] Anchor format: `adapter:<edgeId>:<adapterType>`
- [ ] Anchor converts to stable BlockId (same pattern as default sources)
- [ ] Same edge + same adapter type = same BlockId across normalizations
- [ ] No collisions with user block IDs
- [ ] Test: Anchor generation is deterministic

### Graph Normalization - Pass2 Extension

#### Adapter Materialization
- [ ] Pass2 detects unit mismatches via findAdapter()
- [ ] When adapter found, creates derived block with adapter meta
- [ ] Adapter block ID comes from anchor (stable across normalizations)
- [ ] Adapter block has ports from block definition
- [ ] Original edge replaced with two edges: source→adapter, adapter→target
- [ ] Edge IDs are deterministic (based on adapter anchor + direction)
- [ ] Pass3 indexing sees adapter blocks as normal blocks
- [ ] Normalized graph includes adapter blocks in blocks map

#### Wiring Correctness
- [ ] Original connection A.out → B.in becomes:
  - A.out → Adapter.in (edge 1)
  - Adapter.out → B.in (edge 2)
- [ ] Edge 1 has correct from/to endpoints
- [ ] Edge 2 has correct from/to endpoints
- [ ] Both edges enabled
- [ ] Original edge removed from normalized graph
- [ ] Test: Edge wiring matches spec §B3.3

### Adapter Diagnostics

#### Error Types Defined
- [ ] UNKNOWN_ADAPTER_KIND diagnostic code exists
- [ ] ADAPTER_TYPE_MISMATCH diagnostic code exists
- [ ] ADAPTER_CARDINALITY_MISMATCH diagnostic code exists
- [ ] All diagnostics in diagnostics/types.ts
- [ ] Diagnostic messages include edge ID, block IDs, types
- [ ] Example: "No adapter found to convert float:phase01 to float:radians on edge <edgeId>"

#### Diagnostic Emission
- [ ] Pass2 emits UNKNOWN_ADAPTER_KIND when adapter block not registered
- [ ] Pass2 emits ADAPTER_TYPE_MISMATCH when adapter doesn't match types
- [ ] Pass2 emits ADAPTER_CARDINALITY_MISMATCH when adapter on wrong cardinality
- [ ] Diagnostics prevent invalid graphs from compiling

### End-to-End Tests

#### Phase→Radians Test Case
- [ ] Create patch with Oscillator[phase] → FieldPolarLayout[angle]
- [ ] Run normalization
- [ ] Verify PhaseToRadians adapter block inserted
- [ ] Verify adapter has correct ID from anchor
- [ ] Verify adapter has DerivedBlockMeta with kind: 'adapter'
- [ ] Verify edges: Oscillator→PhaseToRadians→FieldPolarLayout
- [ ] Run compilation
- [ ] Verify IR includes adapter operation (mul by 2π)
- [ ] Run runtime
- [ ] Verify output: phase 0.25 → radians 1.5707963267948966 (π/2)

#### No-Adapter Test Case
- [ ] Create patch with matching types (e.g., phase→phase)
- [ ] Run normalization
- [ ] Verify NO adapter inserted
- [ ] Verify direct edge remains

#### Multiple Adapters Test Case
- [ ] Create patch with multiple mismatched connections
- [ ] Each gets correct adapter
- [ ] No ID collisions
- [ ] All adapters materialize independently

#### Hot Swap Stability Test
- [ ] Create patch with adapter
- [ ] Run normalization twice
- [ ] Verify adapter block ID is identical both times
- [ ] Verify continuity system can track adapter blocks

### Documentation

#### Adapter Registry Documentation
- [ ] adapters.ts has file header with spec reference
- [ ] Each adapter rule has comment explaining conversion semantics
- [ ] Table of 10 required adapters with from/to types
- [ ] Note about forbidden adapters (Phase01ToNorm01 disallowed)
- [ ] Example usage in comments or tests
- [ ] Link to spec document §B

## Exit Criteria (to reach next confidence level)

N/A - This is a HIGH confidence sprint, ready for implementation.

## Verification Commands

```bash
# Type check
npm run typecheck

# Run all tests
npm test

# Verify all 10 adapter blocks registered
grep -c "registerBlock.*Adapter" src/blocks/adapter-blocks.ts
# Should output: 10

# Verify adapter rules in registry
grep -c "blockType.*Adapter" src/graph/adapters.ts
# Should output: 10

# Run specific adapter test
npm test -- src/graph/passes/__tests__/pass2-adapters.test.ts

# Check for adapter block usage in normalized graphs
npm test -- --grep "adapter materialization"
```

## Definition of Complete

This sprint is complete when:
1. All 10 adapter blocks defined and registered
2. Adapter registry has unit-based rules
3. Pass2 materializes adapters as derived blocks
4. Adapter anchors generate stable IDs
5. Phase→radians end-to-end test passes
6. All verification commands pass
7. Code review confirms spec compliance with Part B
8. Documentation updated
