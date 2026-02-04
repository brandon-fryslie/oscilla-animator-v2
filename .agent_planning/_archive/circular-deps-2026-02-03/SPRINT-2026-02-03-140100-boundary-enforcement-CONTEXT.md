# Implementation Context: boundary-enforcement
Generated: 2026-02-03-140100
Source: EVALUATION-2026-02-03-131723.md

## Existing Infrastructure

### ESLint Config
- **File**: `/Users/bmf/code/oscilla-animator-v2/eslint.config.js`
- **Format**: ESLint 9 flat config (uses `tseslint.config(...)`)
- **Parser**: `typescript-eslint` parser
- **Custom plugin**: `oscilla` with 5 rules defined in `/Users/bmf/code/oscilla-animator-v2/eslint-rules/`
- **Scope**: Currently only lints specific files, NOT the entire `src/` directory

### Lint Command
- **package.json script**: `"lint": "eslint src/blocks/ src/runtime/ValueExprMaterializer.ts src/runtime/ValueExprSignalEvaluator.ts ..."`
- Boundary rules will likely need broader scope (entire `src/`)

### Module Dependency Map (ground truth from evaluation)

**Clean boundaries (enforce -- block regression):**
- `stores/` -> `compiler/`: 0 imports (CLEAN)
- `compiler/` -> `stores/`: 0 imports (CLEAN)
- `compiler/` -> `runtime/`: verify, should be 0
- `runtime/` -> `stores/`: verify, should be 0

**Known bidirectional (allow with waiver):**
- `blocks/` -> `compiler/ir/types.ts`: OpCode, stableStateId (~10 files)
- `blocks/` -> `compiler/ir/Indices.ts`: valueSlot, SYSTEM_PALETTE_SLOT, ValueExprId (~4 files)
- `blocks/` -> `compiler/ir/LowerSandbox.ts`: LowerSandbox class (1 file)
- `compiler/ir/LowerSandbox.ts` -> `blocks/registry.ts`: requireBlockDef (1 file)
- `compiler/backend/*.ts` -> `blocks/registry.ts`: getBlockDefinition (~3 files)
- `compiler/frontend/*.ts` -> `blocks/registry.ts`: getBlockDefinition, requireBlockDef (~6 files)

### Key Files for blocks/ -> compiler/ imports

```
src/blocks/signal/oscillator.ts      -> compiler/ir/types (OpCode), compiler/ir/Indices (ValueExprId)
src/blocks/signal/unit-delay.ts      -> compiler/ir/types (stableStateId)
src/blocks/signal/phasor.ts          -> compiler/ir/types (OpCode, stableStateId)
src/blocks/signal/lag.ts             -> compiler/ir/types (OpCode, stableStateId)
src/blocks/signal/hash.ts            -> compiler/ir/types (OpCode), compiler/ir/Indices (ValueExprId)
src/blocks/signal/accumulator.ts     -> compiler/ir/types (OpCode, stableStateId)
src/blocks/signal/default-source.ts  -> compiler/ir/LowerSandbox (LowerSandbox)
src/blocks/io/external-input.ts      -> compiler/ir/types (OpCode)
src/blocks/io/external-gate.ts       -> compiler/ir/types (OpCode)
src/blocks/event/sample-hold.ts      -> compiler/ir/types (OpCode, stableStateId), compiler/ir/Indices (ValueExprId)
src/blocks/time/infinite-time-root.ts -> compiler/ir/Indices (valueSlot, SYSTEM_PALETTE_SLOT)
src/blocks/dev/test-signal.ts        -> compiler/ir/Indices (ValueExprId)
```

### Key Files for compiler/ -> blocks/ imports

```
src/compiler/reachability.ts                       -> blocks/registry (getBlockDefinition)
src/compiler/backend/lower-blocks.ts               -> blocks/registry (getBlockDefinition, LowerCtx, LowerResult, hasLowerOutputsOnly)
src/compiler/backend/schedule-scc.ts               -> blocks/registry (getBlockDefinition)
src/compiler/backend/schedule-program.ts           -> blocks/registry (getBlockDefinition)
src/compiler/frontend/analyze-cycles.ts            -> blocks/registry (getBlockDefinition)
src/compiler/frontend/normalize-default-sources.ts -> blocks/registry (getBlockDefinition, requireBlockDef, InputDef)
src/compiler/frontend/normalize-composites.ts      -> blocks/registry, blocks/composite-types
src/compiler/frontend/analyze-type-graph.ts        -> blocks/registry (getBlockDefinition, getBlockCardinalityMetadata)
src/compiler/frontend/analyze-type-constraints.ts  -> blocks/registry (getBlockDefinition, getBlockCardinalityMetadata)
src/compiler/frontend/normalize-varargs.ts         -> blocks/registry (isVarargInput, requireBlockDef, VarargConstraint)
src/compiler/ir/LowerSandbox.ts                    -> blocks/registry (requireBlockDef, LowerArgs, LowerCtx)
```

## Tool Research Starting Points

### eslint-plugin-boundaries
- npm: `eslint-plugin-boundaries`
- Key question: Does it export a flat config compatible API?
- Config pattern: Define "elements" (module groups) and "rules" (allowed/forbidden imports between them)

### dependency-cruiser
- npm: `dependency-cruiser`
- Config: `.dependency-cruiser.cjs` or `.dependency-cruiser.mjs`
- Key feature: `--known-violations` flag allows existing violations to pass while flagging new ones
- Can generate SVG dependency graphs for visualization
- CLI: `npx depcruise --config .dependency-cruiser.cjs src/`

## Pattern to Follow

The existing eslint.config.js uses this pattern for adding rules:
```javascript
{
  files: ['src/blocks/**/*.ts'],
  plugins: { oscilla: { rules: { ... } } },
  rules: { 'oscilla/rule-name': 'error' },
}
```

If using eslint-plugin-boundaries, add a new config block following this same structure but targeting `src/**/*.ts` with boundary rules.
