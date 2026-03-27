# Gate Test Patterns

Detailed patterns for each gate test in the strangler fig state machine. Gate tests live in the module's `__tests__/` directory with predictable names so agents can find and run them mechanically.

**Important:** The specific assertions, fixtures, and dependency-cruiser rules for each gate are defined in the **approved test plan** (see SKILL.md, "Test Plan" section). The patterns below are structural templates — the test plan fills in the concrete details. Do not invent test assertions that weren't approved in the test plan.

## Tooling: dependency-cruiser

All structural verification — isolation checks, import graph analysis, and remnant detection — uses [dependency-cruiser](https://github.com/sverweij/dependency-cruiser). It parses source with Babel/TypeScript under the hood, follows all import forms (static, dynamic, re-exports, barrel files), and can both **validate rules** and **generate visual dependency graphs**.

Install once (dev dependency):
```bash
npm install --save-dev dependency-cruiser
```

### Why dependency-cruiser over hand-rolled Babel walkers

- Handles all import forms: `import`, `require`, `import()`, `export * from`, re-exports through barrel files
- Resolves path aliases (`@/*`), `tsconfig` paths, and Node resolution correctly
- Produces visual SVG/DOT graphs for human review during test plan approval
- Rules are declarative JSON — agents write config, not parser code
- Battle-tested on large codebases; edge cases already handled

### Configuration File

Each migration creates a `.dependency-cruiser-migration.cjs` alongside the test files. This file declares the structural rules for all gates:

```javascript
// __tests__/.dependency-cruiser-migration.cjs
module.exports = {
  forbidden: [
    // ISOLATION: new must not import old (Gate 0)
    {
      name: 'new-must-not-import-old',
      severity: 'error',
      from: { path: 'src/compiler/frontend/payload-unit/' },
      to: { path: 'src/compiler/frontend/solve-payload-unit' },
    },
    // ISOLATION: old must not import new (Gate 0)
    {
      name: 'old-must-not-import-new',
      severity: 'error',
      from: { path: 'src/compiler/frontend/solve-payload-unit' },
      to: { path: 'src/compiler/frontend/payload-unit/' },
    },
    // REMNANT: seam must not transitively reach old module (Gate 4)
    {
      name: 'seam-must-not-reach-old',
      severity: 'error',
      from: { path: 'src/compiler/frontend/index\\.ts$' },
      to: {
        path: 'src/compiler/frontend/solve-payload-unit',
        reachable: true,
      },
    },
  ],
};
```

## Naming Convention

```
__tests__/migration-isolation.test.ts              # State 0 gate
__tests__/migration-contract.test.ts               # State 1 gate
__tests__/migration-equivalence.test.ts            # State 2 gate (temporary)
__tests__/migration-no-remnants.test.ts            # State 4 gate (permanent)
__tests__/.dependency-cruiser-migration.cjs        # Structural rules (permanent)
```

State 3 (FLIP) has no dedicated test file — its gate is the contract tests passing after the seam import is rewired + dependency-cruiser confirming the new path is reachable.

## Gate 0: Isolation Test

**Purpose:** Prevent coupling between old and new modules. Written first, runs at every subsequent state until replaced by the stronger remnant test.

**Pattern:**

```typescript
import { execSync } from 'child_process';

describe('migration isolation', () => {
  it('new module does not import old, old does not import new', () => {
    // dependency-cruiser validates the forbidden rules
    const result = execSync(
      'npx depcruise --ts-config tsconfig.json ' +
      '--validate __tests__/.dependency-cruiser-migration.cjs ' +
      'src/compiler/frontend/payload-unit/ src/compiler/frontend/solve-payload-unit.ts',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    // depcruise exits 0 if no violations, non-zero if violations found
    // If we get here, no violations — test passes
  });
});
```

Alternatively, run depcruise as a shell command and assert exit code 0. The rules in `.dependency-cruiser-migration.cjs` define what's forbidden — the test just runs the validator.

**Visual verification for test plan approval:**

```bash
# Generate SVG showing the relationship between old and new modules
npx depcruise --ts-config tsconfig.json \
  --output-type dot \
  src/compiler/frontend/index.ts \
  | dot -T svg > migration-graph.svg
```

Present this graph during test plan approval so the human reviewer can see the actual dependency structure.

**What it catches:** Any import path between old and new modules — static, dynamic, or re-exported through intermediaries. dependency-cruiser follows the full transitive graph.

## Gate 1: Contract Tests

**Purpose:** Assert the seam's output invariants independent of which implementation backs it. Must pass for both old and new.

**Pattern:**

```typescript
import { compileFrontend } from '../index'; // Import from SEAM, not from implementation

describe('frontend contract', () => {
  const fixture = buildTestPatch(/* ... */);

  it('produces portTypes for all connected ports', () => {
    const result = compileFrontend(fixture);
    for (const edge of fixture.edges.values()) {
      expect(result.typedPatch.portTypes.has(portKeyFor(edge.source))).toBe(true);
      expect(result.typedPatch.portTypes.has(portKeyFor(edge.target))).toBe(true);
    }
  });

  it('resolves all cardinality to concrete values', () => {
    const result = compileFrontend(fixture);
    for (const [, type] of result.typedPatch.portTypes) {
      expect(type.extent.cardinality.kind).not.toBe('var');
    }
  });

  it('is deterministic', () => {
    const a = compileFrontend(fixture);
    const b = compileFrontend(fixture);
    expect(a.typedPatch.portTypes).toEqual(b.typedPatch.portTypes);
  });
});
```

**Key rules:**
- Import from the seam module, never from the implementation file
- Assert on output shape and invariants, never on internal mechanics
- Use real fixtures from the test suite, not mocked data
- Cover the invariants from `references/oscilla-constraints.md` that apply to this seam

## Gate 2: Equivalence Tests

**Purpose:** Prove the new implementation produces identical output to the old for a comprehensive set of inputs. This is the validation gate — it proves the new implementation is equivalent before the seam is rewired.

**Pattern:**

```typescript
import { solve as oldSolve } from '../solve-payload-unit';
import { solve as newSolve } from '../payload-unit/solve';

const fixtures = [minimalPatch, complexPatch, edgeCasePatch, /* ... */];

describe('solver equivalence', () => {
  for (const fixture of fixtures) {
    it(`matches old output for: ${fixture.name}`, () => {
      const oldResult = oldSolve(fixture.constraints);
      const newResult = newSolve(fixture.constraints);
      expect(newResult).toEqual(oldResult);
    });
  }
});
```

**Key rules:**
- Import both implementations DIRECTLY (not through the seam) — this is the one exception to normal import discipline
- Use the same fixtures as the contract tests plus additional edge cases
- Assert deep equality on the full output, not just spot checks
- These tests are **temporary** — deleted in state 4 when the old module is removed

## Gate 3: Flip Verification

**Purpose:** Confirm the seam file now routes through the new module. Verified structurally with dependency-cruiser + contract test re-run.

**Verification:**

```bash
# Verify the seam transitively reaches the NEW module
npx depcruise --ts-config tsconfig.json \
  --output-type json \
  src/compiler/frontend/index.ts \
  | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    const reachesNew = data.modules.some(m => m.source.includes('payload-unit/solve'));
    process.exit(reachesNew ? 0 : 1);
  "

# Contract tests still pass (unchanged)
npx vitest run --include "**/migration-contract*"
```

**What this catches:** An agent that rewired the import but introduced a subtle signature mismatch (contract tests would fail). An agent that thinks it flipped but actually edited the wrong file (dependency-cruiser would not find the new path in the graph).

## Gate 4: Forbidden-Remnant Tests

**Purpose:** Permanent tombstone. Structurally prove the old module is gone — not by grepping for names (which an agent can defeat by renaming) but by verifying properties that are unfakeable.

**Why not grep?** String-based checks are trivially defeatable. An agent that renames `solvePayloadUnit` to `resolveTypes` or inlines the old logic into a new file bypasses every grep pattern while preserving the old code path. Remnant tests must assert on **structural properties**: file existence, module resolution, dependency graph reachability, and build output.

### Remnant Test Pattern

```typescript
import { resolve } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

describe('old solver is structurally gone', () => {
  // LAYER 1: Physical — the file does not exist on disk
  it('old implementation file does not exist', () => {
    const oldPath = resolve(__dirname, '../solve-payload-unit.ts');
    expect(existsSync(oldPath)).toBe(false);
  });

  // LAYER 2: Resolution — Node/TS cannot resolve the old module specifier
  it('old module specifier is not resolvable', () => {
    expect(() => require.resolve('../solve-payload-unit')).toThrow();
  });

  // LAYER 3: Dependency graph — dependency-cruiser confirms the old file
  //          is NOT transitively reachable from the seam. This uses the
  //          'seam-must-not-reach-old' rule in the migration config.
  //          Unfakeable: follows actual imports, not names.
  it('old module not reachable from seam (dependency-cruiser)', () => {
    // depcruise exits non-zero if any forbidden rule is violated
    // The 'seam-must-not-reach-old' rule fires if the old file IS reachable
    // After deletion, the file doesn't exist so it can't be reachable — pass
    execSync(
      'npx depcruise --ts-config tsconfig.json ' +
      '--validate __tests__/.dependency-cruiser-migration.cjs ' +
      'src/compiler/frontend/index.ts',
      { encoding: 'utf-8' }
    );
  });

  // LAYER 4: Full dependency graph snapshot — dump the seam's entire
  //          transitive dependency set and assert the old file is absent.
  //          This is a second structural check independent of the rules file.
  it('old file absent from seam dependency graph', () => {
    const json = execSync(
      'npx depcruise --ts-config tsconfig.json ' +
      '--output-type json ' +
      'src/compiler/frontend/index.ts',
      { encoding: 'utf-8' }
    );
    const data = JSON.parse(json);
    const allPaths = data.modules.map((m: any) => m.source);
    expect(allPaths).not.toContain(
      expect.stringContaining('solve-payload-unit')
    );
  });

  // LAYER 5: Build output — the old module's brand marker (added at
  //          state 0, declared in the test plan) does not appear in
  //          the bundled output. Catches code that was copy-pasted
  //          rather than imported.
  it('old module brand absent from build', async () => {
    const build = await readFile('dist/index.js', 'utf-8');
    expect(build).not.toContain('__SOLVE_PAYLOAD_UNIT_V1');
  });

  // LAYER 6: Behavioral — contract tests verify the seam still works.
  //          (Run separately: npx vitest run --include "**/migration-contract*")
});
```

### Visual Graph for Post-Migration Audit

After CLEAN, generate a final dependency graph to confirm the old module is gone:

```bash
npx depcruise --ts-config tsconfig.json \
  --output-type dot \
  --do-not-follow "node_modules" \
  src/compiler/frontend/index.ts \
  | dot -T svg > migration-complete-graph.svg
```

This SVG can be committed as evidence or inspected by a human reviewer.

### Layer Explanation

| Layer | What it catches | What it misses |
|-------|----------------|----------------|
| File existence | Old file left on disk | Renamed file, moved file |
| Module resolution | Old specifier still importable | New specifier pointing to old code |
| dependency-cruiser rules | Old file reachable via any import path (static, dynamic, re-export) | Code copy-pasted (not imported) |
| dependency-cruiser graph dump | Same as above, independent of rules file (defense-in-depth) | Code copy-pasted (not imported) |
| Build output brand | Copy-pasted code carrying the brand marker | Agent deletes the brand (but it was added before the agent started — per the test plan) |
| Contract tests | Any behavioral regression | Nothing — this is the ground truth |

### Key Rules

- The **brand marker** (layer 5) must be declared in the approved test plan, NOT chosen by the implementing agent. Add a unique string constant (e.g., `export const __SOLVE_PAYLOAD_UNIT_V1 = '__SOLVE_PAYLOAD_UNIT_V1'`) to the old module BEFORE starting the migration (state 0).
- The `.dependency-cruiser-migration.cjs` rules file is **permanent** — it stays in the codebase as the structural enforcement config.
- These tests are **permanent** — they live in the codebase forever.
- The dependency-cruiser config should be reviewed as part of the test plan approval — it defines the structural boundaries of the migration.

## State Determination Algorithm

An agent determines current state by running gates in order:

```
1. Does migration-isolation.test.ts exist and pass?
   NO  → State 0 (SCAFFOLD)
   YES ↓
2. Does migration-contract.test.ts exist and pass?
   NO  → State 1 (CONTRACT)
   YES ↓
3. Does migration-equivalence.test.ts exist and pass?
   NO  → State 2 (BUILD)
   YES ↓
4. Does the seam transitively reach the new module? (depcruise --output-type json)
   NO  → State 3 (FLIP)
   YES ↓
5. Does migration-no-remnants.test.ts exist and pass?
   NO  → State 4 (CLEAN)
   YES → DONE
```

This algorithm is deterministic and requires no context from previous agent runs. Gate 4 (state 3 check) uses dependency-cruiser's JSON output rather than string-matching the seam file — this correctly handles re-exports and barrel files.
