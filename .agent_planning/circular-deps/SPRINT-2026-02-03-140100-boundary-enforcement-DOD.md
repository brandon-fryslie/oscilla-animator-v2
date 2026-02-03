# Definition of Done: boundary-enforcement
Generated: 2026-02-03-140100
Status: PARTIALLY READY
Plan: SPRINT-2026-02-03-140100-boundary-enforcement-PLAN.md

## Acceptance Criteria

### Tooling Selection
- [ ] Tool selected (eslint-plugin-boundaries or dependency-cruiser)
- [ ] Selection rationale documented
- [ ] Tool installed as devDependency

### Boundary Rules
- [ ] stores/ <-> compiler/ bidirectional import blocked
- [ ] compiler/ -> runtime/ back-edge blocked
- [ ] runtime/ -> stores/ back-edge blocked
- [ ] Known blocks/ <-> compiler/ bidirectional dependency explicitly allowed with waiver
- [ ] `npm run lint` passes cleanly on current codebase
- [ ] Intentional violation (e.g., temporary test import) correctly caught

### CI Integration
- [ ] Boundary check available via documented npm script
- [ ] Error messages identify the violating import and the rule it breaks

## Exit Criteria (for MEDIUM confidence items)
- [ ] eslint-plugin-boundaries ESLint 9 flat config compatibility confirmed or ruled out
- [ ] dependency-cruiser "known violations" / "allowed" feature confirmed
- [ ] Selected tool can express "allow existing violations, block new ones" pattern
