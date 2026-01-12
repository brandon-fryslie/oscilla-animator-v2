# Compiler Audit — Block-Level Red Flags

This file calls out individual blocks or lowering paths that are not IR-ready or are explicitly blocked by missing dependencies.

## Critical

- **ColorLFO is not IR-ready (missing HSL→RGB)**
  - **Location:** `src/editor/compiler/blocks/signal/ColorLFO.ts:130`
  - **Detail:** IR lowering throws due to missing `ColorHSLToRGB` opcode or kernel.
  - **Impact:** Any patch using ColorLFO fails in IR-only mode.
  - RESPONSE: Provide implementation

- **DebugDisplay cannot be lowered to IR**
  - **Location:** `src/editor/compiler/blocks/debug/DebugDisplay.ts:20`
  - **Detail:** Lowering throws and explicitly instructs to use legacy compiler.
  - **Impact:** DebugDisplay is incompatible with IR-only compilation; must be reworked as a debug sink or removed.
  - RESPONSE: Please plan how to do this or provide alternative

## High

- **FieldReduce is wired to a placeholder SignalExpr**
  - **Location:** `src/editor/compiler/ir/IRBuilderImpl.ts:535`
  - **Detail:** `reduceFieldToSig()` emits a map node with `src: 0` (placeholder) rather than the actual field source.
  - **Impact:** ReduceField output is disconnected from its input in IR.
  - - RESPONSE: Provide implementation

- **SVG domains may be missing runtime initialization**
  - **Location:** `src/editor/compiler/ir/IRBuilderImpl.ts:571`
  - **Detail:** `domainFromSVG()` does not register the domain, so no initial slot value is created.
  - **Impact:** SVGSampleDomain might produce invalid domain slots at runtime.
  - RESPONSE: Provide code for fix

## Medium

- **Legacy-only behavior remains in multiple blocks**
  - **Location:** `src/editor/compiler/blocks/domain/Render2dCanvas.ts:42` and other legacy blocks
  - **Detail:** Several blocks still define a legacy compile path or mention legacy-only behavior.
  - **Impact:** These blocks should either be fully IR-lowered or explicitly blocked in IR-only mode.
  - - RESPONSE: List blocks / provide implementations

