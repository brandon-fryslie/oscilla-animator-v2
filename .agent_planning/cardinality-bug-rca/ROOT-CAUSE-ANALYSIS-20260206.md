# Root Cause Analysis: Cardinality Violation Bug

**Date:** 2026-02-06
**Status:** Resolved
**Severity:** Runtime crash (field expressions evaluated as signal-extent)
**Symptom:** `Error: Intrinsic expressions are field-extent, not signal-extent`

---

## 1. What Was Broken

This bug had **two independent failures** that combined to produce the crash:

### Failure A: Cardinality Solver Phase 4 — UF Root Poisoning

The cardinality constraint solver uses union-find (UF) to resolve port cardinalities. It has a concept of `zipBroadcast` groups where some ports in a block can be `one` (signal) while others are `many` (field), enabling broadcast semantics.

**The bug:** When Phase 3 unions edge endpoints (e.g., adapter output port `2:out:out` with downstream input port `19:h:in`), they share a UF root. In Phase 4, when processing `zipBroadcast` groups, the solver checks if an unresolved port has a `pendingOne` entry (a deferred card=one value from Phase 2). If it does and the port isn't an output port, it commits `one` to the UF node.

The problem: committing `one` to port `19:h:in` also sets the shared UF root to `one`. Now port `2:out:out` (the adapter's output) also resolves to `one` — even though the adapter's output must be `many` because it's in a zipBroadcast group that has a `many` input.

**In concrete terms:**
- Adapter block #2 (ScalarToPhase01) connects its output to MakeColorHSL block #19's `h` input
- Phase 3 unions `2:out:out` and `19:h:in` → they share a UF root
- Phase 4 processes block #19's zipBroadcast group and commits `one` to `19:h:in` (a signal port broadcasting into a field block)
- This poisons the shared root → `2:out:out` also resolves to `one`
- The adapter's `ctx.outTypes[0]` now has `cardinality: one` instead of `many`

### Failure B: Hardcoded Intermediate Expression Types in Block Lowering

Even if the solver correctly resolved `outType` to `many`, many blocks constructed intermediate IR expressions with hardcoded signal-extent types:

```typescript
// BEFORE (broken):
const radians = ctx.b.kernelZip([input.id, factor], mulFn, canonicalType(FLOAT, unitRadians()));
//                                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                                                          This has cardinality: one (signal-extent)
```

The `canonicalType()` factory creates types with default signal extent (cardinality=one). When these blocks operate in field context (cardinality=many), all intermediate expressions get the wrong cardinality. The final output uses `outType` correctly, but intermediate steps create expressions with `card=one` that the runtime then tries to evaluate as signals.

### Failure C: Missing Opcodes in Field Materializer

A tertiary failure: `ValueExprMaterializer.ts` (the field-extent evaluator) didn't handle opcodes like `wrap01`, `fract`, `sign`, and `hash`. These existed in `OpcodeInterpreter.ts` (the signal evaluator) but were never added to the field materializer. This was latent — it only manifested once the cardinality solver started correctly routing field expressions to the field evaluator.

---

## 2. What Was Missing

### Missing: Cardinality Invariant at the UF Boundary

The union-find data structure allows two ports to share a root after Phase 3 edge union. But the *semantic constraint* — "a zipBroadcast output port from block A must not be forced to `one` by a pendingOne commit on a downstream input port from block B" — was never encoded in the solver.

The solver had the right intuition about `pendingOne` deferral (don't eagerly commit `one` for zip members), but it missed the case where Phase 3 edge unions create shared roots *between* blocks, allowing a downstream port's `one` commit to propagate backward and poison an upstream output.

### Missing: Type Derivation Contract for Block Authors

There was no enforced rule that intermediate IR expressions must derive their types from the solver-resolved `outType`. Each block author was free to construct types using `canonicalType(...)` which produces signal-extent types by default. The block API documentation didn't make clear that `ctx.outTypes[0]` is the *single source of truth* for output cardinality and must be used for all expressions in the chain.

### Missing: Exhaustive Opcode Coverage Between Evaluators

The signal evaluator (`OpcodeInterpreter.ts`) and field materializer (`ValueExprMaterializer.ts`) maintained independent opcode switch statements with no shared definition. New opcodes added to one were silently absent from the other.

---

## 3. Why This Was So Difficult to Debug

### 3a. Five-Layer Indirection

The data flow from "solver produces correct types" to "block receives correct types" crosses five pipeline stages:

```
solveCardinality() → TypeResolvedPatch → TypedPatch → TimeResolvedPatch
    → DepGraphWithTimeModel → AcyclicOrLegalGraph → lowerBlockInstance()
```

Any break in this chain would produce the same symptom. Debugging required tracing through all five stages to verify the chain was intact (it was — the break was in the solver itself, not the threading).

### 3b. Invisible Corruption in Union-Find

The UF poisoning is invisible at the point it occurs. When Phase 4 commits `one` to `19:h:in`, the UF looks correct — an input port that declares `card=one` gets `card=one`. The corruption is *side-effect based*: the shared root means `2:out:out` silently also becomes `one`. There's no error, no warning, no assertion. The solver reports success.

The only way to observe this is to dump the UF state and trace root sharing across blocks — which requires understanding the entire 5-phase solver algorithm.

### 3c. Correct Symptom, Wrong Suspected Location

The runtime error "Intrinsic expressions are field-extent, not signal-extent" points at the *evaluator* (`ValueExprSignalEvaluator.ts`), suggesting the issue is in runtime dispatch. But the actual bug is in the *compiler frontend* (solver) and *compiler backend* (block lowering). The error manifests 3 pipeline stages after the root cause.

### 3d. Multiple Independent Failures Overlap

Even after fixing the solver (Failure A), the bug persisted because of Failure B (hardcoded intermediate types). And even after fixing Failure B, it persisted because of Failure C (missing opcodes). Each fix revealed the next layer, making it feel like the problem was moving.

### 3e. Phase 4 Fixpoint Iteration Obscures Ordering

Phase 4 uses a fixpoint loop (`while phase4Changed`), so the processing order depends on the iteration and the order of `zipBroadcastGroups` map entries. In one iteration, block #19 commits `one` before block #2 can commit `many`. The fixpoint loop *should* converge on the right answer, but the UF root sharing means the damage is done in iteration 1 and can't be undone.

### 3f. Fallback Masking

The lowering code uses a fallback pattern:
```typescript
const resolved = portTypes?.get(portKey(blockIndex, portName, 'out'));
const fallback = blockDef.outputs[portName].type as CanonicalType;
const chosen = (resolved ?? fallback) as CanonicalType;
```

This is *designed* to gracefully degrade, but it means the system silently uses the wrong type (static definition type with `card=one`) instead of failing loudly when the solver output is incorrect.

---

## 4. Tools for Faster Isolation Next Time

### 4a. Cardinality Solver Trace Mode

**What:** An env-var-gated trace that dumps the UF state after each phase: which ports share roots, what values are assigned to each root, and what pendingOne entries exist.

**Why:** The UF root sharing was the root cause but invisible without manual dump code. A built-in trace mode would have immediately shown that `2:out:out` shares a root with `19:h:in` after Phase 3.

**Implementation:** Add a `trace` option to `SolveCardinalityInput` that logs:
- Phase 1: Which ports are in which groups
- Phase 3: Each edge union, including the resulting root
- Phase 4: Each pendingOne commit decision, including root check
- Phase 5: Final port → cardinality mapping

### 4b. Cardinality Assertion in IR Builder

**What:** When `ctx.b.kernelZip()` or `ctx.b.kernelMap()` creates an expression, assert that the output type's cardinality is compatible with the input types' cardinalities.

**Why:** A `kernelZip` operating on field inputs (card=many) must produce field output (card=many). If the output type has card=one, this is always a bug. This assertion would have caught Failure B immediately.

**Implementation:** In `IRBuilder.kernelZip()` and `IRBuilder.kernelMap()`:
```typescript
const maxInputCard = inputs.map(id => getExpr(id).type.extent.cardinality);
if (anyMany(maxInputCard) && outputType.extent.cardinality is one) {
  throw new Error(`kernelZip output card=one but inputs include card=many`);
}
```

### 4c. Opcode Coverage Test

**What:** An automated test that verifies every opcode in `OpCode` enum is handled by *both* `OpcodeInterpreter.ts` and `ValueExprMaterializer.ts`.

**Why:** Failure C was caused by adding opcodes to one evaluator but not the other. A coverage test would catch this instantly.

**Implementation:** A test that extracts all opcode cases from both files and asserts they match.

### 4d. Post-Solve Cardinality Audit

**What:** After the solver runs, verify that for every edge in the graph, if the source port has `card=many`, the target port also has `card=many` (unless the target is a known broadcast input in a zipBroadcast group).

**Why:** This audit would have caught the UF poisoning: port `2:out:out` with `card=one` is connected to a field context, which is impossible.

---

## 5. Structural Changes to Fail Noisily and Early

### 5a. Eliminate the Fallback in `outTypes` Resolution

The current code:
```typescript
const chosen = (resolved ?? fallback) as CanonicalType;
```

This silently uses the block definition's static type when the solver output is missing. **This should be a loud failure.** If a block is in the graph, its output port must be in the solver's output map. A missing entry means the solver has a bug.

**Proposed change:**
```typescript
const resolved = portTypes?.get(portKey(blockIndex, portName, 'out'));
if (!resolved) {
  throw new Error(
    `Cardinality solver did not produce a type for ${block.type}#${block.id}.${portName}:out. ` +
    `This is a compiler bug — the solver must resolve all port types.`
  );
}
const chosen = resolved;
```

**Exception:** Only blocks that are *not* connected to anything (orphan blocks) should use the fallback. This can be checked explicitly.

### 5b. Ban `canonicalType()` in Block `lower()` Functions for Result Expressions

Block lowering functions should not construct types for result expressions using `canonicalType()`. They should always derive types from `ctx.outTypes[0]` or from input types. `canonicalType()` is fine for constant creation (constants are always scalar), but intermediate and output expressions must use the solver's resolved type.

**Enforcement:** A lint rule or code review checklist that flags `canonicalType(...)` used as the type argument to `kernelZip`, `kernelMap`, or `kernelBroadcast` inside a `lower()` function.

### 5c. Make Cardinality a Part of IR Expression Validation

The IR builder should validate that expressions it creates have consistent cardinalities:
- `kernelZip` with mixed-cardinality inputs is only valid for zipBroadcast blocks
- `kernelMap` must preserve the cardinality of its input
- `broadcast` must produce `many` from `one`
- `construct` must match all component cardinalities

These invariants should be checked mechanically at expression creation time, not at runtime evaluation time.

### 5d. Single Opcode Definition Table

Instead of two independent switch statements, define opcodes once in a table:
```typescript
const OPCODES = {
  wrap01: { arity: 1, fn: (args) => ((args[0] % 1) + 1) % 1 },
  hash:   { arity: 2, fn: (args) => { /* ... */ } },
  // ...
};
```

Both `OpcodeInterpreter.ts` and `ValueExprMaterializer.ts` consume this table. Adding an opcode once makes it available everywhere. This enforces the "one type per behavior" law.

### 5e. UF Root Sharing Invariant in Solver

After Phase 3 (edge unions), the solver should check: for any zip OUTPUT port, if its UF root is shared with a downstream port that has a `pendingOne` entry, the root must NOT be committed to `one`. This is exactly the fix we applied, but it should be documented as an invariant with an assertion, not just a conditional skip.

---

## 6. Causal Chain (Step-by-Step Bug Cause)

This is the exact sequence that causes the runtime crash. No investigation steps — only the chain of causation.

1. **Adapter block #2 (ScalarToPhase01) is auto-inserted** between Array's `t` output (scalar, card=many) and MakeColorHSL's `h` input (phase/turns, card=one). The adapter has `cardinalityMode: 'preserve'` with `broadcastPolicy: 'allowZipSig'`.

2. **Phase 1 of the solver** creates UF nodes for the adapter's ports. Because it's `zipBroadcast`, its ports (`2:in:in`, `2:out:out`) stay independent (not unioned to each other or to a group node).

3. **Phase 2 of the solver** encounters MakeColorHSL's `h` input port `19:h:in`. Its static type has `card=one`. Because `19:h:in` is a `zipMemberPort`, the solver defers it to `pendingOneNodes` instead of assigning `one` immediately.

4. **Phase 3 of the solver** processes edges. Edge `2:out:out → 19:h:in` causes `uf.union(fromNode, toNode)`. Both are unresolved, so the union succeeds and they now **share a UF root**.

5. **Phase 4, iteration 1** processes the zipBroadcast group for MakeColorHSL. It finds `bestMany` from another port in the group. It iterates over the group's ports and reaches `19:h:in`:
   - `19:h:in` is unresolved
   - `19:h:in` has a `pendingOne` entry
   - `19:h:in` is an input port (not output)
   - **The old code commits `one` to `19:h:in`'s UF node**
   - Because `19:h:in` shares a UF root with `2:out:out`, the root is now set to `one`

6. **Phase 4 continues** processing the adapter's zipBroadcast group. It checks `2:out:out`:
   - `uf.resolved(2:out:out)` returns `one` (because the root was just set in step 5)
   - `2:out:out` is already resolved — Phase 4 skips it
   - **The adapter's output is now permanently `card=one`**

7. **Phase 5** writes resolved cardinalities back. `2:out:out` gets `cardinality: one`.

8. **Lowering phase** reads `portTypes.get('2:out:out')` and gets a type with `cardinality: one`. This becomes `ctx.outTypes[0]` for the ScalarToPhase01 adapter.

9. **ScalarToPhase01's `lower()` function** creates a `kernelMap` expression with `outType` that has `card=one`. Even though the input expression has `card=many` (it comes from a field source), the output expression is tagged as signal-extent.

10. **Downstream blocks** (MakeColorHSL) receive this expression and try to zip it with other field expressions. The evaluator tries to evaluate it as a signal (because `card=one`), hits an intrinsic expression (which is field-only), and throws: `Intrinsic expressions are field-extent, not signal-extent`.

**The fix** adds step 5b: before committing `one` to `19:h:in`, check if its UF root is shared with a zip OUTPUT port from a *different block*. Since `2:out:out` (block #2) shares the root and is a zip output port, the commit is skipped. `2:out:out` later gets `many` from the group's `bestMany`, which is correct.
