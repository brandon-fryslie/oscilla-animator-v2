---
topic: 04
name: Compilation
kind: context-overview
generated: 2026-01-24
related_gap_file: .agent_planning/gap-analysis/to-review/topic-04-compilation.md
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
---

# Topic 04 (Compilation) — Relevant Context Overview

This file captures the concrete spec + code context that explains gap item **R-8** (“Expression trees vs Op-level IR”) in `.agent_planning/gap-analysis/to-review/topic-04-compilation.md`.

---

## 1) What you’re reviewing (R-8)

R-8 exists because the canonical spec’s **Scheduling** section is written as if the schedule *is* the compiled IR (op-level, step-by-step), while the code implements **dense expression tables + a schedule that references expr IDs/slots**.

The codebase therefore looks “divergent” if you read only the spec’s `Schedule.Step` union, but it aligns strongly with other spec invariants (lazy fields, structural sharing).

---

## 2) Canonical spec: what it explicitly says

### 2.1 Compilation pipeline

The ESSENTIAL spec describes:

- `RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR`
  - `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md:379`

### 2.2 Scheduling model (as written)

The ESSENTIAL spec’s “Scheduling” section models a `Schedule` with `Step` variants:

- `eval_scalar`, `eval_field`, `state_read`, `state_write`, `combine`, `render`
  - `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md:421`

This is the part that reads as “op-level schedule IR”.

### 2.3 Canonical invariants that imply a DAG/materialization architecture

The ESSENTIAL spec also lists invariants that *already* point toward expression DAGs + lazy materialization:

- Slot-addressed execution / no string lookups: `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md:29`
- Schedule is inspectable data: `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md:30`
- Lazy fields with explicit materialization: `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md:38`
- Structural sharing / hash-consing: `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md:39`

So: the “Scheduling” subsection’s specific `Step` union is what’s stale/misaligned, not the overall intent.

---

## 3) Code: what actually exists today

### 3.1 The authoritative compiled-program contract (in code)

`src/compiler/ir/program.ts` defines the **canonical runtime-facing contract**:

- `CompiledProgramIR` contains:
  - Dense expr tables: `signalExprs`, `fieldExprs`, `eventExprs` (`src/compiler/ir/program.ts:81`)
  - `schedule: ScheduleIR` (`src/compiler/ir/program.ts:91`)
  - `slotMeta` with `storage` + required `offset` (`src/compiler/ir/program.ts:190`)
  - `debugIndex` (`src/compiler/ir/program.ts:100`)
  - `fieldSlotRegistry` for demand-driven materialization / debug inspection (`src/compiler/ir/program.ts:103`)
  - `renderGlobals` camera declarations (`src/compiler/ir/program.ts:110`)

Implication: the **schedule is not the only compiled artifact**; it’s one component referencing expr IDs and slots.

### 3.2 Expression DAG node types

`src/compiler/ir/types.ts` defines the expression unions.

Signals (`SigExpr`) include:

- `const`, `slot`, `time`, `external`, `map`, `zip`
- `stateRead` (persistent state lookup), `shapeRef`, `eventRead`
  - `src/compiler/ir/types.ts:84`

Fields (`FieldExpr`) include:

- `const`, `intrinsic`, `broadcast`, `map`, `zip`, `zipSig`, `array`
- `stateRead` (per-lane state read)
  - `src/compiler/ir/types.ts:179`

### 3.3 Schedule steps (in code)

The runtime schedule `Step` union is defined in `src/compiler/ir/types.ts` and includes:

- `evalSig`, `materialize`, `render`
- `stateWrite`, `fieldStateWrite`
- continuity steps (`continuityMapBuild`, `continuityApply`)
- event step (`evalEvent`)
  - `src/compiler/ir/types.ts:433`

This does **not** match the ESSENTIAL spec’s `eval_scalar`/`eval_field`/`combine` step model.

### 3.4 Schedule construction pass

`src/compiler/passes-v2/pass7-schedule.ts` explicitly describes phase ordering:

1. Update rails/time inputs
2. Execute continuous scalars (`evalSig`)
3. Build continuity mappings (`continuityMapBuild`)
4. Execute continuous fields (`materialize`)
5. Apply continuity (`continuityApply`)
6. Apply discrete ops (events)
7. Sinks (`render`)
8. State writes (`stateWrite`)

Reference: `src/compiler/passes-v2/pass7-schedule.ts:1`

### 3.5 Runtime execution

`src/runtime/ScheduleExecutor.ts` executes `program.schedule.steps`, using:

- `program.slotMeta` to resolve slot → (storage, offset) (`src/runtime/ScheduleExecutor.ts:57`)
- `program.signalExprs.nodes` and `evaluateSignal()` for `evalSig` (`src/runtime/ScheduleExecutor.ts:103`)
- `materialize()` for `materialize` (`src/runtime/ScheduleExecutor.ts:149`)

Signals are evaluated recursively + cached in `src/runtime/SignalEvaluator.ts` (`src/runtime/SignalEvaluator.ts:78`).

Fields are materialized lazily + cached in `src/runtime/Materializer.ts` (`src/runtime/Materializer.ts:183`).

### 3.6 Where “combine” lives (important for the mismatch)

The ESSENTIAL spec models combine as an explicit schedule `Step`.

In the codebase, combine is handled at compile time by emitting combine expressions:

- Combine mode validation + combine node creation lives in `src/compiler/passes-v2/combine-utils.ts` (`src/compiler/passes-v2/combine-utils.ts:1`)
- `createCombineNode(...)` builds `SigExpr`/`FieldExpr`/`EventExpr` combine constructs (`src/compiler/passes-v2/combine-utils.ts:232`)

So “combine” is not a runtime schedule op in the current architecture.

---

## 4) Mapping: spec terms ↔ current code

The following mapping is the most direct correspondence between the ESSENTIAL spec’s schedule-steps model and the code’s current model:

- **`eval_scalar` (spec)** ≈ `StepEvalSig { kind: 'evalSig'; expr: SigExprId; target: ValueSlot }`
  - `src/compiler/ir/types.ts:443`

- **`eval_field` (spec)** ≈ `StepMaterialize { kind: 'materialize'; field: FieldExprId; instanceId; target: ValueSlot }`
  - `src/compiler/ir/types.ts:449`

- **`state_read` (spec)** ≈ `SigExpr.kind === 'stateRead'` and `FieldExpr.kind === 'stateRead'`
  - Defined in `src/compiler/ir/types.ts` (signal + field unions)
  - Executed in `src/runtime/SignalEvaluator.ts` (signal state read at `src/runtime/SignalEvaluator.ts:194`)

- **`state_write` (spec)** ≈ `StepStateWrite` / `StepFieldStateWrite`
  - `src/compiler/ir/types.ts:477`

- **`combine` (spec)** ≈ compiler-emitted combine expressions (not schedule steps)
  - `src/compiler/passes-v2/combine-utils.ts:232`

- **`render` (spec)** ≈ `StepRender` (explicitly carries slots for position/color + shape plumbing)
  - `src/compiler/ir/types.ts:456`

---

## 5) Why ARCHITECTURE.md “matches code” better than ESSENTIAL scheduling

`ARCHITECTURE.md` describes the “expression DAG + schedule” architecture explicitly:

- IR nodes: `SigExpr`, `FieldExpr` (`ARCHITECTURE.md:89`)
- Schedule steps: `evalSig`, `materialize`, `render` (`ARCHITECTURE.md:108`)

This lines up closely with `src/compiler/ir/types.ts` and `src/runtime/ScheduleExecutor.ts`.

---

## 6) Notes on documentation drift

`src/compiler/ir/program.ts` references `design-docs/IR-and-normalization-5-axes.md` as its spec reference (`src/compiler/ir/program.ts:6`), but that document is recorded as archived/superseded in:

- `design-docs/CANONICAL-oscilla-v2.5-20260109/appendices/superseded-docs.md:59`

This helps explain why the ESSENTIAL spec’s Scheduling subsection may be behind the current code reality.

