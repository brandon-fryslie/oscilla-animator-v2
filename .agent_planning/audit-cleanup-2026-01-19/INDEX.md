# Audit Cleanup Plans - 2026-01-19

## Overview

Three migration/cleanup tasks identified from the code quality audit focused on incomplete migrations, TODOs, and legacy code.

## Plans

| Plan | Priority | Status | Summary |
|------|----------|--------|---------|
| [Pass 8 Cleanup](PLAN-pass8-cleanup.md) | P1 | ✅ COMPLETE | Remove dead code, clean up misleading TODOs |
| [IRBuilder Dual Fields](PLAN-irbuilder-dual-fields.md) | P1 | ✅ COMPLETE | Complete domain → instance migration |
| [CircleInstance Removal](PLAN-circleinstance-removal.md) | P2 | ✅ COMPLETE | Remove deprecated block |

## Audit Reports

| Report | Date | Scope |
|--------|------|-------|
| [Deprecated/Dual Paths/Legacy](AUDIT-deprecated-dual-paths-legacy.md) | 2026-01-19 | Full codebase scan for deprecated code, dual code paths, unfinished migrations, legacy fallbacks |

## Execution Summary

All three plans were executed on 2026-01-19:

1. **Pass 8 Cleanup** ✅ - Removed dead `createStubProgramIR()` function, cleaned up misleading TODOs
2. **CircleInstance Removal** ✅ - Migrated tests to Array+GridLayout, removed deprecated block
3. **IRBuilder Dual Fields** ✅ - Migration was already complete, added @deprecated annotations

### Commits

- `effeebf` - chore(ir): Mark fieldSource and fieldIndex as deprecated
- Earlier commits had already completed the bulk of the work (CircleInstance removal, Pass 8 cleanup)

## Source

These plans originated from the `/do:audit` command run on 2026-01-19, which identified:
- 3 half-completed migrations
- 5 deprecated/legacy code areas
- 23+ explicit TODO comments
- 25+ type safety workarounds (`as any`)
