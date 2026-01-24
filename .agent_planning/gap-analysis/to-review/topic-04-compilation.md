---
topic: 04
name: Compilation
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: to-review
audited: 2026-01-23T12:00:00Z
item_count: 1
---

# Topic 04: Compilation — Items for Review

## Items

### R-8: Expression trees vs Op-level IR
**Spec says**: CompiledProgramIR uses Schedule with Step kinds (eval_scalar, eval_field, state_read, state_write, combine, render) — op-level IR
**Code does**: Uses expression tree DAGs (SigExpr, FieldExpr) evaluated by SignalEvaluator/Materializer — more flexible, supports lazy evaluation
**Why it might be better**: Expression trees enable structural sharing (I13 hash-consing), lazy field materialization, and are more natural for the DAG structure. Op-level IR would require flattening.
**Question for user**: Is the expression-tree approach the intentional divergence from op-level IR? Should spec be updated to reflect this architecture?
