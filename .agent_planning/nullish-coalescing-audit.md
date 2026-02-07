# Nullish Coalescing (`??`) Audit — Consolidated Report

**Date**: 2026-02-06
**Branch**: bmf_type_system_refactor
**Scope**: All 350 `??` usages across 114 files in `src/`

---

## Executive Summary

| Layer | Total | BOUNDARY | BUG-HIDING | STRUCTURAL |
|-------|-------|----------|------------|------------|
| Core/Graph/DSL | 29 | 12 | 2 | 15 |
| Blocks | 45 | 0 | 3 | 42 |
| Compiler | 15 | 11 | 2 | 2 |
| Runtime | 18 | 12 | 4 | 2 |
| Services/Stores | 48 | 33 | 2 | 13 |
| UI/Render | 96 | 85 | 6 | 5 |
| Tests | 47 | 47 | 0 | 0 |
| **TOTAL** | **298** | **200** | **19** | **79** |

- **200 BOUNDARY** (67%) — Legitimate defaults at system edges. Keep.
- **19 BUG-HIDING** (6%) — Actively masking bugs. Fix immediately.
- **79 STRUCTURAL** (27%) — Type system debt. Fix during refactor.
- **Tests**: Clean. Zero bug-masking patterns in assertions.

---

## P0: BUG-HIDING — Fix Immediately (19 items)

### Graph Layer (2)

| # | File:Line | What it hides | Fix |
|---|-----------|---------------|-----|
| 1 | `graph/address-resolution.ts:79` | Missing output port type defaults to FLOAT | Throw if outputDef.type missing |
| 2 | `graph/address-resolution.ts:92` | Missing input port type defaults to FLOAT | Throw if inputDef.type missing |

### Blocks Layer (3)

| # | File:Line | What it hides | Fix |
|---|-----------|---------------|-----|
| 3 | `blocks/time/infinite-time-root.ts:61` | Missing output type from frontend solver defaults to canonicalEvent() | Throw — frontend must produce all output types |
| 4 | `blocks/domain/stable-id-hash.ts:37` | Instance inference failure falls back to ctx.instance | Throw or warn — inference should succeed for field blocks |
| 5 | `blocks/domain/domain-index.ts:30` | Same instance inference failure | Same fix |

### Compiler Layer (2)

| # | File:Line | What it hides | Fix |
|---|-----------|---------------|-----|
| 6 | `compiler/compile.ts:664` | Missing slot type registration defaults to payloadStride() | Throw — every slot must have type info from IR builder |
| 7 | `compiler/backend/schedule-program.ts:440` | Incomplete paramArgs→paramSignals migration with dual fallback | Complete migration, remove dual field names |

### Runtime Layer (4)

| # | File:Line | What it hides | Fix |
|---|-----------|---------------|-----|
| 8 | `runtime/ScheduleExecutor.ts:191` | Control point field lookup defaults to slot 0 | Throw — compiler must populate fieldExprToSlot completely |
| 9 | `runtime/executeFrameStepped.ts:244` | Same control point field bug (debug executor) | Same fix |
| 10 | `runtime/executeFrameStepped.ts:462` | State slot mapping generates synthetic "unknown:N" ID | Warn — debug metadata must cover all state slots |
| 11 | `runtime/executeFrameStepped.ts:494` | Same state slot mapping bug for field state writes | Same fix |

### Services/Stores Layer (2)

| # | File:Line | What it hides | Fix |
|---|-----------|---------------|-----|
| 12 | `services/mapDebugEdges.ts:221` | Port cardinality defaults to 'signal' | Throw — all ports must have cardinality after type solve |
| 13 | `stores/StepDebugStore.ts:460` | slotWriteStrided step missing inputs[0] returns null | Throw — IR step must have inputs |

### UI Layer (6)

| # | File:Line | What it hides | Fix |
|---|-----------|---------------|-----|
| 14 | `ui/graphEditor/nodeDataTransform.ts:178` | Unresolved input port type falls back to static type | Show error state when resolvedType missing |
| 15 | `ui/graphEditor/nodeDataTransform.ts:200` | Unresolved output port type falls back to static type | Same |
| 16 | `ui/reactFlowEditor/typeValidation.ts:212` | Missing port returns null instead of error | Throw/warn — port must exist in block def |
| 17 | `ui/reactFlowEditor/typeValidation.ts:229` | Same missing port bug | Same |
| 18 | `ui/components/BlockInspector.tsx:1272` | Slider uses wrong type config when compilation fails | Disable slider or show warning |
| 19 | `ui/reactFlowEditor/typeValidation.ts:66` | Non-exhaustive TYPE_COLORS falls back to float color | Make exhaustive — new payload kinds must have colors |

---

## P1: STRUCTURAL — Fix During Type System Refactor (79 items)

### Theme 1: Block Config Defaults in Lowering Code (28 items)

**Pattern**: `(config?.someField as number) ?? defaultValue` in block lowering functions.

**Root cause**: Block definitions declare config fields but defaults live in lowering code instead of in the block definition. At lowering time, config should be validated and guaranteed present.

**Fix**: Move all config defaults to block definitions. Add config validation in graph normalization. At lowering time, assert config fields are present.

**Affected files**: oscillator.ts, unit-delay.ts (2x), phasor.ts, lag.ts (2x), external-input.ts, external-gate.ts (2x), external-vec2.ts, camera-projection-const.ts, sample-hold.ts, expression.ts, reduce.ts, stable-id-hash.ts, array.ts, procedural-star.ts (3x), procedural-polygon.ts (3x), ellipse.ts (3x), rect.ts (4x)

### Theme 2: CompileOrchestrator Schedule Fields (8 items)

**Pattern**: `newSchedule?.stateSlotCount ?? 0`, `(newSchedule as { eventSlotCount?: number })?.eventSlotCount ?? 0`

**Root cause**: Schedule type has optional fields that should be required after successful compilation.

**Fix**: Make `stateSlotCount`, `stateMappings`, `eventSlotCount`, `eventCount` required in Schedule type.

**Affected file**: CompileOrchestrator.ts (lines 238-242, 251, 273, 293)

### Theme 3: StepDebugStore Session Nullability (5 items)

**Pattern**: `this._session?.frameResult ?? null`, `this._session?.getLaneIdentities(slot) ?? null`

**Root cause**: `_session` and `_lastProgram` are nullable but methods assume they exist when mode !== 'idle'.

**Fix**: Either throw at method entry if null, or enforce lifecycle with non-nullable types.

**Affected file**: StepDebugStore.ts (lines 144, 162, 179, 251, 575)

### Theme 4: Exhaustive Switch Fallbacks (2 items)

**Pattern**: `(_exhaustive as any).kind ?? 'unknown'` in default branches

**Root cause**: Should be `never` assertion that throws, not silent fallback.

**Fix**: `throw new Error(\`Unhandled expr kind: ${(_exhaustive as any).kind}\`)`

**Affected files**: StepDebugStore.ts:659, lower-blocks.ts:173

### Theme 5: Remaining Structural (36 items)

Various: canonical-type.ts extent defaults (6), inference-types.ts var generation (7), topologies.ts rotation (2), Patch.ts optional arrays (2), composite label chains (8), UI structural issues (5), adapter priority (1), misc (5).

Most are legitimate optional fields or constructor defaults. Lower priority.

---

## Tests: CLEAN

All 47 `??` usages in test files are legitimate:
- Test helper defaults (Builder pattern) — 19
- Defensive mock reads — 7
- Optional metadata reads — 21

Zero instances of the anti-pattern `expect(result?.value ?? 0).toBe(0)`. All assertions are strict.

---

## Recommended Execution Order

### Sprint 1: Critical Bug Fixes (P0 items 1-13)
Remove `??` from internal layers where null/undefined means a real bug:
- address-resolution.ts → throw on missing port types
- infinite-time-root.ts → throw on missing output type
- ScheduleExecutor.ts + executeFrameStepped.ts → throw on missing field slot
- mapDebugEdges.ts → throw on missing cardinality
- StepDebugStore.ts → throw on missing inputs
- compile.ts → throw on missing slot info
- schedule-program.ts → complete paramSignals migration

### Sprint 2: UI Error States (P0 items 14-19)
Replace silent fallbacks with visible error states:
- nodeDataTransform.ts → show "type unresolved" badge
- typeValidation.ts → throw/warn on missing port, make TYPE_COLORS exhaustive
- BlockInspector.tsx → disable slider when type unresolved

### Sprint 3: Block Config Defaults (28 STRUCTURAL items)
Centralize block config defaults:
- Add `defaultConfig` to `defineBlock()` API
- Validate config completeness in normalization
- Assert config fields present in lowering
- Remove all `(config?.field as type) ?? default` patterns

### Sprint 4: Type Narrowing (remaining STRUCTURAL)
- Make Schedule fields non-optional
- Fix StepDebugStore session lifecycle
- Replace exhaustive switch fallbacks with throws
