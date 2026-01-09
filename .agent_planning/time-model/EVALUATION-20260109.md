# TIME-MODEL EVALUATION: Current State vs. Spec

**Generated**: 2026-01-09T07:15:00Z
**Status**: EVALUATION COMPLETE
**Focus**: TimeRoot, Phase System, Rails, Hot-Swap Behavior

---

## Executive Summary

The time-model implementation is **60% complete** with strong foundational pieces in place but critical gaps in phase system semantics, rail definitions, and hot-swap continuity. The architecture is sound but requires:

1. **Phase Arithmetic Rules** - Type-safe phase operations (+ float only, not phase + phase)
2. **Rail System** - Derived blocks for `phaseA`, `phaseB`, `pulse`, `palette` (not yet implemented)
3. **Phase Continuity** - Mechanism to match phase across recompilation without discontinuity
4. **Phase Helper Functions** - PhaseToFloat, FloatToPhase, PhaseDistance (not yet implemented)

**Verdict: READY FOR PLANNING** - All dependencies are satisfied (IR-5-axes is complete). No blockers.

---

## Current State: What Exists

### 1. TimeRoot Implementation (COMPLETE)

**Files**:
- `src/compiler/blocks/time/InfiniteTimeRoot.ts` (52 lines)
- `src/compiler/blocks/time/FiniteTimeRoot.ts` (65 lines)
- `src/compiler/passes-v2/pass3-time.ts` (241 lines)

**Status**: FUNCTIONAL
- Supports both `InfiniteTimeRoot` and `FiniteTimeRoot` block types
- `InfiniteTimeRoot` outputs: `t` (float), `dt` (float), `phase` (phase), `pulse` (event), `energy` (float)
- `FiniteTimeRoot` outputs: `t` (float), `dt` (float), `progress` (float), `phase` (phase), `pulse` (event), `energy` (float)
- Pass 3 correctly finds exactly one TimeRoot and extracts time model
- Default periods: 4000ms (infinite), 10000ms (finite)
- **DEVIATION**: Using `energy` (wrap count) instead of `phaseA`/`phaseB` dual phase rails

**Issues Identified**:
- Only single phase output, not dual (`phaseA`, `phaseB`) as per spec
- No configurable period for phase generation (tied to `periodMs`)
- Spec requires three phase sources (tMs, phaseA, phaseB); implementation has only t and phase

### 2. Phase Type System (COMPLETE)

**Files**:
- `src/core/canonical-types.ts` (583 lines)
- `src/core/__tests__/canonical-types.test.ts`

**Status**: FOUNDATIONAL
- `PayloadType` includes `'phase'` as explicit type
- Phase semantics documented (values in [0, 1) with wrap)
- Type system defines SignalType with payload + extent axes
- All 5 axes present: Cardinality, Temporality, Binding, Perspective, Branch

**Coverage**:
- Phase as first-class PayloadType
- 5-axis extent system ready
- Phase arithmetic rules NOT enforced in type system
- Phase wrap semantics NOT implemented in runtime
- Phase continuity tracking NOT present

### 3. Time Resolution (PARTIAL)

**Files**:
- `src/runtime/timeResolution.ts` (144 lines)

**Status**: FUNCTIONAL for basic time models
- Handles three TimeModel kinds: `finite`, `cyclic`, `infinite`
- Computes phase = tModelMs / periodMs for cyclic
- Pulse detection via wrap (tModelMs < prevTModelMs)
- Energy tracking as wrap count (wraps in this frame)

**Coverage**:
- Monotonic time (tMs) preserved
- Phase wrapping detection
- Progress calculation for finite
- Phase continuity across hot-swap NOT preserved
- `phaseA` / `phaseB` dual rails NOT supported
- No phase offset/retiming mechanism

### 4. OpCode Support (MINIMAL)

**Files**:
- `src/compiler/ir/types.ts` (OpCode enum)

**Status**: FOUNDATION ONLY
- `OpCode.Wrap01` exists for phase wrapping
- Used in `InfiniteTimeRoot` and `FiniteTimeRoot` blocks
- No phase arithmetic opcodes (phase+float, phase*float, phase-phase)

**Coverage**:
- Wrap01 defined and used
- Phase arithmetic NOT implemented
- PhaseToFloat, FloatToPhase NOT in OpCode
- Phase distance calculation NOT available

### 5. Block Registry (READY)

**Files**:
- `src/compiler/blocks/registry.ts` (200+ lines)

**Status**: READY FOR RAILS
- Registry pattern supports derived blocks
- All blocks use SignalType (payload + extent)
- 25+ blocks already migrated

**Coverage**:
- Block registration mechanism
- Input/output port declaration
- Type-safe value references
- Rail blocks NOT defined (no palette, phaseA, phaseB, pulse rails)

---

## Missing: What Needs Implementation

### 1. Rail System (CRITICAL) - NOT IMPLEMENTED

**Spec Requirement** (03-time-system.md §§ 115-149):
- 5 system-provided immutable rails: `time`, `phaseA`, `phaseB`, `pulse`, `palette`
- Each is a derived block with `{ kind: 'derived', meta: { kind: 'rail', target: { kind: 'bus', busId } } }`
- Rails can be overridden by connecting inputs
- Palette provides default color atmosphere

**Current State**: MISSING ENTIRELY
- No rail block definitions
- No palette rail implementation
- No dual-phase (phaseA/phaseB) structure

**Required Files**:
```
src/compiler/blocks/rails/
├── TimeRail.ts
├── PhaseARail.ts
├── PhaseBRail.ts
├── PulseRail.ts
└── PaletteRail.ts
```

### 2. Phase Arithmetic Rules (CRITICAL) - NOT ENFORCED

**Spec Requirement** (03-time-system.md §§ 169-176):
```typescript
phase + float → phase    (with wrap)
phase * float → phase    (with wrap)
phase + phase → TYPE ERROR
phase - phase → float    (unwrapped distance)
```

**Current State**: NO VALIDATION
- No compile-time checking of phase type constraints
- No runtime phase arithmetic
- Phase only appears in TimeRoot outputs currently

**Required Implementation**:
1. Type constraint solver (Pass 5 work) to validate phase operations
2. Phase arithmetic opcodes in IR
3. Wrap semantics in runtime evaluator

**Scope**: Requires IR constraint solving (P5) and runtime evaluator updates

### 3. Phase Continuity (ADVANCED) - NOT IMPLEMENTED

**Spec Requirement** (03-time-system.md §§ 273-289):
- When retiming (changing speed/period), preserve phase continuity:
  ```
  new_phase = old_phase + (new_speed - old_speed) * elapsed_time
  ```
- Preserved across hot-swap: tMs continues, state cells match

**Status**: Deferred to hot-swap implementation (Phase 2)

### 4. Phase Helper Functions (SUPPORTING) - NOT IMPLEMENTED

**Spec Requirement** (03-time-system.md §§ 190-222):
```typescript
PhaseToFloat(p: phase): float         // Unwrap [0,1)
FloatToPhase(f: float): phase         // Wrap to [0,1)
PhaseDistance(a, b): float            // Shortest path distance
```

**Scope**: ~80 lines, low priority for MVP

### 5. Dual-Phase System (CORE) - INCOMPLETE

**Spec Requirement** (03-time-system.md § 57-66):
- TimeRoot outputs FIVE values:
  1. `tMs` (int, continuous)
  2. `phaseA` (phase, continuous)
  3. `phaseB` (phase, continuous)
  4. `progress` (unit, finite only)
  5. `pulse` (unit, discrete)

**Current State**: ONLY ONE PHASE
- Single `phase` output per TimeRoot
- No `phaseA` / `phaseB` distinction
- No independent period control for each phase

---

## Dependencies & Blockers

### Current Dependencies (SATISFIED)

1. **IR-5-Axes** (COMPLETE) - canonical-types.ts, 5-axis extent framework
2. **Type System** (COMPLETE) - SignalType with phase payload
3. **Block System** (COMPLETE) - Block registration and lowering

### Blocking Dependencies

1. **Pass 5: IR Constraint Solving** - REQUIRED for phase arithmetic type checking
   - NOT YET STARTED: Needed before phase type rules enforced

### Topics That Depend on Time-Model

1. **Buses and Rails** - Depends on rail implementation
2. **Palette System** - Depends on palette rail
3. **Hot-Swap Continuity** - Depends on time continuation mechanism

---

## Spec Compliance Issues

### 1. Deviation: Time Variable Names

**Spec Says**:
- `tMs` - monotonic time in milliseconds
- `phaseA`, `phaseB` - dual phase rails

**Code Uses**:
- `t` (float, ambiguous units)
- `phase` (single, not dual)
- `energy` (wrap count, not in spec)

**Impact**: MEDIUM - Contracts don't match spec

### 2. Ambiguity: Phase Period Configuration

**Spec Says**: phaseA and phaseB are "primary" and "secondary" but doesn't specify if they have independent periods

**Resolution Proposed**: Assume both phases from same period (simpler model)

### 3. Ambiguity: Pulse Semantics

**Spec Says**: "Frame tick trigger"

**Code Implements**: 1.0 only when phase wraps, 0.0 otherwise

**Status**: Reasonable interpretation

---

## Files to Create / Modify

### CREATE (New Implementation)

| File | Purpose | Priority |
|------|---------|----------|
| `src/compiler/blocks/rails/TimeRail.ts` | time rail (tMs output) | HIGH |
| `src/compiler/blocks/rails/PhaseARail.ts` | phaseA rail | HIGH |
| `src/compiler/blocks/rails/PhaseBRail.ts` | phaseB rail | HIGH |
| `src/compiler/blocks/rails/PulseRail.ts` | pulse rail | HIGH |
| `src/compiler/blocks/rails/PaletteRail.ts` | palette rail | MEDIUM |

### MODIFY (Existing Files)

| File | Change | Priority |
|------|--------|----------|
| `src/compiler/blocks/time/InfiniteTimeRoot.ts` | Add phaseA, phaseB outputs | HIGH |
| `src/compiler/blocks/time/FiniteTimeRoot.ts` | Add phaseA, phaseB outputs | HIGH |
| `src/runtime/timeResolution.ts` | Add dual-phase tracking | MEDIUM |
| `src/compiler/blocks/registry.ts` | Register rail blocks | HIGH |

---

## Ambiguities Requiring Clarification

| ID | Question | Impact |
|----|----------|--------|
| A1 | Are phaseA and phaseB independent periods or same TimeRoot period? | MEDIUM |
| A2 | What's the use case for dual phases (phaseA/phaseB)? | MEDIUM |
| A3 | Is phase continuity (hot-swap) MVP or deferred? | MEDIUM |

---

## Verdict

**READY FOR PLANNING** - All dependencies satisfied. No blocking issues.

**Recommended Scope for Sprint**:
1. Dual-phase TimeRoot (phaseA, phaseB)
2. Rail block system (5 rails)
3. Defer phase arithmetic to Pass 5 work
4. Defer hot-swap continuity to Phase 2
