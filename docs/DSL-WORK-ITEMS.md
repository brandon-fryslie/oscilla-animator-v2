# DSL Work Items

Outstanding work identified during DSL audit (2026-04-04). Organized by DSL, roughly prioritized within each section by impact. Many of these are intentionally deferred — noted where context is known.

---

## Patch DSL

**No significant issues identified.** Strongest DSL in the project. Proper parser, clean round-trip, deterministic output. The shared lexer/parser infrastructure serves both Patch and Composite HCL formats.

---

## Composite HCL DSL + Editor

> Context: Editor was built as working infrastructure but wasn't prioritized while renderer and migration-backend work were the focus. Much of this is "finish what was started" work.

### COMP-1: Position loss on HCL round-trip
When the user edits HCL text and blurs, `fromHCL()` resets all block positions to a deterministic grid. Visual layout built in the graph editor is destroyed. Options:
- Store positions as HCL comments/pragmas
- Preserve positions for blocks whose ID didn't change during `fromHCL()`
- Accept this as a known limitation and document it

**Files:** `CompositeEditorStore.ts` (`fromHCL()` method, ~line 819)

### COMP-2: Textarea is not a code editor
No syntax highlighting, line numbers, bracket matching, autocomplete, or inline error markers. The HCL tab is a plain `<textarea>`. For a format with its own editor panel, this undersells the investment.

**Files:** `CompositeEditorDslSidebar.tsx`

### COMP-3: No type checking in HCL editing flow
You can wire incompatible types (float output -> bool input) in HCL text and it deserializes successfully. Type errors only surface later when the composite is used in a graph. Neither the HCL deserializer nor the builder API validates port type compatibility.

**Files:** `composite-deserialize.ts`, `CompositeEditorStore.ts` (`fromHCL()`)

### COMP-4: Capability recomputed, not round-tripped
`buildCompositeDef()` ignores the serialized `capability` attribute and recomputes it from internal blocks. Editing HCL to remove a stateful block silently changes capability. The serialized value and the computed value can disagree.

**Files:** `CompositeEditorStore.ts` (`buildCompositeDef()`, ~line 872)

### COMP-5: Bidirectional sync race window
MobX reaction + `isFocused` state + 200ms debounce has a theoretical race between browser focus events and React state updates. The reaction is torn down and recreated on every focus change (dependency array includes `isFocused`).

**Files:** `CompositeEditorDslSidebar.tsx` (`useEffect` at ~line 39)

### COMP-6: No editor integration tests for bidirectional sync
28 round-trip tests cover serialization, but the sync behavior (debounce timing, focus handling, position loss) isn't tested. The most fragile part is the least tested.

**Files:** `src/patch-dsl/__tests__/composite-store-integration.test.ts`

---

## Expression DSL

### EXPR-1: V1-only backend (C1 port needed)
`compile.ts` emits V1 IR (`ValueExprId` via `BlockIRBuilder`). When C1 migration reaches Expression blocks, this needs a parallel `compile-c1.ts` targeting `ExprIR`. The architecture supports this cleanly — lexer/parser/typechecker are backend-agnostic, only the last stage needs replacement.

**Files:** `src/expr/compile.ts` (swap target), `src/blocks/math/expression.ts` (V1 block registration)

### EXPR-2: Boolean algebra via arithmetic hacks
`&&` compiles to `a * b`, `||` to `min(a + b, 1)`, `<=` to `!(a > b)`. Correct for `[0,1]` floats but assumes boolean values are always 0 or 1. If CanonicalType's bool payload ever becomes a real boolean, these break.

**Files:** `src/expr/compile.ts` (boolean operator synthesis)

### EXPR-3: Block references bypass typechecker
The `refs` mechanism for referencing other blocks' outputs is stringly-typed and resolved in `compile.ts`, not in `typecheck.ts`. Typos fail at compile time, not at typecheck time. The typechecker doesn't know about block references at all.

**Files:** `src/expr/compile.ts`, `src/blocks/math/expression.ts`

### EXPR-4: No extensibility path for user-defined functions
19 built-in functions are hardcoded in `FUNCTION_SIGNATURES`. No plugin mechanism for user-defined functions or domain-specific builtins. Frozen grammar prevents organic growth. Fine today, constraint if Expression blocks become a primary authoring surface.

**Files:** `src/expr/typecheck.ts` (`FUNCTION_SIGNATURES`)

---

## Boundary DSL

### BDSL-1: `fn.toString()` dependency is a deployment bomb
The entire DSL depends on `Function.prototype.toString()` producing parseable source. Any build tool that minifies, transpiles, or decorates arrow functions will break this. Currently safe because Vite preserves arrow function source in dev, but production builds with aggressive minification would fail silently.

**Files:** `src/render/gpu-ir/walker.ts`, `src/render/gpu-ir/compile.ts`

### BDSL-2: Free variables silently become NaN
If a variable name in an arrow function doesn't match a known proxy property, the walker silently produces a `NaN` literal. No error, no warning. Violates `[LAW:no-silent-fallbacks]`.

**Files:** `src/render/gpu-ir/walker.ts` (identifier resolution)

### BDSL-4: Scope for this DSL shrinking
As C1 block migration progresses, blocks will emit `ExprIR` directly via `ir-builders.ts`. The Boundary DSL's role narrows to fixture authoring only. At some point the DSL may not justify its maintenance cost. Worth tracking but not actionable now.

**Files:** N/A (architectural observation)

---

## Block DSL (Pillars)

### BLKC1-1: Registry erases concrete block generics
The current Pillars registry is value-based, but `ALL_BLOCKS` and `buildRegistry()` still erase every block to `BlockDefinition<unknown, unknown>`. That means the compiler loses the concrete config/lower-args shape at registration time and relies on local discipline inside each block module instead of preserving those types across the registry boundary.

**Files:** `src/pillars/blocks/index.ts`, `src/pillars/frontend/registry.ts`, `src/pillars/block-api.ts`

### BLKC1-2: Block migration remains a long-tail problem
Only a small Pillars block set is implemented today. The repo still carries the older `src/blocks/` library, so the migration problem is now "port or replace legacy block behavior into Pillars-style definitions with tests" rather than "add another side-effect registration layer." Not a DSL design problem by itself, but this remains the highest-volume authoring surface in the migration.

**Files:** `src/pillars/blocks/index.ts`, `src/blocks/all.ts`
