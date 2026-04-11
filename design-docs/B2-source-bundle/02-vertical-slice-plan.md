# 02: SourceBundle Vertical Slice — Next Step Plan

**Status:** Proposed
**Prerequisite:** Read `01-engineering-design.md`
**Estimated effort:** ~1 day
**Disposable:** Yes — if the result is bad, throw it away and rethink

---

## Goal

Reproduce the existing `dynamic-ring` fixture's visual output (64 orbiting, color-cycling dots) but with `SourceBundle` as the IR shape instead of decomposed scalar wiring. Same pixels on screen. Different IR underneath.

This is a low-risk, high-information experiment. It forces every concrete decision in the design to surface as code, while staying small enough to discard if the result is unsatisfying.

## Why This Slice Specifically

The compiler-tester app bypasses the frontend type solver entirely. Fixtures construct `NormalizedPatch` objects directly and pipe them through C1 to the Rust renderer. This is the perfect environment for validating C1 backend changes in isolation:

- The big type system question (where SourceBundle lives relative to `CanonicalType`) stays deferred.
- We have a working baseline (`dynamic-ring`) to compare pixel output against.
- Every concrete decision becomes "must-solve" rather than "let's discuss."
- One day of work produces a working artifact, not just more design.

## What Gets Built

### 1. `SourceBundle` type definition

Add to `src/compiler/backend-v2/types.ts`:

```typescript
/**
 * A SourceBundle is a named collection of field expressions.
 * At the IR level it's just a record — no new ExprIR/StatementIR types needed.
 * The "bundle-ness" is structural: a record is a bundle.
 */
export type SourceBundle = Readonly<Record<string, ExprIR>>;
```

**Hypothesis:** This is sufficient. The existing `proxy.outputs` already has the right shape. Validation is the slice.

### 2. Bundle-aware edges in the lowering walker

Currently `src/compiler/backend-v2/lowering.ts` line 118 does:
```typescript
const expr = upstreamResult.outputs[edge.fromPort] ?? null;
```
It grabs ONE port. For bundle edges, we want the whole `outputs` record.

**Proposed change:** Add a `kind: 'scalar' | 'bundle'` discriminator to `NormalizedEdge` (or use a sentinel `fromPort` value like `'@bundle'`). When the walker encounters a bundle edge, it passes the entire upstream `outputs` record into the downstream block's lowering context under a new key:

```typescript
interface C1LoweringContext {
  // ...existing fields...
  /** Bundle inputs keyed by the consuming block's bundle slot name */
  readonly inputBundles: Readonly<Record<string, SourceBundle>>;
}
```

Both `inputsById` (scalar ports) and `inputBundles` coexist. Existing scalar blocks (`Add`, `Sin`, etc.) keep using `inputsById` and don't need to change. New bundle blocks read `inputBundles`.

**Hypothesis to validate:** This minimal change is sufficient. The walker doesn't need to know anything more. Multi-fanout still works because the `PassScopeManager` operates on individual `ExprIR` nodes inside the bundle, not the bundle itself.

### 3. New Generator block: `OrbitGenerator`

`src/blocks-v2/orbit-generator.ts`:

```typescript
registerC1Block('OrbitGenerator', {
  manifestRequirements: (ctx) => ({
    domains: {
      [ctx.config.domainId]: { capacity: 64, /* ... */ },
    },
    // ...
  }),
  lower: (ctx) => {
    const angle = /* fused expression: gid * 2π/64 + time */;
    return {
      kind: 'proxy',
      outputs: {
        // The bundle: a record of named field expressions
        pos_x: callBuiltin('cos', [angle]),
        pos_y: callBuiltin('sin', [angle]),
        color_r: litF32(1),
        color_g: litF32(0.5),
        color_b: litF32(0.2),
      },
    };
  },
});
```

This block produces a complete `SourceBundle` directly — no upstream wiring needed. It's the "Particles" generator from the design discussions, simplified to the minimum.

### 4. Hand-coded Expression Modifier block

**No expression text parser yet.** The slice uses a TS-coded function instead:

`src/blocks-v2/modifier-warp.ts`:

```typescript
registerC1Block('ModifierWarp', {
  lower: (ctx) => {
    const inputBundle = ctx.inputBundles['primary'];
    if (!inputBundle) throw new Error('ModifierWarp requires a primary bundle input');
    return {
      kind: 'proxy',
      outputs: {
        ...inputBundle, // pass through unchanged fields
        pos_y: callBuiltin('sin', [
          binop('*', inputBundle.pos_x, litF32(2.0)),
        ]),
      },
    };
  },
});
```

This is the simplest possible modifier: receives a bundle, modifies one field (`pos_y` becomes `sin(pos_x * 2)`), passes everything else through. All the math is hardcoded in TypeScript.

The expression text parser is a separate, future slice. The point of THIS slice is to validate the data flow.

### 5. Update `RenderInstances2D` to accept a bundle

The current `src/blocks-v2/render-instances-2d.ts` reads scalar inputs. Replace its primary input with a single bundle:

```typescript
lower: (ctx) => {
  const bundle = ctx.inputBundles['primary'];
  if (!bundle) throw new Error('RenderInstances2D requires a primary bundle input');

  const computeAst: StatementIR[] = [
    let_('gid', intrinsic('global_invocation_id.x')),
  ];
  // Iterate the bundle's fields and emit one StoreField per field
  for (const [fieldName, expr] of Object.entries(bundle)) {
    computeAst.push(storeField(`${domainId}:${fieldName}`, ref('gid'), expr));
  }
  // ...rest of compute pass + render pass setup
},
```

The block no longer enumerates `pos_x`, `pos_y`, etc. by name. It iterates whatever fields the bundle provides. The manifest declarations come from the Generator (it knows its bundle's field set).

**Backward compat decision for the slice:** Keep the old scalar input ports as a fallback path so existing fixtures don't break. Or just break them and don't run them. The slice is throwaway, so breaking the old fixture is fine if the new one works.

### 6. New compiler-tester fixture

`src/compiler-tester/fixtures/source-bundle-ring.ts`:

```typescript
// Three blocks, two bundle edges
const blocks = [
  { id: 'gen', type: 'OrbitGenerator', params: { domainId: 'dots' } },
  { id: 'mod', type: 'ModifierWarp', params: {} },
  { id: 'sink', type: 'RenderInstances2D', params: { domainId: 'dots', capacity: 64 } },
];
const edges = [
  // Bundle edges — kind: 'bundle' tells the walker to forward the whole record
  edge('gen', '@out', 'mod', 'primary', 'bundle'),
  edge('mod', '@out', 'sink', 'primary', 'bundle'),
];
```

Wire it up in the compiler-tester app's fixture selector.

### 7. Visual validation

```bash
./scripts/get-screenshot-of-compiler-tester.sh
```

The new fixture should produce 64 dots in a warped orbit pattern. If it doesn't, the slice failed and we learn what's missing.

## What We Learn From Building It

Each item below is a real question the slice will answer:

| Question | How the slice answers it |
|----------|-------------------------|
| Is `Record<string, ExprIR>` enough for SourceBundle? | If the slice works without adding metadata, yes. If we have to bolt on field types or domain refs, no. |
| How invasive are the lowering walker changes? | Measured in lines of `lowering.ts` diff. |
| Does multi-fanout still work? | Add a second sink to the fixture and see if `PassScopeManager` shares correctly. |
| Does the compiler-tester app handle the new block types cleanly? | If the fixture selector wiring works, yes. |
| Is the Generator's manifest declaration awkward? | Subjective, but we'll see whether `manifestRequirements` needs new affordances for bundle outputs. |
| Does spread-then-replace (`{ ...inputBundle, pos_y: ... }`) feel right for Modifier authoring? | Direct experience writing the block answers this. |

## What We Explicitly Defer

These are NOT in scope for the slice. Each becomes its own slice once the foundation works:

- **Expression text parsing.** Modifiers in this slice are hand-coded TS functions.
- **Variadic ports in the Patch model.** Compiler-tester fixtures construct edges directly; we don't touch `Block.inputPorts`.
- **Frontend type solver integration.** SourceBundle stays a backend-only concept.
- **Cross-domain reads.** The slice has one domain (`dots`).
- **Feedback cycles.** The slice is a linear chain.
- **`Make` and `Break` blocks.** Not needed for this slice.
- **Frontend graph editor UI.** No user-facing changes.
- **Renaming Construct → Make / Extract → Break.** Those don't exist in C1 yet.

## Decision Points That Might Surface

If the slice exposes any of these as hard problems, we pause and rethink:

1. **The walker needs to understand bundle wires deeply.** If adding bundle edges requires touching multi-fanout logic, sink discovery, or topo sort in non-trivial ways, the IR may need a real "bundle" type rather than the structural-record approach.

2. **`RenderInstances2D` needs more context than the bundle provides.** If iterating fields blindly fails because the sink needs to know which field is "position" vs "color" vs "size", then SourceBundle needs typed roles, not just names.

3. **The Modifier's spread-and-replace pattern is unwieldy.** If `{ ...inputBundle, pos_y: newExpr }` becomes hard to read for non-trivial transformations, we may want a fluent API or DSL helper.

4. **The compiler-tester fixture format becomes awkward.** If the bundle-edge wiring is harder to write than scalar-edge wiring, the design has friction we need to address before propagating it to the frontend.

## Success Criteria

1. `npx vitest run src/compiler/backend-v2/__tests__/` passes (existing tests continue to work).
2. `npm run typecheck` passes.
3. The new `source-bundle-ring` fixture compiles through C1 without errors.
4. `./scripts/get-screenshot-of-compiler-tester.sh` produces a visual that's recognizably "64 orbiting, warped dots" matching the design intent.
5. The diff is small enough to review in one sitting (~500 lines net).
6. We have a clear answer to: "Should we expand this approach, or is there a fundamental problem?"

## After the Slice

If the slice works cleanly, the next slices in order:

1. Expression text parser — lift the hand-coded modifier into a `bundle.field = expr` text DSL
2. Multi-bundle inputs (secondary read-only bundles for cross-domain reads)
3. Feedback cycle handling (back-edge detection and materialization)
4. Variadic port UI in the graph editor
5. Frontend type solver integration

Each is its own decision point. We don't commit to the full sequence — we commit to validating one piece at a time.

If the slice exposes a fundamental problem, we pause, write down what we learned, and rethink. The cost of throwing it away is small. The cost of building everything on a broken foundation is enormous.
