# Sprint: adapter-registry - Adapter Registry and Graph Normalization
Generated: 2026-01-22-120534
Confidence: HIGH
Status: READY FOR IMPLEMENTATION (after unit-system sprint)
Source: Spec: 0-Units-and-Adapters.md Part B

## Sprint Goal
Implement the closed adapter registry with all required adapters from the spec, and extend graph normalization to materialize adapters as derived blocks with stable IDs, so the compiler sees only blocks and edges with no implicit conversions.

## Scope

**Deliverables:**
- Closed adapter registry with 10 required adapters (phase/angle + time + normalization)
- Adapter block definitions in blocks registry
- Graph normalization pass to materialize adapters as derived blocks
- Stable adapter anchor format: `adapter:in:<blockId>:<portId>:<edgeId>:<adapterKind>`
- DerivedBlockMeta variant for adapters

**Out of Scope:**
- Editor UI for adapter attachment (Sprint 3)
- Auto-detection/insertion logic (Sprint 3)
- User-facing adapter visibility (Sprint 3)

## Work Items

### P0: Define Adapter Block Definitions

**Dependencies**: Sprint 1 (unit-system) complete
**Spec Reference**: 0-Units-and-Adapters.md §B4.1 • **Status Reference**: No adapter blocks exist yet

#### Description
Create block definitions for all 10 required adapters in the spec. Each adapter is a normal block with one input, one output, and unit conversion semantics. These blocks are registered in the block registry like any other primitive.

#### Acceptance Criteria
- [ ] PhaseToScalar01 block: float:phase01 → float:scalar (identity mapping, semantic boundary only)
- [ ] ScalarToPhase01 block: float:scalar → float:phase01 (wrap01 semantics)
- [ ] PhaseToRadians block: float:phase01 → float:radians (multiply by 2π)
- [ ] RadiansToPhase01 block: float:radians → float:phase01 (divide by 2π, wrap01)
- [ ] DegreesToRadians block: float:degrees → float:radians (multiply by π/180)
- [ ] RadiansToDegrees block: float:radians → float:degrees (multiply by 180/π)
- [ ] MsToSeconds block: int:ms → float:seconds (divide by 1000)
- [ ] SecondsToMs block: float:seconds → int:ms (multiply by 1000, round)
- [ ] ScalarToNorm01Clamp block: float:scalar → float:norm01 (clamp to [0,1])
- [ ] Norm01ToScalar block: float:norm01 → float:scalar (identity)
- [ ] All blocks registered in block registry with category 'adapter'
- [ ] Each block has correct capability: 'pure' (no time/state/identity)
- [ ] Each block has form: 'primitive' (lowest level, no expansion)

#### Technical Notes
These blocks are PRIMITIVES - they lower directly to IR without macro expansion. Use OpCode operations where possible:
- PhaseToScalar01: no-op at IR level (y = x)
- ScalarToPhase01: OpCode.wrap01
- PhaseToRadians: OpCode.mul(x, 6.283185307179586)
- RadiansToPhase01: OpCode.mul(OpCode.wrap01(OpCode.div(x, 6.283185307179586)))
- Clamp: OpCode.clamp(x, 0, 1)

---

### P0: Extend Adapter Registry with Unit-Based Rules

**Dependencies**: Define Adapter Block Definitions
**Spec Reference**: 0-Units-and-Adapters.md §B4 • **Status Reference**: adapters.ts has basic cardinality rules only

#### Description
Update the adapter registry to include unit-based conversion rules. Add all 10 required adapters as registry entries with precise from/to unit signatures.

#### Acceptance Criteria
- [ ] AdapterSpec updated to include unit-based matching (not just cardinality)
- [ ] TypeSignature includes unit field
- [ ] 10 adapter rules added to ADAPTER_RULES array
- [ ] Each rule specifies exact from/to (payload, unit) pairs
- [ ] findAdapter() matches on payload AND unit
- [ ] Existing cardinality adapter (Broadcast) coexists with unit adapters
- [ ] Order matters: more specific rules before general rules

#### Technical Notes
Example rule structure:
```typescript
{
  from: { payload: 'float', unit: 'phase01', cardinality: 'any', temporality: 'continuous' },
  to: { payload: 'float', unit: 'radians', cardinality: 'any', temporality: 'continuous' },
  adapter: {
    blockType: 'PhaseToRadians',
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Convert phase [0,1) to radians [0,2π)',
  },
}
```

Adapters are cardinality-preserving (spec §B6) so cardinality can be 'any' in rules.

---

### P0: Add DerivedBlockMeta Variant for Adapters

**Dependencies**: None (type system extension)
**Spec Reference**: 0-Units-and-Adapters.md §B3.1 • **Status Reference**: types/index.ts has DerivedBlockMeta for defaultSource only

#### Description
Extend the DerivedBlockMeta discriminated union to include an 'adapter' variant. This enables derived blocks to track that they were materialized from port adapters rather than default sources.

#### Acceptance Criteria
- [ ] DerivedBlockMeta union includes `{ kind: 'adapter'; edgeId: string; adapterType: string }`
- [ ] Existing 'defaultSource' variant unchanged
- [ ] Type exports from types/index.ts
- [ ] BlockRole with derived + adapter meta is valid
- [ ] Pass1 default sources unchanged by this addition

#### Technical Notes
The adapter meta needs to track the original edge ID for stable anchor generation. Example:
```typescript
export type DerivedBlockMeta =
  | { kind: 'defaultSource'; target: { kind: 'port'; port: { blockId: BlockId; portId: PortId } } }
  | { kind: 'adapter'; edgeId: string; adapterType: string };
```

---

### P1: Implement Adapter Anchor Generation

**Dependencies**: Add DerivedBlockMeta Variant for Adapters
**Spec Reference**: 0-Units-and-Adapters.md §B3.2 • **Status Reference**: pass1-default-sources.ts has anchor pattern for default sources

#### Description
Create deterministic anchor-based ID generation for adapter blocks. Adapters must have stable IDs so state migration and continuity work correctly across hot swaps.

#### Acceptance Criteria
- [ ] Function generateAdapterAnchor(edgeId: string, adapterType: string): string implemented
- [ ] Anchor format: `adapter:<edgeId>:<adapterType>`
- [ ] Anchor-to-BlockId conversion (same pattern as default source IDs)
- [ ] Stable: same edge + same adapter type = same BlockId every time
- [ ] Deterministic across sessions
- [ ] No collisions with user block IDs (use prefix)

#### Technical Notes
Adapters don't need input/output side distinction in anchor because they're always inserted inline on the edge. The edgeId already uniquely identifies the connection point.

---

### P1: Extend Pass2 to Materialize Adapters as Derived Blocks

**Dependencies**: Extend Adapter Registry, Add DerivedBlockMeta Variant, Implement Adapter Anchor Generation
**Spec Reference**: 0-Units-and-Adapters.md §B3.3 • **Status Reference**: pass2-adapters.ts currently just validates, doesn't insert

#### Description
Modify graph normalization Pass2 to materialize adapters as derived blocks. When an edge has a type mismatch and an adapter exists, insert a derived block and split the edge into two edges (source → adapter → target).

#### Acceptance Criteria
- [ ] Pass2 inserts adapter blocks when findAdapter() returns a spec
- [ ] Adapter block has role: { kind: 'derived', meta: { kind: 'adapter', edgeId, adapterType } }
- [ ] Adapter block has stable ID from anchor
- [ ] Original edge replaced with two edges: source→adapter and adapter→target
- [ ] Edge IDs are deterministic (based on adapter anchor)
- [ ] Adapter blocks have ports matching block definition
- [ ] Normalization result includes adapter blocks in blocks map
- [ ] Pass3 indexing sees adapter blocks as normal blocks

#### Technical Notes
Materialization wiring (spec §B3.3):
- Original edge: A.out → B.in
- If adapter needed at B.in:
  - Edge 1: A.out → Adapter.in
  - Edge 2: Adapter.out → B.in
  - Adapter block has ID from anchor

Handle multiple adapters per edge later (not v2.5 requirement).

---

### P2: Add Adapter Diagnostics

**Dependencies**: Extend Pass2 to Materialize Adapters
**Spec Reference**: 0-Units-and-Adapters.md §B7 • **Status Reference**: pass2-adapters.ts has basic error types

#### Description
Extend normalization diagnostics to report adapter-specific errors clearly. Users should know when an adapter is invalid or missing.

#### Acceptance Criteria
- [ ] UNKNOWN_ADAPTER_KIND diagnostic when adapter references non-existent block type
- [ ] ADAPTER_TYPE_MISMATCH when adapter doesn't match actual source/target types
- [ ] ADAPTER_CARDINALITY_MISMATCH when adapter used on incompatible cardinalities
- [ ] All diagnostic codes in diagnostics/types.ts
- [ ] Diagnostics include edge ID, block IDs, and type details
- [ ] Clear messages: "No adapter found to convert float:phase01 to float:radians"

#### Technical Notes
These diagnostics are normalization-time, not compile-time. The compiler should never see invalid adapters because normalization catches them first.

---

### P2: Test Adapter Materialization End-to-End

**Dependencies**: Extend Pass2 to Materialize Adapters, Define Adapter Block Definitions
**Spec Reference**: 0-Units-and-Adapters.md §B8 • **Status Reference**: No adapter tests exist yet

#### Description
Create comprehensive tests that verify adapters are materialized correctly during normalization and behave correctly during compilation and runtime.

#### Acceptance Criteria
- [ ] Test: PhaseToRadians adapter inserted when oscillator connects to field polar layout
- [ ] Test: Adapter block appears in normalized graph with correct ID
- [ ] Test: Adapter block has correct DerivedBlockMeta
- [ ] Test: Original edge replaced with two edges
- [ ] Test: Compilation succeeds with adapter present
- [ ] Test: Runtime produces correct converted values (phase * 2π = radians)
- [ ] Test: Multiple adapters on same patch don't collide
- [ ] Test: Hot swap preserves adapter blocks (stable IDs)
- [ ] Test: No adapter inserted when types already match

#### Technical Notes
Focus on the "phase → radians" case as the primary use case. This is the bug the spec is designed to prevent.

Test structure:
1. Create raw patch with mismatched connection
2. Run normalization
3. Verify adapter block exists
4. Verify edges are split correctly
5. Run compiler
6. Verify IR includes adapter operation
7. Run runtime
8. Verify output values are correct

---

### P3: Update Adapter Registry Documentation

**Dependencies**: All P0-P2 complete
**Spec Reference**: 0-Units-and-Adapters.md entire Part B • **Status Reference**: adapters.ts has minimal comments

#### Description
Document the adapter registry clearly so future maintainers understand the closed set, the matching rules, and how to add adapters if the spec changes.

#### Acceptance Criteria
- [ ] File header explains adapter registry purpose and spec reference
- [ ] Each adapter rule has comment explaining conversion semantics
- [ ] Table of required adapters with from/to types and semantics
- [ ] Note about forbidden adapters (e.g., Phase01ToNorm01)
- [ ] Examples of adapter usage in tests or comments
- [ ] Link to spec document

#### Technical Notes
This is internal documentation for developers, not user-facing. Focus on "why this adapter exists" and "what conversion it performs".

---

## Dependencies

```
Sprint 1 (unit-system) COMPLETE
  └─> P0: Define Adapter Block Definitions
      └─> P0: Extend Adapter Registry with Unit-Based Rules
  └─> P0: Add DerivedBlockMeta Variant for Adapters
      └─> P1: Implement Adapter Anchor Generation
          └─> P1: Extend Pass2 to Materialize Adapters
              └─> P2: Add Adapter Diagnostics
              └─> P2: Test Adapter Materialization End-to-End

P3: Update Adapter Registry Documentation (depends on all P0-P2)
```

## Risks

1. **Adapter Block Lower Functions**: Each adapter needs correct IR lowering
   - Mitigation: Start with simple adapters (identity, multiply by constant)
   - Mitigation: Reuse existing OpCodes where possible

2. **Edge ID Stability**: Adapter anchors depend on edge IDs being stable
   - Mitigation: Verify edge ID generation is deterministic in Pass1-Pass2
   - Mitigation: Test hot swap scenarios

3. **Cardinality Preservation**: Adapters must work for both Signal and Field
   - Mitigation: Spec requires adapters to be cardinality-generic
   - Mitigation: Test both Signal→Signal and Field→Field with adapters

4. **Multiple Adapters**: Spec allows two adapters per edge (one each end)
   - Mitigation: Not required for v2.5, defer to future sprint
   - Mitigation: Current design supports it via chain

## Success Criteria

- [ ] All 10 required adapter blocks registered and functional
- [ ] Adapter registry includes unit-based rules
- [ ] Pass2 materializes adapters as derived blocks with stable IDs
- [ ] Phase→radians conversion works end-to-end (test case passes)
- [ ] No implicit conversions remain (compiler rejects unmatched types)
- [ ] Adapter diagnostics are clear and helpful
- [ ] Tests cover all adapter types and edge cases
- [ ] Documentation explains adapter system clearly
