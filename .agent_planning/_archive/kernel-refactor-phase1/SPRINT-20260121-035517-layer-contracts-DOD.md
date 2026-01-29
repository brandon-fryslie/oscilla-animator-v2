# Sprint: layer-contracts - Definition of Done

**Generated:** 2026-01-21T03:55:17Z

## Acceptance Criteria

### P0: OpcodeInterpreter.ts Header Updated

- [ ] Lines 1-60+ contain full contract header with box drawing
- [ ] All opcodes listed by arity category
- [ ] "SINGLE ENFORCER" architectural law stated
- [ ] Radians vs Phase distinction clearly documented

### P1: SignalEvaluator.ts Header Updated

- [ ] Lines 1-60+ contain full contract header with box drawing
- [ ] All signal kernels listed by category
- [ ] Domain/range documented for each category
- [ ] "Signal kernels are DOMAIN-SPECIFIC" stated
- [ ] "Generic math belongs in OpcodeInterpreter" stated

### P2: Materializer.ts Header Updated

- [ ] Lines 1-60+ contain full contract header with box drawing
- [ ] All field kernels listed by category
- [ ] "COORD-SPACE AGNOSTIC" principle stated
- [ ] Orchestration responsibilities listed
- [ ] "Does NOT" section clearly states boundaries

### P3: KERNEL-CONTRACTS.md Created

- [ ] File exists at `.agent_planning/kernel-refactor-phase1/KERNEL-CONTRACTS.md`
- [ ] Contains quick reference table
- [ ] Links to roadmap documents
- [ ] Summarizes all three layer contracts

### Verification

```bash
# Verify contract headers exist
head -70 src/runtime/OpcodeInterpreter.ts | grep -c "═"
# Should be > 0 (box drawing chars present)

head -70 src/runtime/SignalEvaluator.ts | grep -c "═"
# Should be > 0

head -70 src/runtime/Materializer.ts | grep -c "═"
# Should be > 0

# Verify key terms present
grep -l "SINGLE ENFORCER" src/runtime/OpcodeInterpreter.ts
grep -l "DOMAIN-SPECIFIC" src/runtime/SignalEvaluator.ts
grep -l "COORD-SPACE AGNOSTIC" src/runtime/Materializer.ts

# Verify summary doc
test -f .agent_planning/kernel-refactor-phase1/KERNEL-CONTRACTS.md && echo "Summary exists"

# Type check (no regression)
npx tsc --noEmit
```
