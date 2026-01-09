# Compilation Pipeline Evaluation

**Created:** 2026-01-09
**Scope:** `src/compiler/`, `src/core/canonical-types.ts`, design-docs
**Current Status:** Mixed - partial implementation with architectural gaps

---

## 1. WHAT EXISTS - Current Architecture

### Entry Points
- **Primary:** `src/compiler/compile.ts` - Main public API
- **Secondary:** `src/compiler/index.ts` - Type exports
- **Status:** Functional but simplified compared to spec

**Current Pipeline** (in `compile.ts`):
1. Normalize patch → dense block/edge indices
2. Find TimeRoot (single enforcer pattern)
3. Type check (strict validation)
4. Build dependency order (Kahn's topological sort)
5. Lower blocks in dependency order
6. Return CompiledProgramIR directly

**Issue:** This is a **linear monolithic pipeline**, not the multi-pass architecture described in the spec.

### IR Representations

**Authoritative Schema:** `src/compiler/ir/program.ts`
- CompiledProgramIR (v1) with dense arrays
- SlotMetaEntry with required offsets
- TypeDesc axes metadata on every slot
- DebugIndexIR for provenance

**Legacy Schema:** `src/compiler/ir/types.ts`
- IRProgram (deprecated, marked for removal)
- ReadonlyMaps for signals/fields/events
- Used by runtime as fallback

**Status:** Authoritative schema well-designed; migration in progress

### IR Builder

**Two implementations:**

1. **IRBuilder (Active):** `src/compiler/ir/builder.ts`
   - Concrete class used by `compile.ts`
   - Allocates typed slots with SignalType
   - Generates slotMeta with offsets
   - Has debug provenance tracking
   - **Issue:** Brand type mismatch (Map<number> vs ReadonlyMap<StepId>) - 1 type error

2. **IRBuilderImpl (Legacy):** `src/compiler/ir/IRBuilderImpl.ts`
   - Older interface-based pattern
   - Not actively used

**Status:** IRBuilder works but has 1 brand-type error preventing clean typecheck

### Block System

**Registry:** `src/compiler/blocks/registry.ts`
- Single global registry (good for ONE pattern)
- BlockDef interface: type, inputs[], outputs[], lower()
- ValueRef union type (sig | field | event | domain | scalar)
- Helper extraction functions (sig(), field(), domain())

**Blocks Implemented (25 total):**

| Category | Count | Examples | Status |
|----------|-------|----------|--------|
| Time | 2 | InfiniteTimeRoot, FiniteTimeRoot | Complete |
| Signal | 5 | ConstFloat, AddSignal, MulSignal, Oscillator, MousePosition | Complete |
| Domain | 5 | GridDomain, DomainN, FieldBroadcast, FieldMap, FieldZipSig | Complete |
| Render | 11 | RenderInstances2D, HueRainbow, FieldAdd, FieldPolarToCartesian, etc. | Complete |
| **Total** | **25** | | All migrated to SignalType |

### Type System

**Canonical Types:** `src/core/canonical-types.ts`
- 5-axis model: PayloadType × Extent (cardinality, temporality, binding, perspective, branch)
- SignalType as source of truth
- Helper factories: signalTypeSignal(), signalTypeField(), signalTypeStatic()
- Bridge functions for IR generation

**Type Checking:** `src/compiler/passes/TypeChecker.ts`
- SINGLE ENFORCER pattern implemented
- Validates all connections before lowering
- Handles DomainRef separately from SignalType
- Cardinality-based promotion rules (zero→one, one→many)

**Status:** Well-designed and enforced at compile entry point

### Tests

**Location:** `src/compiler/__tests__/`

**Current Coverage:**
- `compile.test.ts`: 49 tests (TimeRoot validation, signal compilation, domain compilation)
- `steel-thread.test.ts`: Integration test for full animated particles demo
- **Total:** 68+ tests passing

**Quality:** Tests verify behavior, not structure (good practice)

---

## 2. WHAT'S MISSING OR INCOMPLETE

### Critical Gaps - Spec vs Implementation

#### Gap 1: Multi-Pass Architecture (MAJOR)

**Spec Defines (from `04-compilation.md`):**
```
RawGraph → Normalization → NormalizedGraph → Compilation → CompiledProgramIR
```

Compilation has multiple passes:
- Pass 1: Normalization (explicit structure)
- Pass 2: Type Graph (signature resolution)
- Pass 3: Time Topology (TimeRoot extraction)
- Pass 4: Dependency Graph (topological order)
- Pass 5: SCC Validation (cycle detection)
- Pass 6: Block Lowering (IR generation)
- Pass 8: Link Resolution (connection wiring)

**Implementation:**
- Only simple linear pipeline in `compile.ts`
- `passes-v2/` directory exists with partially implemented passes
- **Status:** Excluded from build (`tsconfig.json`)

**Issue:** Spec-compliant multi-pass architecture is incomplete and not integrated.

#### Gap 2: Graph Normalization (MAJOR)

**What's Missing:**
- Default source materialization (spec §16)
- Bus/rail expansion (spec §03)
- Lens application
- Implicit block insertion
- Canonical type assignment

**Current State:**
- Simple normalize() in `src/graph/normalize.ts`
- Only handles dense indexing and validation
- Does NOT materialize derived blocks

**Impact:** Cannot handle complex patterns from spec

#### Gap 3: Error Handling & Recovery

**Current:**
- Throws on first error in some paths
- Limited error context
- No error aggregation strategy
- Error types scattered across files

**Missing:**
- Pass-level error collection
- Recovery strategies
- Diagnostic hints
- Source location tracking

#### Gap 4: Runtime Integration

**Current State:**
```javascript
// In main.ts - BROKEN
program.signals  // doesn't exist
program.fields   // doesn't exist
program.steps    // doesn't exist
program.slotCount // doesn't exist
```

**Issue:** Runtime still expects legacy IRProgram shape. CompiledProgramIR migration incomplete.

**Type Errors (7 total):**
- `src/compiler/ir/builder.ts(421)` - Brand type mismatch (StepId vs number)
- `src/main.ts(175,180)` - CompiledProgramIR properties don't exist
- `src/runtime/ScheduleExecutor.ts` - ValueSlot brand type issues

#### Gap 5: Combine Semantics (MEDIUM)

**Spec Defines:** Multiple combine modes (sum, average, max, min, last, product, overlay)

**Implementation:**
- CombineDebugIR tracks what happened
- No actual combine mode application logic
- Combine parameters exist but unused

**Issue:** Multi-writer inputs (buses/rails) not implemented

#### Gap 6: Schedule Representation (MEDIUM)

**Spec:** ScheduleIR is authoritative execution schedule
**Current:** ScheduleIR marked as `unknown`, uses legacy step wrapper

```typescript
export type ScheduleIR = unknown; // Still abstract!
```

**Missing:**
- Proper ScheduleIR definition
- Schedule generation from lowered IR
- Scheduling algorithm (ASAP vs ALAP)

#### Gap 7: Domain Unification (MEDIUM)

**Current:**
- Domains created but not unified across field expressions
- FieldExprSource has DomainId but field broadcast doesn't
- No domain compatibility checking

**Issue:** Fields with incompatible domains could connect undetected

#### Gap 8: Primitive Block Catalog (MINOR)

**Missing Blocks (from spec §08):**
- Statistical: Percentile, Quantile, Histogram
- Sampling: Sample, Resample, Interpolate
- Composition: CompositeSignal, CompositeField
- State: Latch, Counter, StateCell
- Advanced rendering: Mesh2D, Particles, Trail

**Current:** 25 basic blocks; catalog not complete

---

## 3. WHAT NEEDS CHANGES - Architecture Issues

### Issue 1: Monolithic vs Staged Pipeline

**Current:** Single-function compile() that does everything
**Problem:**
- Hard to reuse individual passes
- Difficult to test in isolation
- No clear contract between stages
- Debugging requires full recompile

**Recommendation:** Refactor to explicit stage functions:
```typescript
function compile(patch): Result<CompiledProgramIR> {
  const norm = normalize(patch);
  const typed = pass2TypeGraph(norm);
  const timed = pass3TimeTopology(typed);
  const deps = pass4DepGraph(timed);
  const acyclic = pass5CycleValidation(deps);
  const unlinked = pass6BlockLowering(acyclic);
  const linked = pass8LinkResolution(unlinked);
  return buildSchedule(linked);
}
```

### Issue 2: Unclear Pass Boundaries

**Current State:**
- normalize() is in `src/graph/` not `src/compiler/`
- TypeChecker is before lowering but not integrated into multi-pass
- Dependency order computed inline
- No explicit intermediate types

**Recommendation:**
- Move normalize to compiler pipeline
- Define explicit patch types: NormalizedPatch → TypedPatch → TimeResolvedPatch → ...
- Export from `src/compiler/passes/index.ts`

### Issue 3: Implicit Dependencies Between Passes

**Examples:**
- TypeChecker depends on getBlock() but doesn't import it
- Block lowering assumes topological order (computed but not validated)
- TimeRoot validation doesn't propagate time model to blocks

**Issue:** No contract enforcing correct sequencing

### Issue 4: ValueRef Type Ambiguity

**Current:**
```typescript
type ValueRef =
  | { kind: 'sig'; id: SigExprId; type: SignalType }
  | { kind: 'field'; id: FieldExprId; type: SignalType }
  | { kind: 'event'; id: EventExprId }
  | { kind: 'domain'; id: DomainId }
  | { kind: 'scalar'; value: number | string | boolean; type: SignalType }
```

**Problem:**
- 'event' doesn't carry type info
- 'scalar' and 'const' blur together
- No variance control

### Issue 5: Builder Type Unsafety

**Brand Type Issues:**
```typescript
// In IRBuilder.ts
private stepToBlock = new Map<number, BlockId>();  // should be Map<StepId, BlockId>
```

This violates the branded types and causes compilation errors.

### Issue 6: Debug Information Loss

**Current:**
- DebugIndexIR only tracks step→block, slot→block
- No port-level tracking
- No combine operation history
- No type resolution history

**Missing:** Source maps for UI

---

## 4. DEPENDENCIES AND RISKS

### Dependency Graph

```
compile()
  ├─ normalize() [src/graph/]
  ├─ findTimeRoot() [local]
  ├─ checkTypes() [src/compiler/passes/]
  │   ├─ getBlock() [registry]
  │   └─ getCanonicalConversion() [local]
  ├─ buildDependencyOrder() [local]
  └─ Block.lower() [registry]
      ├─ IRBuilder [src/compiler/ir/]
      └─ BlockDef ports [registry]

TypeChecker
  ├─ NormalizedPatch [src/graph/]
  └─ BlockDef [registry]

IRBuilder
  ├─ SignalType [src/core/]
  ├─ CompiledProgramIR [ir/program]
  └─ SlotMetaEntry [ir/program]
```

### Unstable Components (High Risk)

1. **passes-v2/** - Excluded from build, partial implementation
2. **IRBuilder brand types** - 1 compilation error
3. **Runtime integration** - 7 compilation errors, incompatible shapes
4. **ScheduleIR** - Still abstract, no implementation
5. **Domain handling** - Ad hoc, not unified

### Stable Components (Low Risk)

1. **Block registry** - Mature pattern, 25 blocks verified
2. **TypeChecker** - Well-isolated, good coverage
3. **CompiledProgramIR schema** - Authoritative and clean
4. **SignalType system** - Recent migration complete, 68 tests passing
5. **Test suite** - Good behavioral coverage

### Breaking Change Risks

- **Moving to multi-pass architecture** - Would require refactoring all block inputs/outputs
- **Changing block lowering interface** - All 25 blocks must update
- **ScheduleIR definition** - Affects runtime execution model
- **ValueRef unification** - Requires audit of all block implementations

---

## 5. AMBIGUITIES AND OPEN QUESTIONS

### Design Ambiguities

1. **Pass Integration:** Should passes-v2 be completed or replaced with current design?
2. **Error Collection:** When should compilation fail fast vs collect all errors?
3. **Default Sources:** How are implicit default source blocks materialized?
4. **Bus Semantics:** What is the exact combine mode application algorithm?
5. **Domain Unification:** What are the rules for field domain compatibility?
6. **Time Model:** How is TimeRoot information propagated to blocks?
7. **State Allocation:** How are state cells allocated in the schedule?

### Undefined Behavior

- What happens if multiple blocks produce outputs but only one is read?
- What happens if a field and signal with same payload connect via broadcast?
- How are circular time references handled (phase → oscillator → phase)?
- What is the order of evaluation for multi-input operations?

### Missing Documentation

- CompiledProgramIR contract (partially documented in program.ts comments)
- Block lowering contract (described in registry but not formal)
- Pass interface contracts (nonexistent for multi-pass)
- Schedule generation algorithm (undefined)
- Error severity levels (not categorized)

---

## 6. SPEC COMPLIANCE MATRIX

| Spec Section | Required | Implemented | Notes |
|--------------|----------|-------------|-------|
| 04-01: Overview | Yes | Partial | Linear pipeline instead of multi-pass |
| 04-02: NormalizedGraph | Yes | No | No materialization of derived blocks |
| 04-03: Compilation stages | Yes | Partial | 5 of 8 stages; passes-v2 incomplete |
| 04-04: Type unification | Yes | Partial | TypeChecker only; no unification pass |
| 04-05: Cycle detection | Yes | Partial | Integrated inline; not isolated pass |
| 04-06: Slot allocation | Yes | Yes | SlotMetaEntry with offsets |
| 04-07: Block lowering | Yes | Yes | 25 blocks working |
| 04-08: Link resolution | Yes | Partial | Not separated; integrated into lower |
| 04-09: Schedule generation | Yes | Partial | ScheduleIR still abstract |
| **Compliance** | | **~54%** | |

---

## 7. QUALITY ASSESSMENT

### Strengths
- Clean block registry pattern (ONE enforcer)
- Good type coverage (25 blocks, 68 tests)
- Authoritative IR schema well-designed
- Defensive type checking
- SignalType system implementation mature

### Weaknesses
- Multi-pass architecture incomplete
- No graph normalization (default sources, buses)
- Runtime integration broken (7 errors)
- Brand type inconsistencies
- Error handling ad hoc
- ScheduleIR still abstract

### Technical Debt
- 1 compilation error (IRBuilder brand type)
- 7 runtime integration errors
- passes-v2 dead code (excluded from build)
- Dual IR representations (legacy still in use)
- No test coverage for multi-pass (doesn't exist)

---

## SUMMARY

The compilation pipeline is **~50% complete** with strong fundamentals but significant architectural gaps. The current design is **pragmatic but incomplete** compared to the spec.

**Verdict: CONTINUE** - Enough clarity exists to plan the next sprint.

---

## RECOMMENDED PRIORITIES

### P0 - Critical (Must address)
1. Fix 8 compilation/brand type errors
2. Complete runtime integration (update main.ts, ScheduleExecutor.ts)
3. Define ScheduleIR properly
4. Integrate TypeChecker into linear pipeline

### P1 - Important (Should address)
1. Implement graph normalization (default sources, buses)
2. Separate passes into isolated functions with explicit contracts
3. Implement error collection strategy
4. Complete domain unification

### P2 - Medium (Could address)
1. Decide on passes-v2: complete it or delete it
2. Implement combine semantics
3. Add remaining primitive blocks (state, composition)
4. Comprehensive pass-level testing

### Architecture Recommendation
Keep the current **linear pragmatic pipeline** as the MVP but structure it with explicit stages (normalize → type → lower → schedule). Don't attempt the full 8-pass architecture until the linear version is stable and tested.
