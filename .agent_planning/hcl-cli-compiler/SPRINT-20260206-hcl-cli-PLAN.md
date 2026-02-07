# Sprint: hcl-cli - Offline HCL Patch Compiler

Generated: 2026-02-06
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Create a CLI tool that reads `.hcl` patch files and compiles them using the real compiler pipeline, reporting validity without a browser.

## Scope

**Deliverables:**
1. `src/cli/compile-hcl.ts` - CLI entry point script
2. `npm run compile:hcl` - package.json script to invoke it
3. Tests validating the CLI pipeline end-to-end

## Work Items

### P0: CLI Entry Point (`src/cli/compile-hcl.ts`)

**What it does:**
```
npx tsx src/cli/compile-hcl.ts path/to/patch.hcl [--json] [--verbose]
```

or via npm script:
```
npm run compile:hcl -- path/to/patch.hcl
```

**Pipeline:**
1. Read `.hcl` file from disk (or stdin)
2. Call `deserializePatchFromHCL(hclText)`
3. Check for DSL parse errors → report and exit(1) if fatal
4. Call `compile(patch)` (no options needed - EventHub is optional)
5. Report result:
   - **Success**: exit(0), print summary (block count, schedule step count, slot count)
   - **Failure**: exit(1), print structured errors (kind, message, blockId, portId)

**Flags:**
- `--json`: Output machine-readable JSON instead of human text
- `--verbose`: Include full IR summary (value expr count, schedule details)
- No flag: Human-readable one-line summary

**Acceptance Criteria:**
- [ ] Reads an HCL file from a path argument
- [ ] Calls real `deserializePatchFromHCL` + real `compile()`
- [ ] Exits 0 on success, 1 on parse or compile errors
- [ ] `--json` flag emits structured JSON to stdout
- [ ] No browser, no DOM, no React dependencies in the import chain
- [ ] Works with `npx tsx` (no separate build step)

**Technical Notes:**
- Use `tsx` (already common in Node.js TS ecosystems) or leverage Vitest's runner
- The script can import directly from `src/` since tsx handles TS + path aliases
- Side-effect import of `src/blocks/all` happens automatically via `compile.ts`
- `compilationInspector` (MobX singleton) will silently fail in Node — this is fine

### P1: npm Script Integration

**Acceptance Criteria:**
- [ ] `npm run compile:hcl -- <file>` works
- [ ] Documented in the script's `--help` output

**Technical Notes:**
- Add to package.json scripts: `"compile:hcl": "tsx src/cli/compile-hcl.ts"`
- tsx is a devDependency (check if already present, add if not)

### P2: Test Coverage

**Acceptance Criteria:**
- [ ] Test: valid HCL → compile success (using demo patches serialized to HCL)
- [ ] Test: invalid HCL (syntax error) → parse error reported
- [ ] Test: valid HCL but invalid patch (no TimeRoot) → compile error reported
- [ ] Test: `--json` flag produces parseable JSON output
- [ ] Tests run as part of `npm run test`

**Technical Notes:**
- Tests can call the CLI function directly (no need for subprocess spawning)
- Export the core logic as a function for testability: `compileHclFile(path, opts) → result`
- Subprocess test optional (for integration validation)

## Dependencies

- `tsx` devDependency (may already be installed, check `package.json`)
- No new production dependencies

## Risks

| Risk | Mitigation |
|------|------------|
| MobX compilationInspector throws at import time | Already wrapped in try/catch; worst case, mock/stub it |
| Path alias `@/*` not resolved by tsx | Use `tsx --tsconfig tsconfig.json` or use relative imports in CLI file |
| Some block definition imports canvas/DOM at side-effect time | Unlikely — tests already import `blocks/all` in Node/jsdom; if needed, jsdom can be loaded |

## Output Format Examples

**Human-readable (default):**
```
OK  patch.hcl — compiled (12 blocks, 28 schedule steps, 15 slots)
```

**Human-readable (error):**
```
FAIL  patch.hcl
  [NoTimeRoot] No time root block found
  [TypeMismatch] Port 'phase' on block 'b2': expected phase01, got float
```

**JSON (`--json`):**
```json
{
  "file": "patch.hcl",
  "status": "ok",
  "blocks": 12,
  "scheduleSteps": 28,
  "slots": 15
}
```

```json
{
  "file": "patch.hcl",
  "status": "error",
  "parseErrors": [],
  "compileErrors": [
    { "kind": "NoTimeRoot", "message": "No time root block found" }
  ]
}
```
