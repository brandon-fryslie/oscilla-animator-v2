# DEDUPLICATION & CLEANUP EVALUATION - 2026-01-12

Based on thorough investigation of the deduplication audit findings.

---

## CRITICAL FINDING #1: Duplicate Bridge Files

**Status:** READY TO FIX - Clear Winner Identified

**Analysis:**

1. **File inventory:**
   - `/src/compiler/ir/bridge.ts` - 160 lines, clean, higher-level API
   - `/src/compiler/ir/bridges.ts` - 263 lines, granular functions, more comprehensive

2. **Winner determination:**
   - `bridges.ts` is the actual implementation (newer, more complete)
   - `bridge.ts` is a simplified wrapper that re-exports from canonical-types
   - Git history shows: `bridge.ts` added first, then expanded to `bridges.ts`, then refactored
   - Tests import from `bridges.ts` (not `bridge.ts`)
   - **Winner: `bridges.ts`** (comprehensive, tested, currently used)

3. **What needs to happen:**
   - Delete `/src/compiler/ir/bridge.ts` entirely
   - Update exports in `/src/compiler/ir/index.ts` to export bridge functions from `bridges.ts`
   - Verify no production imports of `bridge.ts` exist (grep confirms none in non-test code)
   - Currently, neither file is exported from index.ts - both are island modules

**Risk Level:** LOW - No production imports, only test usage

---

## CRITICAL FINDING #2: Commented-Out Validation Block (lines 112-129)

**Status:** NEEDS INVESTIGATION - Context Unclear

**Analysis:**

1. **Location:** `/src/compiler/passes-v2/pass6-block-lowering.ts:112-129`

2. **What's blocked:**
   - 9 lines of identical TODO comments wrapping validation code
   - Code checks `modeValidation.valid` and throws PortTypeMismatch errors
   - All lines start with: `// TODO: Fix validation for new CanonicalType structure`

3. **Context investigation:**
   - The code surrounding it (lines 101-110) validates `combine` policy successfully
   - The commented block was supposed to validate "mode compatibility" between writers
   - No variable named `modeValidation` exists in current code
   - This suggests the validation was removed/refactored but code wasn't cleaned up

4. **Is validation needed?**
   - **UNCLEAR** - Specification would answer this
   - Current code validates combine policy (writer count vs. combine rule)
   - The commented code would have validated that all writers have compatible types
   - No evidence that type compatibility validation is happening elsewhere

**Risk Level:** MEDIUM - Missing validation silently, but system might catch errors later

**Blocker:** Need spec clarification on whether mode/type compatibility validation is required, or if combine policy validation is sufficient

---

## CRITICAL FINDING #3: Debug Console Statements

**Status:** READY TO FIX - Straightforward Cleanup

**Inventory:**
- `DiagnosticHub.ts`: 3 console.log statements (lines 172, 177, 186)
- `pass7-schedule.ts`: 3 console.warn statements (lines 127, 139, 143)
- `pass6-block-lowering.ts`: 1 console.debug statement (line 286)
- Total in src: ~40 console.* calls (grep count)

**Analysis:**
- These are debug statements left in place, not integrated with DiagnosticHub system
- Ironic: DiagnosticHub logs TO console instead of using its own diagnostic system
- pass7 uses console.warn instead of proper error accumulation
- Multiple calls use `[prefix]` pattern which suggests temporary instrumentation

**Recommendation:**
1. Remove the 7 identified statements in critical paths
2. Run full grep for remaining console.* statements in src
3. Most are likely safe to remove (temporary dev instrumentation)

**Risk Level:** LOW - Removing debug statements has no functional impact

---

## MAJOR FINDING #4: IRBuilderImpl State Methods

**Status:** SAFE TO REMOVE - Unused Interface Methods

**Evidence:**

1. **Methods in question:**
   ```typescript
   declareState(_id: StateId, _type: CanonicalType, _initialValue?: unknown): void {
     // TODO: Implement state declaration
   }
   readState(_id: StateId, type: CanonicalType): SigExprId {
     // TODO: Implement state reading
     return this.sigConst(0, type);  // Dummy return!
   }
   writeState(_id: StateId, _value: SigExprId): void {
     // TODO: Implement state writing
   }
   ```

2. **Interface requirements:** These methods DO exist in `IRBuilder.ts` interface (lines 199-206)

3. **Production usage:** ZERO grep hits for any calls to these methods outside of definition

4. **Alternative implementations:** IRBuilder has different state methods:
   - `allocStateSlot(initialValue?: number): StateSlotId` - exists, used
   - `sigStateRead(stateSlot: StateSlotId, type: CanonicalType): SigExprId` - exists, used
   - `stepStateWrite(stateSlot: StateSlotId, value: SigExprId): void` - exists, used

5. **Assessment:** The old interface (`declareState`, `readState`, `writeState`) was replaced by the new slot-based API (`allocStateSlot`, `sigStateRead`, `stepStateWrite`). The old methods are dead code.

**Decision:** REMOVE from both interface and implementation
- Delete from IRBuilder.ts interface
- Delete from IRBuilderImpl.ts implementation
- These are interface remnants from an earlier design that was superseded

**Risk Level:** VERY LOW - Nothing calls these methods

---

## MAJOR FINDING #5: Viewer Module Empty Shell

**Status:** SAFE TO DELETE - Dead Module

**Evidence:**

1. **Location:** `/src/viewer/index.ts` (single file, 9 lines total)

2. **Content:**
   ```typescript
   /**
    * Patch Viewer
    * Exports utilities for visualizing Patch graphs.
    * TODO: Implement new patch viewer based on reference implementation
    */
   // Placeholder - will be reimplemented with new UI features
   export {};
   ```

3. **Usage:** Zero imports of this module anywhere in codebase (grep confirmed)

4. **Directory:** `/src/viewer/` contains only `index.ts` - nothing else

5. **Assessment:**
   - Skeleton placeholder with no implementation
   - No imports anywhere
   - This was created as a forward-looking placeholder that never materialized

**Decision:** DELETE `/src/viewer/` directory entirely
- Not blocking anything
- No dependencies on it
- Taking up cognitive space in the architecture

**Risk Level:** ZERO - No dependencies

---

## MAJOR FINDING #6: Compile Pipeline Placeholder Functions

**Status:** BLOCKED - Unclear If Needed

**Location:** `/src/compiler/compile.ts`
- Line 151-155: `// TODO: Implement pass8LinkResolution`
- Line 241: `// TODO: Replace with real convertLinkedIRToProgram implementation`

**Analysis:**
- Pass 8 link resolution is TODOs, not implemented
- Final conversion from linked IR to program is a placeholder
- Pipeline apparently works around these somehow

**Assessment:** This likely works because:
- Pass 7 produces the schedule
- Pass 8 and final conversion may be deferred to Phase 2
- Need to check: Does the pipeline actually call these, or skip them?

**Blocker:** Need clarification on roadmap - is this intentionally deferred or accidentally forgotten?

**Risk Level:** MEDIUM - Could be silent incompleteness

---

## SUMMARY TABLE: Actionability & Risk

| Finding | Issue | Status | Blocker | Risk | Effort |
|---------|-------|--------|---------|------|--------|
| Bridge files | `bridge.ts` unused | **FIX NOW** | None | LOW | 30min |
| Validation block | Type compat unclear | **INVESTIGATE** | Spec needed | MEDIUM | 1hr |
| Console statements | 7 identified | **FIX NOW** | None | LOW | 20min |
| IRBuilder state methods | Deadcode | **FIX NOW** | None | VERY LOW | 15min |
| Viewer module | Empty shell | **DELETE NOW** | None | ZERO | 5min |
| Pipeline placeholders | Pass 8, conversion | **CLARIFY** | Roadmap | MEDIUM | varies |

---

## RECOMMENDED EXECUTION ORDER

**Phase 1 (Safe, no blockers) - Sprint 1:**
1. Delete `/src/compiler/ir/bridge.ts`
2. Remove console statements from critical paths
3. Delete state methods from IRBuilder + IRBuilderImpl
4. Delete `/src/viewer/` directory
5. Run full test suite to verify nothing broke

**Phase 2 (Needs clarification first) - Future:**
1. Spec review: Is type compatibility validation required? (for Finding #2)
2. Roadmap review: Pass 8 and final conversion status (for Finding #6)

---

## KEY AMBIGUITIES NEEDING RESOLUTION

1. **Combine mode validation (Finding #2):**
   - Question: Are types of multiple writers required to be compatible?
   - Current state: Only policy (count vs mode) is validated
   - Spec reference: Need to check `design-docs/spec/` for combine semantics

2. **Pass 8 & final conversion (Finding #6):**
   - Question: Are these intentionally deferred or forgotten?
   - Current evidence: Pipeline seems to skip them
   - Impact: Could affect correctness of final IR
