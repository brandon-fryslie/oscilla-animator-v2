# Compiler Audit — Core Pipeline Red Flags

This file lists core pipeline issues that block a fully IR-only compiler. Items are ordered by severity.

## Critical

- **IR build is optional and failure is non-fatal**
  - **Location:** `src/editor/compiler/compileBusAware.ts:763`
  - **Detail:** `attachIR()` only runs when `emitIR === true`, and IR errors produce warnings while still returning a closure-based program.
  - **Impact:** The compiler can silently fall back to legacy execution, violating IR-only expectations and masking IR regressions.

- **TimeModel in CompiledProgramIR ignores TimeRoot**
  - **Location:** `src/editor/compiler/ir/IRBuilderImpl.ts:605`
  - **Detail:** `build()` always returns `timeModel: { kind: 'infinite', windowMs: 30000 }`.
  - **Impact:** IR runtime will always behave as infinite time regardless of TimeRoot. This breaks time topology invariants and UI behavior.

- **SignalExpr still permits closure bridge nodes**
  - **Location:** `src/editor/compiler/ir/signalExpr.ts:80`
  - **Detail:** `SignalExprClosureBridge` is part of the IR schema.
  - **Impact:** IR evaluation can still depend on opaque closures, defeating determinism and inspectability.

## High

- **Feature flag parsing ignores explicit false for unified compiler**
  - **Location:** `src/editor/compiler/featureFlags.ts:121`
  - **Detail:** If `VITE_USE_UNIFIED_COMPILER` exists, `useUnifiedCompiler` is forced true regardless of value.
  - **Impact:** Environments cannot explicitly disable unified compiler; behavior becomes hard to reason about in QA.

- **Domain creation API doesn’t preserve SVG domains**
  - **Location:** `src/editor/compiler/ir/IRBuilderImpl.ts:571`
  - **Detail:** `domainFromSVG()` returns a slot but does not register the domain in `this.domains`.
  - **Impact:** Runtime never initializes the domain handle for SVG-based domains, leading to missing counts and empty materializations.

