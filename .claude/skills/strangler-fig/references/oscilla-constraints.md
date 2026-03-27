# Oscilla-Specific Migration Constraints

These constraints are derived from the project's architectural laws (`.claude/CLAUDE.md`) and type system invariants (`.claude/rules/TYPE-SYSTEM-INVARANTS.md`). Every strangler fig migration must respect them. Each constraint is mechanically enforced by tests — documentation alone is not enforcement.

## Architectural Laws That Govern Migration

### [LAW:one-source-of-truth]
During migration, there are temporarily TWO implementations. This exception is time-bounded — it ends when the gate tests advance through FLIP and CLEAN. The isolation test prevents the two implementations from entangling, and the forbidden-remnant tests ensure the old one stays deleted permanently.

**Mechanical enforcement:** Isolation test (state 0), remnant test (state 4).

### [LAW:dataflow-not-control-flow]
There are no feature flags. Both implementations exist as importable modules during the parallel phase, but only one is wired into the seam at any time. The switch is a one-line import change — not a runtime branch. Tests validate both paths; the import rewiring makes the new path authoritative.

**Mechanical enforcement:** Equivalence tests (state 2) validate both paths. The flip (state 3) is a static import change, not a runtime conditional.

### [LAW:single-enforcer]
If the module being replaced enforces a cross-cutting invariant (e.g., axis validation, type soundness), the new module must enforce it at exactly one boundary too. Do not split enforcement across old and new.

**Mechanical enforcement:** Contract tests (state 1) assert the invariant at the seam. If the invariant holds for both old and new (via equivalence tests), enforcement is preserved.

### [LAW:one-way-deps]
The new module must not import from the old module, and the old module must not import from the new. They are parallel — the seam file chooses between them.

**Mechanical enforcement:** Isolation test (state 0) — grep-based, runs at every state until replaced by remnant tests.

### [LAW:behavior-not-structure]
Contract tests assert on output shapes and invariants, never on internal implementation details. A test that checks "the solver uses union-find" is a structure test — it will fail when the implementation changes even though the behavior is correct. A test that checks "all port types are resolved" is a behavior test — it passes for any correct implementation.

**Mechanical enforcement:** Contract tests are written at state 1 against the old path and must pass unchanged at state 3 against the new path. If they fail after the flip, they were testing structure, not behavior — fix the tests.

## Mechanical Verification at Boundaries

The model for gate tests already exists in this codebase:

- **`axis-validate.ts`** — single enforcement gate for type soundness at the frontend→backend boundary. Every type must have concrete axes (no vars). This is exactly the pattern: one gate, one place, mechanically checked.
- **`src/__tests__/forbidden-patterns.test.ts`** — grep-based architectural enforcement. Tests fail if banned patterns appear anywhere in the codebase. Remnant tests follow this exact pattern.

Gate tests in a migration are the same idea applied to the migration lifecycle: each gate mechanically verifies a property that must hold before the next state can begin.

## Type System Invariants During Migration

### Frontend→Backend Boundary (The Hard Boundary)

Anything crossing from frontend to backend must satisfy:

1. **No axis vars**: All `Axis.kind` must be `'inst'`, never `'var'`
2. **All ports typed**: `TypedPatch.portTypes` must have entries for every connected port
3. **Cardinality resolved**: Every cardinality axis is concrete (`one` or `many(instanceId)`)
4. **Units resolved**: Every unit axis is concrete (no unit vars)

When migrating a type solver or normalization pass, the contract tests must assert these invariants. The existing `axis-validate.ts` gate enforces them at runtime — contract tests enforce them at test time.

### Patch Purity Invariant

`Patch` (user-facing graph) must NEVER contain:
- Resolved types (belongs in `TypedPatch.portTypes`)
- Slot allocations (belongs in `CompiledProgramIR`)
- Schedule data (belongs in `ScheduleIR`)
- Lowered IR (belongs in `UnlinkedIRFragments`)

When migrating graph normalization, contract tests must verify the output is a clean `NormalizedPatch`.

### IR Immutability

Every compiler pass produces a NEW intermediate representation. During migration:
- The new pass receives the same immutable input as the old pass
- The new pass produces a new output (may be same type, may be extended)
- Neither pass should hold references to the other's output
- Equivalence tests verify the output is structurally equal

### Block Registry Stability

`defineBlock()` calls happen at module load time. When migrating blocks:
- All existing `defineBlock()` calls from other (non-migrated) blocks must continue to work
- The `LowerCtx` interface must remain stable (it's the contract between registry and backend)
- Contract tests verify the registry still resolves all expected block types

## Compiler Pass Ordering Constraints

Passes execute in a fixed order. When replacing a pass:

**Frontend pipeline:**
1. Composite expansion → 2. Build draft graph → 3. Normalization fixpoint (default sources, adapters, type solving) → 4. Bridge to TypedPatch → 5. Type graph analysis → 6. Axis validation → 7. Cycle classification

**Backend pipeline:**
3. Time model → 4. Dependency graph → 5. SCC → 6. Block lowering → 6b. Continuity pipeline → 7. Schedule

Replace one pass at a time. The input from the previous pass and the expected output for the next pass define the contract. Do NOT reorganize pass ordering as part of a strangler fig migration — that's a separate architectural change.

## Runtime Constraints

When migrating runtime components:
- `advanceFrame()` is the hot loop — equivalence tests should include performance assertions or at minimum not regress
- State migration (`StateMigration.ts`) must work across the boundary — old state must be consumable by new runtime
- Two-phase execution (Phase 1: read old state, Phase 2: write new state) is non-negotiable
- Contract tests must verify phase ordering is preserved

## Visual Validation Requirement

Any migration that touches compiler passes, runtime execution, rendering, or block lowering **MUST** include visual validation in the CLEAN state:

```bash
./scripts/get-screenshot-of-demo-patch.sh breathing-ring.hcl
./scripts/get-screenshot-of-demo-patch.sh golden-spiral.hcl
```

Compare burst montages before and after. This is the final gate — it catches regressions that unit tests miss because they don't exercise the full render pipeline.

## Diagnostic Accumulation

When migrating compiler passes that produce diagnostics:
- Contract tests must assert diagnostic equivalence (same errors/warnings for same inputs)
- Equivalence tests compare diagnostic output alongside data output
- Do NOT suppress diagnostics from the new path to make tests pass — if diagnostics differ, understand why
- Fixpoint-based passes: only assert diagnostics from the FINAL iteration (earlier iterations may report conflicts that are structurally resolved)
