# Implementation Context: HCL CLI Compiler

## Key Files to Touch

| File | Action | Purpose |
|------|--------|---------|
| `src/cli/compile-hcl.ts` | **CREATE** | CLI entry point |
| `src/cli/__tests__/compile-hcl.test.ts` | **CREATE** | Tests |
| `package.json` | **EDIT** | Add `compile:hcl` script, possibly add `tsx` devDep |

## Architecture

```
                  ┌──────────────────────────┐
                  │  src/cli/compile-hcl.ts   │
                  │  (CLI entry point)        │
                  └─────────┬────────────────┘
                            │
                    ┌───────▼────────┐
                    │  Read .hcl file │  (fs.readFileSync)
                    └───────┬────────┘
                            │
              ┌─────────────▼──────────────┐
              │  deserializePatchFromHCL()  │  (src/patch-dsl)
              └─────────────┬──────────────┘
                            │
                   ┌────────▼────────┐
                   │    compile()    │  (src/compiler/compile.ts)
                   └────────┬────────┘
                            │
                  ┌─────────▼──────────┐
                  │  Format & Output   │  (JSON or human-readable)
                  └────────────────────┘
```

## Import Strategy

The CLI file imports from the existing src/ tree:
```typescript
import { deserializePatchFromHCL } from '../patch-dsl';
import { compile } from '../compiler/compile';
// blocks/all is auto-imported by compile.ts
```

No new abstractions. The CLI is a thin script that wires existing functions.

## Testability

Export the core logic separately from the CLI argument parsing:

```typescript
// Exported for testing
export function compileHcl(hclText: string): CompileHclResult { ... }

// CLI-only (reads argv, files, prints output)
if (import.meta.url === ...) { main(); }
```

Tests call `compileHcl()` directly - no subprocess spawning needed.

## Known Gotchas

1. **Path aliases**: `tsx` may not resolve `@/*` aliases without `--tsconfig`.
   Use `tsx --tsconfig tsconfig.json src/cli/compile-hcl.ts` in the npm script,
   or use relative imports in the CLI file.

2. **MobX singleton**: `compilationInspector` in compile.ts imports MobX.
   Already wrapped in try/catch. MobX works fine in Node.js anyway, so no issue.

3. **jsdom**: Some block definitions might touch DOM APIs at registration time.
   Unlikely since tests work without jsdom for compile tests, but worth verifying.
   If needed, the vitest config already provides jsdom.

## Execution Strategy

Since Vitest already provides the right TypeScript + module resolution environment,
an alternative to `tsx` is running as a Vitest script. But `tsx` is simpler and
more appropriate for a CLI tool that should work independently of the test framework.
