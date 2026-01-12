# Compiler Audit — Signal Runtime Red Flags

This file audits the signal runtime (SigExpr table extraction, evaluator, stateful ops) and its integration with the IR compiler. Items are ordered by severity.

## Critical

- **Signal evaluation hard-fails if `signalTable` is missing**
  - **Location:** `src/editor/runtime/executor/steps/executeSignalEval.ts:29`
  - **Detail:** Executor throws when `program.signalTable` is absent.
  - **Impact:** Any IR compile that fails to extract the signal table (or omits it) will crash at runtime.

- **IR extraction does not guarantee signal table presence**
  - **Location:** `src/editor/compiler/compileBusAware.ts:818`
  - **Detail:** `extractSignalExprTable()` can return null; execution still proceeds without a hard error.
  - **Impact:** IR runtime crashes are deferred until frame execution instead of compile time.

- **Closure bridge nodes remain in signal IR**
  - **Location:** `src/editor/compiler/ir/signalExpr.ts:102`
  - **Detail:** `SignalExprClosureBridge` is part of the IR schema.
  - **Impact:** Determinism and replay guarantees are compromised if closure bridges are used.

## High

- **Transform chain evaluation requires a populated transform table**
  - **Location:** `src/editor/runtime/signal-expr/SigEvaluator.ts:439`
  - **Detail:** `evalTransform` throws if `env.transformTable` lacks the referenced chain.
  - **Impact:** Any transform node crashes if transform tables are not emitted or wired in `SigEnv`.

- **Bus combine in SigEvaluator assumes pre-sorted terms**
  - **Location:** `src/editor/runtime/signal-expr/SigEvaluator.ts:314`
  - **Detail:** `evalBusCombine` depends on compiler sort order and does not verify ordering or sort keys.
  - **Impact:** If compiler sorting is inconsistent, bus results will diverge between UI and runtime.

## Medium

- **`inputSlot` reads are numeric-only**
  - **Location:** `src/editor/runtime/signal-expr/SigEvaluator.ts:300`
  - **Detail:** SlotValueReader only reads numbers; vector or color signals are not supported.
  - **Impact:** Non-number signal paths will fail or be coerced incorrectly.

- **`wrapEvent` is treated as numeric**
  - **Location:** `src/editor/runtime/executor/steps/executeTimeDerive.ts:33`
  - **Detail:** Wrap event is written as a number and passed through numeric pipeline.
  - **Impact:** Event semantics may be conflated with continuous signals; edge-trigger logic may be incorrect.

