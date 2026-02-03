# Sprint: boundary-enforcement - Add Dependency Boundary Enforcement
Generated: 2026-02-03-140100
Confidence: HIGH: 1, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY
Source: EVALUATION-2026-02-03-131723.md

## Sprint Goal
Establish automated enforcement of module dependency direction so that new bidirectional import violations are caught at lint/CI time.

## Scope
**Deliverables:**
- Chosen and configured dependency boundary enforcement tool
- Rules codifying the intended module dependency graph
- Integration into existing `npm run lint` command
- Documentation of intended dependency architecture (in a code comment or config file)

## Work Items

### P1 - Research and select tooling [MEDIUM]

**Dependencies**: None
**Spec Reference**: CLAUDE.md "ONE-WAY DEPENDENCIES" law, "Automated/Programmatic enforcement" process constraint
**Status Reference**: EVALUATION-2026-02-03-131723.md "Missing Checks" section

#### Description
Evaluate two candidate tools for enforcing module boundary rules in this codebase:

1. **eslint-plugin-boundaries** -- integrates with existing ESLint 9 flat config, rules defined in eslint.config.js
2. **dependency-cruiser** -- standalone CLI, generates config file (.dependency-cruiser.cjs), richer visualization but separate tool

The codebase already uses ESLint 9 with custom rules (eslint.config.js) and has a `npm run lint` command. An ESLint-based solution would integrate more naturally. However, dependency-cruiser provides richer cycle detection and visualization which may be valuable.

#### Acceptance Criteria
- [ ] Both tools evaluated against: (a) ESLint 9 flat config compatibility, (b) ability to express "module A must not import from module B", (c) cycle detection, (d) ease of incremental adoption (allow existing violations while catching new ones)
- [ ] Selection documented with rationale in the config file or a brief comment
- [ ] Selected tool installed as devDependency

#### Unknowns to Resolve
1. Does eslint-plugin-boundaries work with ESLint 9 flat config? -- Check npm page / docs
2. Can dependency-cruiser be configured to allow known violations while flagging new ones? -- Check "known" / "allowed" config

#### Exit Criteria (to reach HIGH confidence)
- [ ] Tool selected and documented
- [ ] Compatibility with existing toolchain confirmed

#### Technical Notes
- The project uses pnpm (based on node_modules/.pnpm structure)
- ESLint config is at `/Users/bmf/code/oscilla-animator-v2/eslint.config.js` (flat config, ESLint 9+)
- Existing custom ESLint plugin: `oscilla` with 5 custom rules

---

### P1 - Configure boundary rules [MEDIUM]

**Dependencies**: Tooling selection (above)
**Spec Reference**: CLAUDE.md architecture dependency arrows section
**Status Reference**: EVALUATION-2026-02-03-131723.md Section 2 (bidirectional blocks/ <-> compiler/)

#### Description
Configure rules that encode the intended dependency architecture:

```
UI/React <-- stores <-- compiler + runtime
                          |
                        graph <-- Patch
                                   |
                                 blocks/registry
                                   |
                                 types & core
```

**Rules to enforce:**
1. `stores/` must NOT import from `compiler/` (already clean -- prevent regression)
2. `compiler/` must NOT import from `stores/` (already clean -- prevent regression)
3. `compiler/` must NOT import from `runtime/` (prevent back-edge)
4. `runtime/` must NOT import from `stores/` (prevent back-edge)
5. `blocks/` importing from `compiler/ir/` -- ALLOW (known existing pattern, ~15 files)
6. `compiler/` importing from `blocks/` -- ALLOW (known existing pattern, ~15 files)

Rules 5 and 6 document the known bidirectional dependency. They should be marked as "allowed but tracked" so they don't expand further without notice.

#### Acceptance Criteria
- [ ] Rules 1-4 enforced (violations cause lint failure)
- [ ] Rules 5-6 documented as known exceptions with an explicit waiver comment
- [ ] `npm run lint` passes with current codebase (no false positives)
- [ ] Adding a new `import ... from '../stores/...'` in compiler/ would cause lint failure

#### Technical Notes
- The existing lint command only covers specific files: `eslint src/blocks/ src/runtime/ValueExprMaterializer.ts ...`
- The boundary rules may need a broader file scope in the lint config
- Consider whether to expand the lint scope or add a separate `lint:boundaries` script

---

### P0 - Integrate into CI/lint pipeline [HIGH]

**Dependencies**: Rules configured (above)
**Spec Reference**: CLAUDE.md "Automated/Programmatic enforcement" process constraint
**Status Reference**: EVALUATION-2026-02-03-131723.md "Missing Checks"

#### Description
Ensure the boundary enforcement runs as part of the standard development workflow. Either:
- Add to existing `npm run lint` (preferred if using eslint-plugin-boundaries)
- Add a new `npm run lint:deps` script and ensure it runs in CI (if using dependency-cruiser)

#### Acceptance Criteria
- [ ] Boundary check runs via a documented npm script
- [ ] Violations produce clear, actionable error messages
- [ ] No false positives on current codebase

#### Technical Notes
- The project does not appear to have a CI config file (no .github/workflows visible), so this may just be a package.json script for now.

## Dependencies
- Work items are sequential: select tool -> configure rules -> integrate into pipeline

## Risks
- **Risk**: eslint-plugin-boundaries may not support ESLint 9 flat config.
  **Mitigation**: Fall back to dependency-cruiser if incompatible.
- **Risk**: Existing violations may be more numerous than expected, making rule configuration tedious.
  **Mitigation**: Start with coarse-grained rules (module-to-module) and refine later.
