# Compiler Audit — IR Schedule Builder & Runtime Step Execution Red Flags

This file audits the IR schedule builder and runtime step execution for correctness and completeness. Items are ordered by severity.

## Critical

- **`timeDerive` does not write `tAbsMs` into `tAbsMsSlot`**
  - **Location:** `src/editor/runtime/executor/steps/executeTimeDerive.ts:33`
  - **Detail:** Step has `tAbsMsSlot`, but the executor only writes derived outputs; it never writes the absolute time value.
  - **Impact:** Any downstream signal node referencing the `tAbsMs` slot will read stale/uninitialized data.

- **Schedule builder does not emit `busEval` steps**
  - **Location:** `src/editor/compiler/ir/buildSchedule.ts:337`
  - **Detail:** The schedule only includes `timeDerive`, `signalEval`, materialization, and `renderAssemble`. `busEval` is never inserted.
  - **Impact:** Bus values are never computed at runtime in IR mode; any bus-driven graphs will be incorrect.

- **`materializeColor` cannot evaluate field expressions**
  - **Location:** `src/editor/runtime/executor/steps/executeMaterializeColor.ts:176`
  - **Detail:** The executor throws when it sees `{ kind: 'fieldExpr' }` for the color expression slot.
  - **Impact:** Any render sink that expects color fields materialized by expression will fail at runtime. This breaks the core materialization contract.

## High

- **Schedule builder still advertises legacy/temporary steps**
  - **Location:** `src/editor/compiler/ir/buildSchedule.ts:5`
  - **Detail:** Header says it is a minimal converter and references `materializeTestGeometry` placeholders.
  - **Impact:** The IR schedule is not a faithful pass9 codegen implementation; real render sinks can be starved or filled with test data.

- **`signalEval` hard-fails if `program.signalTable` is missing**
  - **Location:** `src/editor/runtime/executor/steps/executeSignalEval.ts:29`
  - **Detail:** The executor throws if `program.signalTable` is absent.
  - **Impact:** Any compiled program that does not include a signal table (due to extraction failure or disabled IR extraction) will hard crash.

## Medium

- **`materializeColor` uses Float32 RGBA channels, while Instances2D expects u8 RGBA**
  - **Location:** `src/editor/runtime/executor/steps/executeMaterializeColor.ts:1`
  - **Detail:** MaterializeColor writes Float32Array channels. Instances2D pipeline currently materializes u8 RGBA via `executeMaterialize` (color quantize), not `materializeColor`.
  - **Impact:** This step is inconsistent with the current RenderIR and may be dead/unused, or produce incompatible buffers if used.

- **`renderAssemble` depends only on materialization step IDs, not explicit slot dependencies**
  - **Location:** `src/editor/compiler/ir/buildSchedule.ts:401`
  - **Detail:** Dependencies are based on emitted step IDs, not slot dependency analysis.
  - **Impact:** If additional steps are added or reordered, incorrect scheduling could occur without compiler warnings.

