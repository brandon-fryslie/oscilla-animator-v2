# Polymorphic Cardinality Spec (Superseded)

This document is superseded by:
- `design-docs/cardinality-solver.md`
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md`
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md`

## Why Superseded

Older revisions described block-level mode switches (`preserve`, `signalOnly`, `fieldOnly`, `transform`) and broadcast policies (`allowZipSig`, etc.).

Canonical direction is now CT/ICT-first:
1. Cardinality behavior is declared on per-port cardinality vars.
2. Group membership is derived from shared var ids.
3. Propagation is declared via `relation` (`uniform` or `promoteToMany`).
4. Port flexibility is declared via `acceptance` (`oneOnly`, `manyOnly`, `oneOrMany`).
5. Instance source is declared via `instanceBinding` (`inherit` or `create(domainType)`).

## Legacy Mode Mapping (for migration only)

| Legacy Pattern | CT/ICT Declaration |
|---|---|
| signal-only block | concrete `inst(one)` ports or var ports with `acceptance:'oneOnly'` |
| field-only block | concrete `inst(many)` ports or var ports with `acceptance:'manyOnly'` |
| preserve + strict | shared var with `relation:'uniform'` |
| preserve + zip semantics | shared var with `relation:'promoteToMany'` and explicit acceptance bounds |
| transform/create-instance | output vars with `instanceBinding:{kind:'create', domainType}` + `acceptance:'manyOnly'` |

## Migration Directive

Treat this file as historical compatibility guidance only. Mode-style metadata and registry fallback translation have been removed; new architecture and implementation work must use the CT/ICT model from the canonical docs listed above.
