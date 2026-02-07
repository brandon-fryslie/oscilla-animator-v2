# Evaluation: HCL CLI Compiler (Offline Patch Validation)

**Date:** 2026-02-06
**Topic:** Build a CLI tool that reads HCL patch files, compiles them using the real compiler/block library/type system, and reports whether they're valid - without a browser.

## Current State Assessment

### What Already Exists

1. **HCL DSL** (`src/patch-dsl/`) - Complete serialize/deserialize pipeline
   - `deserializePatchFromHCL(hcl: string) → { patch, errors, warnings }`
   - `serializePatchToHCL(patch, options?) → string`
   - Full lexer, parser, AST, and patch-from-ast conversion
   - Round-trip tests with 12+ demo patches

2. **Compiler** (`src/compiler/compile.ts`) - Fully functional headless
   - `compile(patch: Patch, options?: CompileOptions) → CompileResult`
   - `options` is optional - `events` (EventHub) is not required
   - `compilationInspector` calls are wrapped in try/catch (graceful degradation)
   - `performance.now()` is available in Node.js
   - Tests already call `compile(patch)` with no options, no browser

3. **Block Registry** (`src/blocks/all.ts`) - Side-effect import registers all blocks
   - Already imported by `compile.ts` itself (`import '../blocks/all'`)

4. **Demo patches** (`src/demo/*.ts`) - 12+ programmatic patch builders
   - Each exports a `PatchBuilder` function: `(b: PatchBuilder) => void`

### What Does NOT Exist

- No CLI entry point
- No way to run `compile()` from the command line
- No way to feed an `.hcl` file → compile → get structured output

### Browser Dependencies in Compile Path

| Dependency | Location | Risk |
|------------|----------|------|
| `performance.now()` | `compile.ts:104` | None - available in Node.js |
| `compilationInspector` (MobX) | `compile.ts:108` | Low - wrapped in try/catch, optional |
| `console.warn/error` | Throughout | None - available in Node.js |
| `Date.now()` | `compile.ts` | None - available in Node.js |

**Verdict: The compiler is already browser-free.** The only coupling is `compilationInspector` which uses MobX but is wrapped in try/catch and will silently fail. Since Vitest tests already run compile() headlessly via Node.js, this is proven to work.

### Architecture Fit

The path is clean:
```
.hcl file → readFile → deserializePatchFromHCL() → Patch → compile() → CompileResult → structured output
```

No new abstractions needed. The existing pipeline already does exactly this in tests.

## Verdict: CONTINUE

**No blockers, no ambiguities requiring user input.** This is a straightforward wiring task.

## Key Design Decisions (Pre-Resolved)

1. **Execution environment**: Vitest script (not a standalone Node.js binary) - avoids needing a separate build step, already has the right module resolution and TypeScript support
2. **Entry point**: A thin script that orchestrates: read file → deserialize → compile → report
3. **Output**: Structured JSON for machine consumption + human-readable summary
