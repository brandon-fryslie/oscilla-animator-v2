# Sprint: Core Infrastructure - Composite Block Foundation
Generated: 2026-01-27T15:01:00Z
Confidence: HIGH: 5, MEDIUM: 1, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Implement the foundational composite block system: type definitions, registry integration, and graph expansion pass.

## Scope
**Deliverables:**
- CompositeBlockDef type and registry integration
- Port mapping types and validation
- Graph expansion pass (pass0)
- Deterministic ID generation for expanded blocks
- Basic composite validation (no cycles, valid port mappings)

## Work Items

### P0: CompositeBlockDef Type System [HIGH]
**Acceptance Criteria:**
- [ ] CompositeBlockDef extends BlockDef with `form: 'composite'`
- [ ] InternalBlockDef type for blocks inside composite
- [ ] PortMapping type with source/target port references
- [ ] ExposedPort type with external name and internal mapping
- [ ] All types are exported from `src/blocks/`

**Technical Notes:**
```typescript
interface CompositeBlockDef extends BlockDef {
  form: 'composite';
  // The internal graph
  internalBlocks: ReadonlyMap<InternalBlockId, InternalBlockDef>;
  internalEdges: readonly InternalEdge[];
  // Port exposure
  exposedInputs: readonly ExposedInputPort[];
  exposedOutputs: readonly ExposedOutputPort[];
}

interface ExposedInputPort {
  externalId: string;        // Port ID visible to outside
  externalLabel?: string;    // Display name
  internalBlockId: string;   // Which internal block
  internalPortId: string;    // Which port on that block
}
```

### P1: Registry Integration [HIGH]
**Acceptance Criteria:**
- [ ] `registerBlock()` accepts CompositeBlockDef
- [ ] Composite blocks appear in `getAllBlocks()` with distinct category
- [ ] `getBlockDef()` returns CompositeBlockDef for composite types
- [ ] BlockForm type updated: `'primitive' | 'macro' | 'composite'`

**Technical Notes:**
- Composites don't have a `lower` function (they expand instead)
- Need `isComposite(def: BlockDef)` type guard
- Category should be 'composite' for grouping in UI

### P2: Composite Expansion Pass [HIGH]
**Acceptance Criteria:**
- [ ] New pass0-composite-expansion.ts runs before default-sources
- [ ] Composite blocks expand into multiple derived blocks
- [ ] Internal edges become real edges in expanded graph
- [ ] Exposed ports wire to external connections correctly
- [ ] Deterministic ID format: `_comp_{instanceId}_{internalId}`
- [ ] Derived block role: `{ kind: 'derived', meta: { kind: 'compositeExpansion', compositeDefId, compositeInstanceId } }`

**Technical Notes:**
- Iterate all blocks in patch
- For each composite block:
  1. Generate unique instance ID (from composite block's ID)
  2. Clone all internal blocks with prefixed IDs
  3. Clone all internal edges with remapped IDs
  4. Wire exposed inputs to external incoming edges
  5. Wire exposed outputs to external outgoing edges
- Return modified patch with composite removed, internal blocks added

### P3: State Key Generation [HIGH]
**Acceptance Criteria:**
- [ ] Internal stateful blocks get stable state keys
- [ ] State key format: `{compositeInstanceId}:{internalBlockId}:{primitiveKind}`
- [ ] State survives hot-swap when composite definition unchanged
- [ ] State resets when internal block structure changes

**Technical Notes:**
- StateId generation in `pass6-block-lowering.ts` must be composite-aware
- Need to pass composite path context through lowering
- LowerCtx may need `compositePath?: string[]` for nested composites

### P4: Composite Validation [HIGH]
**Acceptance Criteria:**
- [ ] Detect and reject circular composite references
- [ ] Validate all internal port references exist
- [ ] Validate exposed port mappings are valid
- [ ] Max nesting depth enforced (5 levels)
- [ ] Clear error messages with composite + internal block context

**Technical Notes:**
- Validation runs at registration time (early failure)
- Also runs during expansion (catches runtime issues)
- Use topological sort to detect cycles

### P5: Unit Tests [MEDIUM]
**Acceptance Criteria:**
- [ ] Type tests for CompositeBlockDef
- [ ] Registry tests for composite registration
- [ ] Expansion pass tests with various topologies
- [ ] State key tests for nested composites
- [ ] Validation tests for error cases

#### Unknowns to Resolve
- Exact test fixture format for composite definitions
- Whether to use snapshot testing for expansion output

#### Exit Criteria
- All test patterns established
- Coverage > 80% for new code

## Dependencies
- None (foundational work)

## Risks
- **Expansion complexity**: Internal edge remapping is tricky
  - Mitigation: Build incrementally, test each step
- **State key conflicts**: Nested composites could have ID collisions
  - Mitigation: Use full path in state key
