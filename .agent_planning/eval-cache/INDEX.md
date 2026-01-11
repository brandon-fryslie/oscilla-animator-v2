# Evaluation Cache Index

**Purpose**: Reusable findings from work-evaluator runs to avoid redundant testing.

**Last Updated**: 2026-01-11 09:17:58

## Active Cache Files

### Runtime Behavior
- **runtime-diagnostics-system.md** (FRESH): Diagnostics System Sprint 1 test suite, coverage, build characteristics, integration points

### Break-It Test Patterns
(None yet - will accumulate patterns that reveal bugs)

### Data Flow Verification
(None yet - will capture stable data flow patterns)

## Cache Confidence Levels

- **FRESH**: Just evaluated, fully trusted
- **RECENT**: Evaluated recently, no code changes detected
- **RISKY**: Related code changed, verify affected areas
- **STALE**: Files in scope changed, full re-evaluation needed

## Usage Notes

**For work-evaluator**: Check this index before evaluating. Reuse findings where confidence allows.

**For implementers**: Update runtime-*.md files when discovering new behaviors during implementation.

**For project-evaluator**: These are scoped findings (work-level). Project-level evaluations use broader scope.
