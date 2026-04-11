# B2: SourceBundle + Expression-as-Modifier — Engineering Design

**Status:** Draft
**Subject:** How SourceBundles flow through Expression blocks, constrained by GPU execution model
**Prerequisite:** B0-4-Pillar-Arch-UBER.md

---

## 1. Engineering Constraints (Non-Negotiable)

These constraints come from the GPU execution model and the existing IR. They are facts, not choices.

### 1.1 One Compute Dispatch = One Domainx

A WebGPU compute pass dispatches N threads where N = domain capacity. Each thread processes one instance, indexed by `global_invocation_id.x`. All SoA fields in that domain are accessed by the same index.

**Consequence:** An Expression that writes to `dots:pos_y` dispatches with `dots`'s cardinality. The domain of the primary bundle determines the dispatch.

### 1.2 Cross-Domain Field Access Requires a Prior StoreField

Thread `i` in domain A can only read a field from domain B if domain B's compute pass has already run and stored that field to GPU memory. This requires:
1. A `StoreField` in an earlier compute pass (writing B's field to VRAM)
2. A `LoadField` in A's compute pass (reading from VRAM)

This is fundamentally different from same-domain reads, where the backward walk can fuse expressions without any field store.

**Consequence:** Accessing a field from a secondary bundle is always a `LoadField` (VRAM read). Accessing a field from the primary bundle can be a fused expression (zero-cost if the expression composes).

### 1.3 Expression Fusion Is the Normal Case

The current C1 backward walk (`lowering.ts`) resolves upstream blocks recursively, inlining their `ExprIR` outputs. A chain of math blocks compiles to a single fused expression tree — no intermediate VRAM stores. The only stores are at sinks (`StoreField` in the compute pass).

Multi-fanout (same expression consumed by 2+ downstream blocks) creates a `Let` binding (one ALU computation, one local variable). Still no VRAM store.

**Consequence:** Chaining Expression blocks in the same domain fuses to zero intermediate cost. The performance model is transparent: VRAM stores happen at sinks and at cross-domain boundaries. Nowhere else.

### 1.4 StoreField Is the Only Materialization Point

In the current IR, `StoreField` is emitted by sink blocks (RenderInstances2D). The backward walk from the sink collects all upstream expressions and emits one `StoreField` per field.

**Consequence:** Adding an Expression block between a Generator and a Sink does NOT add a store. It adds expression nodes to the fused tree. The number of `StoreField` statements is determined by the sink's field count, not the graph depth.

---

## 2. What Is a SourceBundle at the IR Level?

A SourceBundle is a `Record<string, ExprIR>` — a named collection of expression trees, one per field.

At any point in the graph, each field in the bundle maps to an expression that computes its value. For a Generator's output, these are initial expressions (intrinsics, constants, LoadField from manifest defaults). For a Modifier's output, some expressions are replaced with modified versions.

```
Generator output bundle:
  pos_x  → Intrinsic(cos(rank * 2π))
  pos_y  → Intrinsic(sin(rank * 2π))
  color_r → LiteralF32(1.0)
  color_g → LiteralF32(1.0)
  color_b → LiteralF32(1.0)

After Expression("dots.pos_y = sin(dots.pos_x * 2.0)"):
  pos_x  → Intrinsic(cos(rank * 2π))           // unchanged, pass through
  pos_y  → CallBuiltin(sin, BinaryOp(*, pos_x_expr, LiteralF32(2.0)))  // replaced
  color_r → LiteralF32(1.0)                     // unchanged
  color_g → LiteralF32(1.0)                     // unchanged
  color_b → LiteralF32(1.0)                     // unchanged
```

The bundle is never "stored" as a unit. It's a compile-time structure that the backward walk resolves field-by-field. When the sink requests `pos_y`, the walk traces back through the Expression block and retrieves the modified expression.

**This maps directly to the existing `C1LoweredBlock` proxy type:**

```typescript
type C1LoweredBlock =
  | { kind: 'proxy'; outputs: Record<string, ExprIR> }  // ← SourceBundle IS this
  | { kind: 'sink'; ... }
```

The only change: today `outputs` has port names like `'out'`. In the SourceBundle model, `outputs` has field names like `'pos_x'`, `'pos_y'`, `'color_r'`.

---

## 3. Primary Bundle: Why It's Privileged

### The Constraint

A compute dispatch runs at one cardinality. If the Expression writes to `dots:pos_y`, the dispatch is `dots.capacity` threads. There's no way to write to two different domains in one dispatch without either atomics or a separate pass.

### The Design

An Expression block has exactly one **primary** SourceBundle input. This bundle:
1. Determines the compute dispatch domain
2. Is the only bundle whose fields can be written (modified)
3. Provides zero-cost field reads (fused expressions, no VRAM load)

The output is a new SourceBundle with the same fields, some with modified expressions.

### Secondary Bundles

An Expression block has zero or more **secondary** SourceBundle inputs. These:
1. Are read-only (the Expression cannot modify their fields)
2. Require the secondary bundle's fields to already be stored in VRAM (a prior compute pass must have run)
3. Access via `LoadField` — a real VRAM read, not a fused expression

This distinction is not a UX choice. It's the GPU execution model.

### Cross-Domain Reads: The Performance Implication

Reading `secondary.field` costs one VRAM load per thread. This is explicit in the graph (the user wired a secondary bundle) and explicit in the IR (`LoadField`). There is no way for a small graph change to silently introduce this cost — the user creates the cross-domain wire deliberately.

Same-domain reads between chained Expression blocks cost nothing — the backward walk fuses them. Adding or removing Expression blocks in the same domain does not change VRAM access patterns.

---

## 4. Functional Semantics: No Mutation

Each Expression produces a **new** SourceBundle. The input bundle is not modified.

```
Generator ──→ Expression_A ──→ Expression_B ──→ Sink
         └──→ Expression_C ──→ Sink_2
```

- Expression_B sees A's output (with A's modifications)
- Expression_C sees the Generator's original output (without A's modifications)
- There is no ambiguity about "which version" of a field a block sees — the graph edges determine it

This maps directly to the backward walk: the walk follows edges, not shared state. Each edge points to a specific block's output. The walk resolves the expression tree from that block.

**Why this matters for performance transparency:** If the user forks the graph (Generator output goes to both A and C), there is no hidden shared state. Each branch computes independently. The compiler may CSE (common subexpression elimination) across branches via `Let` bindings, but this is an optimization, not a semantic change.

---

## 5. How Expression Lowering Works

### 5.1 Compilation: Expression Text → ExprIR Replacements

The Expression block's `lower()` function:
1. Receives `inputsById` which contains the primary bundle (a `Record<string, ExprIR>`)
2. Parses the expression text
3. For each field read (`dots.pos_x`), resolves to the corresponding `ExprIR` from the input bundle
4. For each field write (`dots.pos_y = ...`), produces a replacement `ExprIR`
5. Returns a `proxy` with `outputs` = input fields, with written fields replaced

```typescript
// Pseudocode for Expression block lowering
lower: (ctx) => {
  const primaryBundle = ctx.inputBundles['primary'];  // Record<string, ExprIR>
  const parsed = parseExpression(ctx.config.expression);

  // Start with all fields passed through
  const outputs = { ...primaryBundle };

  // For each assignment in the expression, replace the field
  for (const assignment of parsed.assignments) {
    outputs[assignment.fieldName] = compileExpr(assignment.value, {
      // Field reads resolve to expressions from primary bundle
      resolveField: (bundleName, fieldName) => {
        if (bundleName === 'primary') return primaryBundle[fieldName];
        // Secondary bundles resolve to LoadField
        return loadField(secondarySymbol(bundleName, fieldName), ref('gid'));
      }
    });
  }

  return { kind: 'proxy', outputs };
}
```

### 5.2 Fusion Across Chained Expressions

Given: `Generator → ExprA("dots.pos_y = sin(dots.pos_x)") → ExprB("dots.color_r = dots.pos_y * 0.5 + 0.5") → Sink`

The backward walk from the Sink:
1. Sink requests `color_r` → walks to ExprB
2. ExprB's `color_r` = `BinaryOp(+, BinaryOp(*, pos_y_expr, 0.5), 0.5)` where `pos_y_expr` is resolved from ExprB's input
3. ExprB's input `pos_y` comes from ExprA → walks to ExprA
4. ExprA's `pos_y` = `CallBuiltin(sin, pos_x_expr)` where `pos_x_expr` is resolved from ExprA's input
5. ExprA's input `pos_x` comes from Generator → resolves to Generator's expression

**Result:** `color_r = sin(cos(rank * 2π)) * 0.5 + 0.5` — one fused expression. Zero intermediate stores. The two Expression blocks compiled away entirely.

### 5.3 Multi-Fanout

If ExprA's output `pos_y` is consumed by both ExprB and ExprC (two edges from ExprA), `PassScopeManager` creates a `Let` binding for the shared expression. One ALU computation, zero VRAM stores.

---

## 6. Resolved Design Questions

### Q: Is there a privileged "main" SourceBundle?

**Yes.** The primary bundle determines the compute dispatch domain and is the only writable bundle. This is a GPU execution constraint, not a choice. Secondary bundles are read-only and accessed via VRAM loads.

### Q: Can someone write to any bundle's field?

**No.** Writes are restricted to the primary bundle. Writing to a secondary bundle would require either a separate compute dispatch at that domain's cardinality, or atomic scatter writes (poor performance, limited types). To modify a different domain's fields, the user wires that domain's bundle as the primary input to a separate Expression block.

### Q: Does this result in variadic outputs?

**No.** The output is always one SourceBundle — the primary bundle with modifications applied. The field set is fixed (same fields as the primary input). The only variability is which fields have modified expressions.

### Q: Can a small graph change cause a 10x-100x performance cliff?

**No, with one explicit exception.** Within the same domain, adding or removing Expression blocks changes expression tree depth but not VRAM access patterns. The fusion model guarantees this.

The one explicit exception: wiring a secondary bundle from a different domain introduces `LoadField` calls (VRAM reads). But this is explicit — the user creates the cross-domain wire. The compiler could surface a diagnostic: "This connection reads from domain X (N VRAM loads per thread)."

### Q: How does the bundle wire enter the Expression block?

The Expression block has named input ports for each bundle:
- `primary`: the SourceBundle being modified (required)
- Additional named ports for secondary bundles (user adds these by wiring from other Generators/Expressions)

The port names become the namespace prefixes in the expression text: `primary.pos_x`, `clock.time`.

If the primary bundle is the only input, the namespace can be elided: `pos_y = sin(pos_x)` is sugar for `primary.pos_y = sin(primary.pos_x)`.

---

## 7. What Changes in the Existing C1 Pipeline

### `C1LoweredBlock` — No change needed

The `proxy` variant already returns `Record<string, ExprIR>`. Today those keys are port names (`out`). In the SourceBundle model, they're field names (`pos_x`, `pos_y`, etc.). The type is identical.

### `lowering.ts` backward walk — Minor change

The walk currently resolves `upstreamResult.outputs[edge.fromPort]` — a single expression per edge. For SourceBundle, the upstream block's outputs contain ALL fields, and the edge specifies which field (or the whole bundle) is being forwarded.

Two options:
1. **One edge per field** — each field flows as a separate edge. The graph becomes verbose but the walk is unchanged.
2. **One edge per bundle** — the edge carries the entire `Record<string, ExprIR>`. The walk needs to understand bundle-typed edges.

Option 2 is correct. The bundle is one value flowing through one wire. The `C1LoweredBlock.outputs` would need a bundle-typed variant alongside the scalar `ExprIR` variant.

### `PassScopeManager` — Minor change

Currently caches by `blockIndex`. With bundles, multi-fanout means the *bundle* is consumed by multiple downstreams. The scope manager would cache individual field expressions within the bundle (not the whole bundle, since different downstreams may read different fields).

### `RenderInstances2D` (Sink) — Significant change

Currently reads individual scalar inputs (`ctx.inputsById['pos_x']`). In the SourceBundle model, it receives one bundle and reads fields from it:

```typescript
const bundle = ctx.inputBundles['source'];  // Record<string, ExprIR>
for (const [field, expr] of Object.entries(bundle)) {
  computeAst.push(storeField(`${domainId}:${field}`, ref('gid'), expr));
}
```

The sink iterates the bundle's fields and emits one `StoreField` per field. The manifest field declarations come from the Generator's `manifestRequirements`, not the sink.

---

## 8. Open Questions

### 8.1 SourceBundle as a Type

How is a SourceBundle represented in the type system? The current `CanonicalType = { payload, unit, extent }` describes scalar/vector values. A SourceBundle is a record of named fields, each with its own type. This is a higher-level type.

Options:
- New payload kind: `{ kind: 'sourceBundle', fields: Record<string, CanonicalType> }`
- Separate type layer: `SourceBundleType` alongside `CanonicalType`
- Defer to the type system overhaul

### 8.2 Expression Parsing Timing

When does the expression text get parsed to determine field references?

- **At edit time:** The UI parses the expression as the user types. Field references are validated against the wired bundles. Invalid references get squiggly underlines. Ports are not affected (bundles are wired, not fields).
- **At compile time:** The frontend compiler parses the expression during lowering. Invalid references become compile errors.

Both are needed. Edit-time parsing for UX (autocomplete, validation). Compile-time parsing for correctness.

### 8.3 Namespace Elision

If the Expression has only one input bundle, should the namespace be required or optional?

- `pos_y = sin(pos_x)` (elided — primary assumed)
- `dots.pos_y = sin(dots.pos_x)` (explicit)

Elision is sugar that makes simple cases readable. The compiler can desugar before lowering.

### 8.4 Secondary Bundle Index Mapping

When reading a field from a secondary bundle (`other.vel_x`), what index is used for the `LoadField`?

- **Same cardinality:** Use `gid` (1:1 mapping). Compiler verifies cardinalities match.
- **Different cardinality:** Compile error. User must insert an explicit resampling block between the domains.
- **Scalar/global:** No index needed. Use `LoadGlobal` or `LoadScalar`.

The compile-error approach avoids silent performance cliffs. Resampling is a separate, explicit block — never implicit.

---

## 9. Summary

| Decision | Justification |
|----------|--------------|
| Primary bundle is privileged (writable) | GPU compute dispatch binds to one domain |
| Secondary bundles are read-only | Cross-domain writes require separate dispatch or atomics |
| No variadic outputs | Output = primary bundle with field modifications |
| Functional semantics (no mutation) | Maps to backward walk; graph edges determine field versions |
| Expression chains fuse to zero intermediate cost | Backward walk inlines expressions; StoreField only at sinks |
| Cross-domain reads are explicit VRAM loads | LoadField in IR; introduced by user wiring a secondary bundle |
| No silent performance cliffs | VRAM access pattern determined by bundle wiring, not expression depth |
| SourceBundle = Record<string, ExprIR> at IR level | Directly compatible with existing C1LoweredBlock proxy type |
