# Audit Cleanup Plans - 2026-01-19

## Overview

Three migration/cleanup tasks identified from the code quality audit focused on incomplete migrations, TODOs, and legacy code.

## Plans

| Plan | Priority | Status | Summary |
|------|----------|--------|---------|
| [Pass 8 Cleanup](PLAN-pass8-cleanup.md) | P1 | PLANNED | Remove dead code, clean up misleading TODOs |
| [IRBuilder Dual Fields](PLAN-irbuilder-dual-fields.md) | P1 | PLANNED | Complete domain → instance migration |
| [CircleInstance Removal](PLAN-circleinstance-removal.md) | P2 | PLANNED | Remove deprecated block |

## Recommended Execution Order

1. **Pass 8 Cleanup** - Quick win, removes confusion
2. **CircleInstance Removal** - Self-contained, no dependencies
3. **IRBuilder Dual Fields** - Most complex, do last

## Source

These plans originated from the `/do:audit` command run on 2026-01-19, which identified:
- 3 half-completed migrations
- 5 deprecated/legacy code areas
- 23+ explicit TODO comments
- 25+ type safety workarounds (`as any`)
