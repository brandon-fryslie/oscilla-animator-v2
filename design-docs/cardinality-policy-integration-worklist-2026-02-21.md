# Cardinality Policy Integration Worklist (2026-02-21)

This worklist covers full migration from legacy block-level cardinality modes to CT/ICT cardinality-var policy.

## Current Status (2026-02-21)

- Completed: Tracks 1, 3, 4, 5, 10 (mode-dispatch removed, block definitions migrated, registry fallback removed).
- Remaining: Track 2 depth hardening, Track 6 structural dispatch cleanup, Track 7/8/9 policy diagnostics and adapter revalidation.

## Track 1: Compiler Extraction Rewrite

1. Replace `rewriteSignalOnly` / `rewritePreserve` / `rewriteTransform` / `rewriteFieldOnly` with one CT/ICT-driven extraction path.
2. Build cardinality groups exclusively from shared cardinality var ids.
3. Emit constraints from var policy (`relation`, `acceptance`, `instanceBinding`).
4. Legacy metadata fallback removed after migration completion.

Completion criteria:
- `src/compiler/frontend/extract-constraints.ts` has no mode-dispatch switch.
- New path handles all existing blocks in fixture suite.

## Track 2: Cardinality Solver Semantics Upgrade

1. Map `relation:'uniform'` to equality semantics.
2. Map `relation:'promoteToMany'` to many-propagation semantics.
3. Enforce `acceptance` bounds as first-class constraints.
4. Enforce `instanceBinding:create(domainType)` resolution and instance-term unification.

Completion criteria:
- Solver errors identify policy source port/group.
- New tests cover all relation × acceptance × instanceBinding combinations.

## Track 3: Block Definition Migration

1. Add cardinality var policy declarations to all port types that were mode-driven.
2. Migrate mixed layout blocks first (`GridLayoutUV`, `LineLayoutUV`, `CircleLayoutUV`, `SpiralLayout`, `AttractorLayout`, `PathLayout`).
3. Migrate transform blocks (`Array`, `Broadcast`, `Reduce`, shape generators) to `instanceBinding:create(...)` style declarations.
4. Migrate remaining preserve/signal/field-only blocks.

Completion criteria:
- No block requires `cardinalityMode` for correctness.
- DSConst → GridLayoutUV control ports remain resolved to `one`.

## Track 4: Registry and Metadata Cleanup

1. Remove `BlockCardinalityMetadata` from registry/type surfaces.
2. Remove mode query helpers from active compiler paths.
3. Delete legacy mode types and translation logic.

Completion criteria:
- `getBlockCardinalityMetadata` unused by frontend type solving.
- Registry no longer requires block-level cardinality mode declarations.

## Track 5: Pass2 Type Compatibility Alignment

1. Remove pass2 dependency on `broadcastPolicy`.
2. Use resolved CT/ICT cardinality facts only.
3. Keep adapter insertion as policy layer, not type authority.

Completion criteria:
- `analyze-type-graph.ts` does not read block cardinality metadata.
- Signal↔field compatibility decisions match solved policy semantics.

## Track 6: Structural Dispatch Cleanup

1. Replace block-name checks in frontend with structural predicates or adapter specs.
2. Add forbidden-pattern tests for these checks.

Targets:
- `create-derived-obligations.ts`
- `policies/cardinality-adapter-policy.ts`
- `normalize-adapters.ts`
- `policies/default-source-policy.ts`

Completion criteria:
- No hardcoded block-type conditionals in frontend policy/extraction paths.

## Track 7: Adapter Policy Revalidation

1. Re-evaluate when cardinality adapters are needed under policy-driven solver results.
2. Ensure adapters are optional coercion policy, not compensation for missing expressiveness.
3. Update cardinality-adapter obligation generation accordingly.

Completion criteria:
- Adapter insertion only occurs at declared coercion boundaries.
- No adapter required for blocks whose mixed behavior is declared in CT/ICT.

## Track 8: Test Suite Migration

1. Update existing tests that assert legacy origin rule names/mode behavior.
2. Add new golden tests for policy-driven extraction and solve.
3. Add regression tests for mixed one/flexible/many port groups.
4. Add migration guard tests (mode path removed, CT/ICT path authoritative).

Completion criteria:
- Cardinality frontend tests pass with zero mode-based assertions.
- Regression for DSConst/GridLayoutUV bug passes.

## Track 9: Diagnostics and UX

1. Update diagnostic messages to reference policy terms (`uniform`, `promoteToMany`, `oneOnly`, `manyOnly`, `create(domainType)`).
2. Update inspector/debug views to show per-port cardinality policy.
3. Add diagnostics for malformed or contradictory policy declarations.

Completion criteria:
- Diagnostics include source port and policy field.
- Debug tools show cardinality group and resolved outcome.

## Track 10: Final Removal and Hardening

1. Compatibility gate and legacy mode fallback removed.
2. Remove dead docs referencing legacy modes as canonical.
3. Add CI checks preventing reintroduction of mode-dispatch logic.

Completion criteria:
- No production code path reads legacy cardinality mode metadata.
- Forbidden-pattern checks fail on new mode-dispatch additions.
