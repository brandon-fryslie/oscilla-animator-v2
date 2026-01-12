# Compiler Audit — Pass-Level Red Flags

This file focuses on issues in the multi-pass IR compilation pipeline. Items are ordered by severity.

## Critical

- **Pass 6 emits placeholder IR nodes rather than real semantics**
  - **Location:** `src/editor/compiler/passes/pass6-block-lowering.ts:117`
  - **Detail:** Signals are replaced with `sigTimeAbsMs` and fields are replaced with `fieldConst(0)` placeholders.
  - **Impact:** The generated IR does not correspond to the patch’s actual logic, so any IR runtime output is wrong even when compilation “succeeds.”

- **Default sources are not lowered for non-render blocks**
  - **Location:** `src/editor/compiler/passes/pass8-link-resolution.ts:258`
  - **Detail:** `buildBlockInputRoots` notes default source handling as a placeholder and only records errors when missing.
  - **Impact:** Required inputs with default sources are left unresolved in IR, causing missing slots and runtime failures.

## High

- **Bus evaluation is absent from the schedule**
  - **Location:** `src/editor/compiler/ir/buildSchedule.ts:312`
  - **Detail:** The schedule only includes `timeDerive`, `signalEval`, materialization, and `renderAssemble`. No `busEval` steps are emitted.
  - **Impact:** Bus values never materialize in IR runtime, so bus-driven graphs will be incorrect.

- **Adapter/lens conversion paths are not computed**
  - **Location:** `src/editor/compiler/passes/pass2-types.ts:239`
  - **Detail:** Type conversion paths are TODOs and currently require exact type match.
  - **Impact:** Any implicit conversion (signal→field, color→number, etc.) fails in IR mode.

- **Bus lowering does not apply publisher transform chains**
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:148`
  - **Detail:** TODO for applying publisher transform chains; currently assumes 1:1 mapping.
  - **Impact:** Listener/publisher lenses/adapters are ignored in IR, leading to wrong values and type mismatches.

## Medium

- **Time topology (Pass 3) is disconnected from IRBuilder timeModel**
  - **Location:** `src/editor/compiler/passes/pass3-time.ts:170`
  - **Detail:** Pass 3 extracts TimeModel, but `IRBuilderImpl.build()` still hardcodes infinite time.
  - **Impact:** TimeRoot validation passes but runtime uses wrong model unless explicitly overridden.

