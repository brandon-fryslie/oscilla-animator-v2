---
name: strangler-fig
description: This skill should be used when the user asks to "replace a module", "migrate a subsystem", "rewrite a pass", "swap an implementation", "strangle a component", "incremental migration", "replace without breaking", "phase out old code", "deprecate and replace", or "transition from old to new implementation". Provides a gate-test-driven migration state machine designed for convergence under repeated agentic execution.
---

# Strangler Fig Migration — Gate-Driven State Machine

Replace a module by building the new implementation alongside the old, with test gates that mechanically enforce progress, prevent coupling, and converge to completion under repeated automated runs.

**Core invariant:** State is never stored — it is derived by running gate tests. An agent entering at any point runs the gates, determines where it is, does bounded work, and verifies advancement.

## When to Apply

Apply when replacing any module that has consumers depending on its output contract:
- Compiler passes (solver, normalization, lowering)
- Runtime subsystems (executor, state migration, kernels)
- Block definitions (registry entries)
- Service implementations (orchestrator, animation loop)
- Rendering backends

Do NOT apply when:
- The change is additive (new feature, new block) — add directly
- The module has no consumers — rewrite in place
- The change is within a single file — edit normally

## The State Machine

A migration has five states. Each state has an **entry condition** (derived from gate tests), **bounded work**, and an **exit gate**. An agent loop runs gates top-to-bottom — the first failing gate is the current state.

### Seam Identification (prerequisite)

Before entering the state machine, identify the seam — the contract boundary consumers depend on:

| Module | Input Contract | Output Contract | Seam File |
|--------|---------------|-----------------|-----------|
| Frontend | `Patch` | `FrontendResult` | `src/compiler/frontend/index.ts` |
| Backend | `TypedPatch` | `CompiledProgramIR` | `src/compiler/backend/index.ts` |
| Runtime | `CompiledProgramIR` | `RuntimeState` | `src/runtime/index.ts` |
| Orchestrator | `PrecomputedCompileArtifacts` | side effect (swap) | `src/services/CompileOrchestrator.ts` |
| Block Registry | block type string | `BlockDef` | `src/blocks/registry.ts` |
| Individual Pass | previous pass output | next pass input | parent module's index |

For individual passes, the seam is the orchestrating function that calls the pass — typically the frontend or backend `index.ts`.

---

### Test Plan (requires human approval)

Before entering the state machine, produce a **test plan** document and get human sign-off. The tests define what "correct" means for the entire migration — getting them wrong means converging to the wrong answer. This is the one step that requires human judgment.

The test plan is a short document (written to the module's `__tests__/` directory or `.agent_planning/`) that declares:

1. **dependency-cruiser rules** — the `.dependency-cruiser-migration.cjs` config declaring forbidden import paths (old↔new isolation, seam→old reachability). These rules are the structural backbone of the migration — they enforce isolation and detect remnants using actual import graph analysis, not string matching. Include the draft rules file in the test plan for review.
2. **Contract assertions** — what output invariants the contract tests will check (e.g., "all portTypes resolved", "no axis vars", "deterministic output"). These must be implementation-agnostic — if an assertion would only pass for one particular implementation, it's testing structure, not behavior.
3. **Equivalence fixtures** — what inputs the equivalence tests will use to compare old and new output. Cover the happy path, edge cases, and error cases. List specific fixture names or describe the input shapes.
4. **Brand marker** — a unique string constant (e.g., `__SOLVE_PAYLOAD_UNIT_V1`) to add to the old module before migration begins. This marker is checked in the build output to catch copy-pasted code that bypasses the import graph.
5. **Visual dependency graph** — generate an SVG of the current dependency graph from the seam file (`npx depcruise --output-type dot ... | dot -T svg`) and include it for review. This gives the human reviewer a concrete picture of the current state.

Present this plan and wait for approval. Once approved, the state machine executes autonomously — the approved test plan is the definition of correctness that all subsequent agent runs follow.

If the test plan document exists and has been approved, skip this step and proceed to state determination.

---

### State 0: SCAFFOLD

**Entry condition:** New module directory does not exist.

**Work:**
1. Create the new module directory as a sibling to the old module
2. Create an empty entry point file (e.g., `index.ts` with a stub that throws `'not yet implemented'`)
3. Add the **brand marker** to the old module (declared in the test plan): `export const __SOLVE_PAYLOAD_UNIT_V1 = '__SOLVE_PAYLOAD_UNIT_V1'`
4. Write the `.dependency-cruiser-migration.cjs` rules file (from the approved test plan)
5. Write the **isolation test** — the most important artifact in the entire migration. It runs dependency-cruiser to structurally verify no import paths exist between old and new:

```typescript
// __tests__/migration-isolation.test.ts
import { execSync } from 'child_process';

describe('migration isolation', () => {
  it('no import paths between old and new modules (dependency-cruiser)', () => {
    execSync(
      'npx depcruise --ts-config tsconfig.json ' +
      '--validate __tests__/.dependency-cruiser-migration.cjs ' +
      'src/compiler/frontend/payload-unit/ src/compiler/frontend/solve-payload-unit.ts',
      { encoding: 'utf-8' }
    );
  });
});
```

**Exit gate:** Isolation test exists and passes. (Passes trivially — new module is empty, no imports to violate.)

**Verify:** `npx vitest run --include "**/migration-isolation*"`

---

### State 1: CONTRACT

**Entry condition:** Isolation test passes. No contract test file exists.

**Work:** Write contract tests that assert the seam's output invariants. These tests call the **seam function** (not the old implementation directly) and assert on the output shape:

- All expected fields are present and non-null
- Type invariants hold (e.g., no axis vars in output, all ports typed)
- Output is deterministic (same input → same output)

Contract tests are **implementation-agnostic** — they test WHAT the seam produces, not HOW. They must pass for both old and new implementations. This is `[LAW:behavior-not-structure]`.

**Exit gate:** Contract tests exist and pass against the current (old) path.

**Verify:** `npx vitest run --include "**/migration-contract*"`

---

### State 2: BUILD

**Entry condition:** Contract and isolation tests pass. No equivalence tests pass.

**Work:**
1. Implement the new module. The isolation test prevents accidental imports from the old module — if coupling is introduced, the isolation test fails immediately, blocking progress.
2. Write **equivalence tests** that call BOTH old and new on the same inputs and assert output equality:

```typescript
// __tests__/migration-equivalence.test.ts
describe('new solver equivalence', () => {
  for (const fixture of fixtures) {
    it(`produces same output for ${fixture.name}`, () => {
      const oldResult = oldSolver(fixture.input);
      const newResult = newSolver(fixture.input);
      expect(newResult).toEqual(oldResult);
    });
  }
});
```

The equivalence tests import both old and new **directly** (not through the seam). This is the only place both are imported together, and it's temporary.

**Exit gate:** Equivalence tests pass (new produces same output as old) AND isolation test still passes.

**Verify:** `npx vitest run --include "**/migration-equivalence*" && npx vitest run --include "**/migration-isolation*"`

---

### State 3: FLIP

**Entry condition:** Equivalence tests pass. Seam file still imports old module.

**Work:** Rewire the import in the seam file. This is a one-line change:

```typescript
// BEFORE (in seam file):
import { solve } from './solve-payload-unit';
// AFTER:
import { solve } from './payload-unit/solve';
```

**Exit gate:** Contract tests pass (unchanged — they test the seam, not the implementation) AND seam file imports new module (verified by grep).

**Verify:** `npx vitest run --include "**/migration-contract*"` + grep the seam file to confirm new import path.

---

### State 4: CLEAN

**Entry condition:** Seam imports new module. Old files still exist.

**Work:**
1. Delete the old implementation files entirely
2. Delete the equivalence tests (their job is done — old module no longer exists to compare against)
3. Write **forbidden-remnant tests** — permanent tombstone tests that prevent resurrection
4. Delete the isolation test (subsumed by the forbidden-remnant tests — stronger guarantee)
5. Run full test suite + visual validation if the migration touched compiler/runtime/render

**Why not grep for old names?** Grep-based remnant checks are trivially defeatable — an agent can rename a function, change a path, or inline old code, and every string-based check passes while the old logic survives. Remnant tests assert on **structural properties** using dependency-cruiser (import graph analysis) and build output checks:

```typescript
// __tests__/migration-no-remnants.test.ts
import { resolve } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

describe('old solver is structurally gone', () => {
  // 1. FILE EXISTENCE — the old file physically does not exist on disk
  it('old implementation file does not exist', () => {
    expect(existsSync(resolve(__dirname, '../solve-payload-unit.ts'))).toBe(false);
  });

  // 2. MODULE RESOLUTION — Node/TS cannot resolve the old module
  it('old module is not resolvable', () => {
    expect(() => require.resolve('../solve-payload-unit')).toThrow();
  });

  // 3. DEPENDENCY GRAPH — dependency-cruiser walks the seam's transitive
  //    imports and confirms the old file is not reachable. Uses the same
  //    rules file from state 0 with the 'seam-must-not-reach-old' rule.
  //    Unfakeable: follows actual import statements, not names.
  it('old module not reachable from seam (dependency-cruiser)', () => {
    execSync(
      'npx depcruise --ts-config tsconfig.json ' +
      '--validate __tests__/.dependency-cruiser-migration.cjs ' +
      'src/compiler/frontend/index.ts',
      { encoding: 'utf-8' }
    );
  });

  // 4. BUILD OUTPUT — the brand marker (added at state 0) is absent
  //    from the bundled output. Catches code that was copy-pasted
  //    rather than imported.
  it('old module brand absent from build', async () => {
    const build = await readFile('dist/index.js', 'utf-8');
    expect(build).not.toContain('__SOLVE_PAYLOAD_UNIT_V1');
  });

  // 5. CONTRACT TESTS STILL PASS — the seam still works without
  //    the old module. This is the ultimate behavioral check.
  //    (Run via: npx vitest run --include "**/migration-contract*")
});
```

dependency-cruiser follows actual `import`/`require`/`export` statements through the file system — static, dynamic, and re-exported. An agent cannot defeat this by renaming; if the old file is reachable from the seam under any name or path, the rule fires. See `references/gate-tests.md` for the full dependency-cruiser configuration and layer-by-layer explanation.

**Exit gate:** Forbidden-remnant tests pass. Contract tests still pass. Full test suite green.

**Verify:** `npx vitest run --include "**/migration-no-remnants*" && npx vitest run --include "**/migration-contract*" && npx vitest run`

For render/compiler/runtime changes, also run:
```bash
./scripts/get-screenshot-of-demo-patch.sh breathing-ring.hcl
```

---

## Agent Convergence

Why repeated agent runs converge to completion:

1. **Human approval defines correctness.** The test plan is approved once, before any automated work begins. All subsequent agent runs implement and verify against that approved definition — they never redefine what "correct" means.
2. **State derivation is mechanical.** Run gates 0–4 in order. First failure = current state. No context from previous runs needed.
3. **Work is idempotent.** Creating an already-existing file, writing an already-passing test, or deleting an already-deleted file are all no-ops.
4. **Progress is monotonic.** Passing gate N implies gates 0..N-1 still pass. Gates never regress because each state only adds or removes artifacts — it never modifies artifacts from earlier states.
5. **Isolation prevents the #1 failure mode.** The isolation test (state 0) mechanically prevents accidental coupling between old and new. An agent building the new module literally cannot import the old one without failing the gate.
6. **Each state has bounded scope.** An agent doesn't need to "understand the whole migration" — it needs to pass the current gate.

## Oscilla-Specific Constraints

Consult `references/oscilla-constraints.md` for architectural laws and type system invariants that apply during migration. Key mechanical gates:

- **Axis validation** (`axis-validate.ts`) — single enforcement gate for type soundness at frontend→backend boundary
- **Forbidden patterns** (`src/__tests__/forbidden-patterns.test.ts`) — existing architectural enforcement; remnant tests use structural verification (import graph walks, build output markers) rather than name-based grep
- **Visual validation** (`get-screenshot-of-demo-patch.sh`) — required for any migration touching compiler, runtime, or rendering

## Example Migrations

Consult `references/example-migrations.md` for completed migration case studies showing every artifact produced at each state — concrete file names, test code, and grep patterns for three different seam types.

## Gate Test Patterns

Consult `references/gate-tests.md` for detailed patterns, naming conventions, and reusable grep utilities for writing gate tests.
