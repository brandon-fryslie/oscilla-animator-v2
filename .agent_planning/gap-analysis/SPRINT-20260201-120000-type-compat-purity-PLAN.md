# Sprint: Type-Compat-Purity - Remove Block-Name Exceptions from isTypeCompatible

Generated: 2026-02-01T12:00:00Z
Confidence: HIGH: 1, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY
Source: EVALUATION-20260201-120000.md

## Sprint Goal

Make `isTypeCompatible` a pure function of `(CanonicalType, CanonicalType) => boolean` by removing all block-name-based cardinality exceptions and moving that logic to the type inference or normalization layer.

## Scope

**Deliverables:**
- Remove `sourceBlockType` and `targetBlockType` parameters from `isTypeCompatible`
- Resolve cardinality-generic block compatibility through the type system (not block-name lookups)
- Resolve cardinality-preserving block output types through the type system
- Un-skip the isTypeCompatible purity enforcement test from Sprint A
- All existing tests pass with the new pure type compatibility logic

## Work Items

### P0: Remove Block-Name Parameters from isTypeCompatible [HIGH]

**Dependencies**: Cardinality resolution strategy (see MEDIUM items below)
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #6, Guardrail #12 | **Status Reference**: SUMMARY.md P1 #1, critical/topic-compiler-adapters.md GAP #1

#### Description
The function signature at `src/compiler/frontend/analyze-type-graph.ts:55` currently accepts optional `sourceBlockType` and `targetBlockType` parameters. These must be removed to make type compatibility purely type-driven.

The function body has two block-name-based exceptions:
1. **Lines 79-86**: Cardinality-generic blocks (target) - allows cardinality mismatch if target block has broadcastPolicy `allowZipSig` or `requireBroadcastExpr`
2. **Lines 88-97**: Cardinality-preserving blocks (source) - allows `one->many` if source block has `cardinalityMode === 'preserve'`

Both exceptions must be removed from `isTypeCompatible` and the underlying problem solved upstream (in type inference or normalization).

#### Acceptance Criteria
- [ ] `isTypeCompatible` signature is `(from: CanonicalType, to: CanonicalType) => boolean`
- [ ] No imports of `getBlockCardinalityMetadata` or `isCardinalityGeneric` in `analyze-type-graph.ts`
- [ ] The call site at line 182 passes only `(fromType, toType)` -- no block type strings
- [ ] Enforcement test from Sprint A un-skipped and passes
- [ ] All existing compilation tests pass

#### Technical Notes
This is the mechanical part. The hard part is ensuring the MEDIUM items below provide correct cardinality information so that pure type comparison works.

---

### P1: Resolve Cardinality-Generic Block Compatibility [MEDIUM]

**Dependencies**: Decision #6 (cardinality polymorphism strategy) from SUMMARY.md P3
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #6, Guardrail #9 | **Status Reference**: SUMMARY.md P3 #6, to-review/topic-compiler-adapters.md

#### Description
Cardinality-generic blocks (Mul, Add, Sin, etc.) currently accept both signal (cardinality=one) and field (cardinality=many) inputs. The block registry marks them with `cardinalityMode: 'preserve'` and `laneCoupling: 'laneLocal'`. Today, `isTypeCompatible` allows cardinality mismatches by checking these metadata fields.

The fix requires one of these approaches:

**Option A: Type Inference Resolves Cardinality** (Recommended)
- In Pass 1, when a cardinality-generic block has mixed-cardinality inputs, resolve all inputs to `many` (broadcast semantics)
- The type solver propagates the resolved cardinality to output ports
- By the time Pass 2 runs, all types have concrete cardinality and pure comparison works

**Option B: Normalization Inserts Broadcast Adapters**
- During graph normalization (before compilation), detect cardinality mismatches on cardinality-generic block inputs
- Insert explicit Broadcast adapter blocks to convert `one -> many`
- All edges then have matching cardinality

**Option C: Cardinality Variables in Type System**
- Cardinality-generic blocks declare cardinality type variables
- Type solver unifies variables with concrete values from connected edges
- Most principled but highest implementation effort

#### Acceptance Criteria
- [ ] Chosen approach documented with rationale
- [ ] Cardinality-generic blocks (Mul, Add, Sin, etc.) compile correctly with mixed signal+field inputs
- [ ] No block-name lookups in type compatibility logic
- [ ] Test: signal -> cardinality-generic -> field chain compiles without error
- [ ] Test: field -> cardinality-generic -> signal chain produces appropriate error or adapter

#### Unknowns to Resolve
1. **Which approach?** - Need user decision on #6 (cardinality polymorphism strategy). Option A is simplest but may mask errors. Option B is most explicit. Option C is most principled.
2. **Broadcast semantics** - When a cardinality-generic block receives mixed inputs, does the signal get broadcast to match the field, or is this an error?
3. **Output cardinality** - For cardinality-preserving blocks, does the output always match the "widest" input cardinality?

#### Exit Criteria (to reach HIGH confidence)
- [ ] User has decided cardinality polymorphism strategy (#6)
- [ ] Chosen approach has been prototyped and tested with at least 3 mixed-cardinality graphs
- [ ] Edge cases documented: all-signal, all-field, mixed, nested cardinality-generic chains

---

### P1: Resolve Cardinality-Preserving Block Output Types [MEDIUM]

**Dependencies**: Cardinality-generic resolution above
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #9 | **Status Reference**: SUMMARY.md P1 #1, critical/topic-compiler-adapters.md lines 88-97

#### Description
Cardinality-preserving blocks (e.g., Mul) have static output type `cardinality: one` (signal) in their BlockDef, but at runtime they adapt output cardinality to match input cardinality. The current workaround (lines 88-97) allows `one->many` in `isTypeCompatible` if the source block is cardinality-preserving.

The fix: Pass 1 type inference should resolve the output cardinality of cardinality-preserving blocks based on their inputs. If any input is `many`, the output should also be `many` with the same instance reference.

This is closely related to the cardinality-generic resolution above and will likely be solved by the same mechanism.

#### Acceptance Criteria
- [ ] Cardinality-preserving block outputs have correct resolved cardinality in `portTypes`
- [ ] No `sourceBlockType` parameter needed in type compatibility
- [ ] Test: cardinality-preserving block with field input produces field output type
- [ ] Test: cardinality-preserving block with signal input produces signal output type

#### Unknowns to Resolve
1. **Instance propagation** - When a cardinality-preserving block outputs `many`, which instance ID does it carry? Must match the input's instance.
2. **Multiple field inputs** - What if a cardinality-preserving block has two field inputs with different instances? Error or pick one?

#### Exit Criteria (to reach HIGH confidence)
- [ ] Instance propagation rule defined and tested
- [ ] Multi-field-input case handled (error or documented policy)

## Dependencies
- Sprint A (housekeeping): enforcement tests must exist first
- User decision #6 (cardinality polymorphism strategy): blocks the MEDIUM items

## Risks
- **Risk**: Changing type inference for cardinality-generic blocks may break existing graphs. **Mitigation**: Run full test suite; add regression tests for current working graphs before making changes.
- **Risk**: Multiple valid approaches with different tradeoffs. **Mitigation**: Prototype Option A first (simplest); if insufficient, escalate to Option B.
- **Risk**: Instance propagation through cardinality-preserving chains is subtle. **Mitigation**: Add explicit test cases for chains of 2+ cardinality-preserving blocks.
