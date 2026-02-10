# Nullish Coalescing Fix - Implementation Progress

**Date**: 2026-02-09
**Team**: nullish-coalescing-fix
**Objective**: Eliminate all bug-hiding `??` patterns in block lowering code

---

## Completion Status

- [x] **Phase 0**: Infrastructure (team-lead) ✅ COMPLETE
- [x] **Phase 1**: Config-only blocks (phase1-agent) ✅ COMPLETE
- [x] **Phase 2**: Shape blocks (phase2-agent) ✅ COMPLETE
- [x] **Phase 3**: Compile-time inputs (phase3-agent) ✅ COMPLETE
- [x] **Phase 4**: Remove block from LowerArgs (team-lead) ✅ COMPLETE
- [x] **Phase 5**: Remaining audit items (team-lead) ✅ COMPLETE
- [x] **Phase 6**: Forbidden pattern enforcement (team-lead) ✅ COMPLETE

---

## Phase 0: Infrastructure ✅

**Files Modified:**
- `src/blocks/registry.ts` - Added `requireConfig()`, `requireConfigInt()`, `requireConfigEnum()`
- `src/blocks/lower-utils.ts` - Added `resolveInputConstant()`
- `src/compiler/backend/lower-blocks.ts` - Added config/input overlap validation
- `src/compiler/frontend/index.ts` - Added post-normalization wiring validation
- `src/blocks/math/expression.ts` - Temporary defensive `config ?? {}`
- `src/blocks/shape/ellipse.ts` - Temporary `?? 1.0` fallback (removed in Phase 2)

**Verification:**
- ✅ Type check passes (`npm run typecheck`)
- ✅ Tests pass (`src/blocks/__tests__/registry-require.test.ts`)

**Key Invariants Enforced:**
1. Config validation helpers replace all `(config?.field as T)` patterns
2. Hard error if key appears in both `config` and `inputsById`
3. Hard error if `exposedAsPort: false` input missing from config
4. Frontend validates all required inputs are wired after normalization

---

## Phase 1: Config-Only Blocks 🔄

**Agent**: phase1-agent
**Status**: In progress

**Files to Fix:**
- `src/blocks/signal/lag.ts` (smoothing, initialValue)
- `src/blocks/signal/phasor.ts` (initialPhase)
- `src/blocks/signal/unit-delay.ts` (initialValue)
- `src/blocks/event/sample-hold.ts` (initialValue)
- `src/blocks/io/external-input.ts` (channel)
- `src/blocks/io/external-gate.ts` (channel, threshold)
- `src/blocks/io/external-vec2.ts` (channelBase)
- ~~`src/blocks/math/expression.ts`~~ (already done in Phase 0)

**Pattern**: Replace `(config?.field as T)` with `requireConfig<T>(cfg, 'field', 'typename')`

---

## Phase 2: Shape Blocks (Remove Dead Fallback Code) 🔄

**Agent**: phase2-agent
**Status**: In progress

**Files to Fix:**
- `src/blocks/shape/ellipse.ts` (rx, ry, rotation)
- `src/blocks/shape/rect.ts` (width, height, rotation, cornerRadius)
- `src/blocks/shape/procedural-star.ts` (outerRadius, innerRadius)
- `src/blocks/shape/procedural-polygon.ts` (radiusX, radiusY)

**Pattern**: Remove entire `if (input) { use input } else { read defaultSource }` blocks. After Phase 0C, all exposed ports are guaranteed wired.

---

## Phase 3: Compile-Time Inputs 🔄

**Agent**: phase3-agent
**Status**: In progress

**Files to Fix:**
- `src/blocks/signal/oscillator.ts` (mode → exposedAsPort: false)
- `src/blocks/signal/camera-projection-const.ts` (value → exposedAsPort: false)
- `src/blocks/shape/procedural-star.ts` (points → use resolveInputConstant)
- `src/blocks/shape/procedural-polygon.ts` (sides → use resolveInputConstant)
- `src/blocks/field/reduce.ts` (add missing InputDef for op)
- `src/blocks/instance/array.ts` (count → use resolveInputConstant)
- `src/blocks/domain/stable-id-hash.ts` (remove dead config?.seed)

**Pattern**: Inputs used in compile-time structural decisions must be config-only or resolved to constants.

---

## Phase 4: Remove `block` from LowerArgs ⏸️

**Blocked by**: Phases 1-3 must complete first
**Status**: Not started

**Files to Modify:**
- `src/blocks/registry.ts` - Remove `block` field, make `config` required
- `src/compiler/backend/lower-blocks.ts` - Remove `block` from lower() call, refactor `getPortConstValue()`

**Verification**: Grep for remaining `block` references in `src/blocks/`

---

## Phase 5: Remaining Audit Items ⏸️

**Status**: Ready (independent work)

**Files to Fix:**
1. `src/services/mapDebugEdges.ts` (lines 168, 220) - throw on missing meta
2. `src/ui/graphEditor/nodeDataTransform.ts` (lines 178-181, 203-206) - typed PortTypeStatus
3. `src/ui/reactFlowEditor/typeValidation.ts` (lines 212-215, 232-235) - console.error
4. `src/ui/components/BlockInspector.tsx` (lines 1267-1279) - typed status
5. `src/stores/StepDebugStore.ts` (line 662) - exhaustive throw

**Pattern**: Replace silent fallbacks with explicit error states or typed status objects.

---

## Phase 6: Forbidden Pattern Enforcement ⏸️

**Blocked by**: Phase 4 must complete first
**Status**: Not started

**File to Modify:**
- `src/__tests__/forbidden-patterns.test.ts`

**Patterns to Enforce:**
1. No `config?.` in block lower() functions
2. No `block.inputPorts` access in block lowering
3. No `defaultSource` reads in lowering code

**Pattern**: Grep-based tests with `// OK: <reason>` escape hatch for false positives.

---

## Final Verification Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds
- [ ] `npm run dev` - demo patch compiles and runs
- [ ] No new errors/warnings in browser console
- [ ] Forbidden pattern tests enforce new rules

---

## Design Decisions

1. **Why make `config` non-optional?** - Caller must be explicit. `requireConfig()` validates required keys exist.
2. **Why remove `block` entirely?** - Enforces frontend/backend boundary. Backend sees only normalized artifacts.
3. **Why `exposedAsPort: false` for compile-time inputs?** - Makes constraint explicit. Can't wire runtime signals to structural parameters.
4. **Why typed `PortTypeStatus`?** - UI can render unresolved state instead of pretending types are resolved.

---

## Laws Enforced

- **[LAW:dataflow-not-control-flow]** - Validation always runs; results are data, not control flow branching
- **[LAW:one-source-of-truth]** - Each key has exactly ONE source (config XOR inputsById)
- **[LAW:single-enforcer]** - Config validation in one place (`requireConfig` helpers)
- **[LAW:verifiable-goals]** - All goals have machine-verifiable success criteria (type check, tests, grep)
