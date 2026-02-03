# Evaluation: Macro Lowering
Timestamp: 2026-02-03-022500
Git Commit: 8a2a062

## Executive Summary
Overall: 5% complete | Critical issues: 3 | Tests reliable: no (11 failures from DefaultSource gap)

The macro lowering system described in `01-macro-lowering.md` has almost zero implementation. The normalization pass (`normalize-default-sources.ts`) was partially updated to insert `DefaultSource` blocks as a fallback, but the `DefaultSource` block itself was never registered, creating 11 test failures. None of the three core design components (DefaultSource block, LowerSandbox, pure lowering contract) exist in code.

## Runtime Check Results
| Check | Status | Output |
|-------|--------|--------|
| `npm run test` | FAIL | 11 failures, 3 test files, all from `UnknownBlockTypeError: "DefaultSource" is not registered` |
| `npm run typecheck` | not run (no new types to check) | N/A |
| DefaultSource block registered | MISSING | `grep` for `registerBlock.*DefaultSource` returns nothing |
| HueRainbow block registered | MISSING | `grep` for `HueRainbow` returns nothing |
| LowerSandbox type exists | MISSING | `grep` for `LowerSandbox` returns nothing |
| loweringPurity on BlockDef | MISSING | `grep` for `loweringPurity` returns nothing |
| LowerEffects type exists | MISSING | No effects separation in LowerResult |

## Missing Checks
- Integration test: DefaultSource block compiles for float, vec2, color, bool types
- Integration test: DefaultSource with unresolved generic produces hard diagnostic error
- Integration test: Macro expansion of color default via real block lowerer
- Purity enforcement test: Run lower() twice with same inputs, compare output
- Contract test: LowerSandbox rejects allocSlot/allocStateSlot/stepXxx calls

## Findings

### 1. normalize-default-sources.ts (Fallback DefaultSource insertion)
**Status**: PARTIAL (broken)
**Evidence**: `src/compiler/frontend/normalize-default-sources.ts:199-205` creates `{ blockType: 'DefaultSource', output: 'out', params: {} }` as fallback. Line 232 calls `requireBlockDef(ins.block.type)` which throws because no such block is registered.
**Issues**:
- The normalization pass was updated to reference DefaultSource but the block was never created
- This causes 11 test failures across 3 test files
- Any graph with an unconnected input that lacks an explicit `defaultSource` in the registry will crash

### 2. DefaultSource Block Definition
**Status**: NOT_STARTED
**Evidence**: No file matching `*default-source*` or `*DefaultSource*` exists in `src/blocks/`. No `registerBlock` call for type `'DefaultSource'` anywhere.
**Issues**:
- The entire block (registration, type constraints, lower function, policy table) does not exist
- No `DefaultPlan`, `DefaultKey`, or policy table types exist in the codebase
- The design doc's example target `HueRainbow` block does not exist either

### 3. LowerSandbox (Constrained IR Builder)
**Status**: NOT_STARTED
**Evidence**: No file or type matching `LowerSandbox` anywhere in `src/`.
**Issues**:
- Current `LowerCtx.b` exposes the full `IRBuilder` (40+ methods including slot allocation, step registration, instance creation, render globals)
- Design doc requires a constrained subset: emitConst, emitOp, emitKernel, emitExtract, emitConstruct, readRail
- No mechanism exists to restrict what lower() functions can call

### 4. Pure Lowering Contract
**Status**: NOT_STARTED
**Evidence**: No `loweringPurity` field on `BlockDef` (checked `src/blocks/registry.ts`). No `LowerEffects` type. `LowerResult` has single-result model.
**Issues**:
- All 80+ blocks call `ctx.b.allocSlot()` inside their `lower()` function (132 total calls). This is a direct purity violation per the design doc.
- Slot allocation is the most pervasive impurity. The design doc says slot allocation should be an "effect" returned as data, handled by a separate compiler stage.
- Stateful blocks (unit-delay, phasor, lag, accumulator, sample-hold, slew) also call `ctx.b.allocStateSlot()` and `ctx.b.stepStateWrite()` inside lower().
- No enforcement mechanism exists (no ESLint rule, no proxy, no deepFreeze).

### 5. Current LowerResult vs Proposed Two-Result Model
**Status**: NOT_STARTED
**Evidence**: `src/blocks/registry.ts:88-104` defines `LowerResult` as `{ outputsById, instanceContext?, stateSlot? }`.
**Issues**:
- Design doc proposes: `exprOutputs: Record<PortId, ValueExprId>` (pure IR) + `effects?: LowerEffects` (state cell requests, kernel registrations)
- Current: `outputsById: Record<string, ValueRefExpr>` where `ValueRefExpr` includes `slot: ValueSlot` -- meaning slot allocation is baked INTO the output, not separated as an effect
- Migration path: Every block's lower() would need to stop allocating slots and instead return slot requirements as effects. This is a ~80 file change.

### 6. Existing Color Default Problem (Motivating Use Case)
**Status**: CONFIRMED
**Evidence**: The design doc states "Const(0) can't lower as color" -- confirmed: `src/blocks/signal/const.ts:141-148` requires `{r, g, b, a}` object for color payload, but a `Const(0)` block created by the old normalization path would pass `0` as value, hitting the `typeof val !== 'object'` error.
**Issues**:
- This is the motivating problem for the DefaultSource design
- Currently mitigated by the fact that most color inputs have explicit defaultSource in the registry (e.g., `FieldConstColor`, `ColorPicker`)
- But any NEW color input without explicit defaultSource would hit this

## Ambiguities Found
| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| Slot allocation migration | Should ALL blocks stop calling allocSlot(), or only DefaultSource-invokable (pure) blocks? | Not addressed - no implementation attempted | HIGH: 80+ files affected if full migration |
| HueRainbow block | What exactly IS HueRainbow? Design doc references it but it doesn't exist | Not addressed | MEDIUM: Need to define or pick existing block for color default |
| DefaultSource fallback scope | Should DefaultSource be the fallback for ALL unconnected inputs, or only those without registry defaultSource? | Code at line 201 makes it fallback for ALL, but the block doesn't exist | HIGH: Currently breaks all such inputs |
| readRail in LowerSandbox | What rails exist? Design mentions "phaseA", "palette" -- are these the IRBuilder.time() channels? | Not addressed | MEDIUM: Need to define rail mapping |
| Profile system | What profiles exist beyond "global"? How are profileIds assigned? | Not addressed | LOW: Can defer, use "global" only initially |

## Recommendations

1. **IMMEDIATE (P0): Register a minimal DefaultSource block** to unblock the 11 test failures. Even a stub that emits `Const(0)` for float and errors for unsupported types would stop the bleeding. The normalization pass already creates these blocks; they just need a definition.

2. **Define the implementation order**: The design doc describes three coupled systems. Recommended order:
   - Phase A: Register `DefaultSource` block with simple `chooseDefault()` policy table (const plans only, no macro expansion). Fixes test failures and handles the Const(0)-for-color problem.
   - Phase B: Add `loweringPurity` tag to `BlockDef`. Audit and tag all 80+ blocks. No runtime enforcement yet.
   - Phase C: Implement `LowerSandbox` as a restricted `IRBuilder` proxy. Wire it into DefaultSource's lower() for macro expansion.
   - Phase D: Migrate pure blocks to two-result model (exprOutputs + effects). This is the big migration.

3. **Create HueRainbow block** (or choose an existing block like `MakeColorHSL` as the color default target). The design doc's example can't work without this.

4. **Do NOT attempt the full pure lowering contract yet**. The `allocSlot()` calls in 80+ blocks are deeply embedded. Extracting them as effects is a major refactor that should be planned separately.

## Verdict
- [x] PAUSE - Ambiguities need clarification

### Questions Requiring Answers Before Implementation

1. **Scope of immediate fix**: Should the DefaultSource block be registered NOW as a minimal fix (const-only, no macro expansion) to unblock the 11 test failures? Or should we revert the normalize-default-sources.ts change that introduced the DefaultSource fallback?

2. **Color default target**: The design doc says "color -> invoke HueRainbow(phaseA)". HueRainbow doesn't exist. Should we:
   (a) Create a new HueRainbow block
   (b) Use existing `MakeColorHSL` block as the macro target
   (c) Use a simpler `Const({r:1,g:0,b:1,a:1})` fallback for now

3. **allocSlot migration scope**: The two-result model (exprOutputs + effects) requires blocks to stop calling allocSlot. Is this meant to be a full codebase migration, or only for blocks invoked as macros by DefaultSource?
