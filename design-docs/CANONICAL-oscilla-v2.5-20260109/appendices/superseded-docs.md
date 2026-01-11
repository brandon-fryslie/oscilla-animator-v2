---
parent: ../INDEX.md
---

# Superseded Documents

The following documents are now historical artifacts.
This specification series is the authoritative source.

---

## Archived Documents

| Document | Original Location | Archived To |
|----------|-------------------|-------------|
| INDEX.md | design-docs/spec/ | spec-archived-20260109-160000/ |
| 00-invariants.md | design-docs/spec/ | spec-archived-20260109-160000/ |
| AMBIGUITIES.md | design-docs/spec/ | spec-archived-20260109-160000/ |
| 02-time.md | design-docs/spec/graph/ | spec-archived-20260109-160000/graph/ |
| 03-buses.md | design-docs/spec/graph/ | spec-archived-20260109-160000/graph/ |
| 06-blocks.md | design-docs/spec/graph/ | spec-archived-20260109-160000/graph/ |
| 07-transforms.md | design-docs/spec/graph/ | spec-archived-20260109-160000/graph/ |
| 08-primitives-composites.md | design-docs/spec/graph/ | spec-archived-20260109-160000/graph/ |
| stateful-blocks.md | design-docs/spec/graph/ | spec-archived-20260109-160000/graph/ |
| basic-12-blocks.md | design-docs/spec/graph/ | spec-archived-20260109-160000/graph/ |
| 01-type-system.md | design-docs/spec/compiler/ | spec-archived-20260109-160000/compiler/ |
| 02-polymorphism.md | design-docs/spec/compiler/ | spec-archived-20260109-160000/compiler/ |
| 03-category-theory.md | design-docs/spec/compiler/ | spec-archived-20260109-160000/compiler/ |
| 04-compilation.md | design-docs/spec/compiler/ | spec-archived-20260109-160000/compiler/ |
| canonical-types-and-constraints.md | design-docs/spec/compiler/ | spec-archived-20260109-160000/compiler/ |
| canonical-types-and-constraints-UPDATED.md | design-docs/spec/compiler/ | spec-archived-20260109-160000/compiler/ |
| maybe-block-defs.md | design-docs/spec/compiler/ | spec-archived-20260109-160000/compiler/ |
| 05-runtime.md | design-docs/spec/runtime/ | spec-archived-20260109-160000/runtime/ |
| 09-renderer.md | design-docs/spec/renderer/ | spec-archived-20260109-160000/renderer/ |
| RENDER-PIPELINE.md | design-docs/spec/renderer/ | spec-archived-20260109-160000/renderer/ |
| 10-phase-matching-system.md | design-docs/spec/time/ | spec-archived-20260109-160000/time/ |
| 11-phase-unwrap-IMPORTANT.md | design-docs/spec/time/ | spec-archived-20260109-160000/time/ |
| ChatGPT-Fundamental Axes in Systems.md | design-docs/spec/_architecture-refinement/ | spec-archived-20260109-160000/_architecture-refinement/ |

---

## Working Documents (Also Archived)

These intermediate canonicalization documents are also in the archive:

| Document | Purpose |
|----------|---------|
| CANONICALIZED-SUMMARY-oscilla-v2-20260108-140000.md | First summary |
| CANONICALIZED-SUMMARY-oscilla-v2-20260109-120000.md | Updated summary |
| CANONICALIZED-QUESTIONS-oscilla-v2-20260108-140000.md | First resolution tracking |
| CANONICALIZED-QUESTIONS-oscilla-v2-20260109-120000.md | Final resolutions |
| CANONICALIZED-GLOSSARY-oscilla-v2-20260108-140000.md | First glossary |
| CANONICALIZED-GLOSSARY-oscilla-v2-20260109-120000.md | Final glossary |
| EDITORIAL-REVIEW-oscilla-v2-20260109-130000.md | Peer design review |
| USER-APPROVAL-oscilla-v2-20260109-150000.md | Approval record |

---

## Conversation Exports (Design History)

ChatGPT conversation exports documenting the v2.5 design process:

| Document | Original Location | Archived To | Purpose |
|----------|-------------------|-------------|---------|
| compiler-changes.md | design-docs/ | conversations-archived-20260111/ | 5-axis type system, compiler pipeline design |
| runtime-changes.md | design-docs/ | conversations-archived-20260111/ | Runtime implications of 5-axis model |
| IR-and-normalization-5-axes.md | design-docs/ | conversations-archived-20260111/ | Detailed IR schema, graph normalization v2.5 |
| later_spec/HANDOFF-ForeverYours-Debug.md | design-docs/later_spec/ | conversations-archived-20260111/later_spec/ | Debug system handoff notes |
| later_spec/steel-thread-validation.md | design-docs/later_spec/ | conversations-archived-20260111/later_spec/ | Validation approach |
| later_spec/TUTORIAL.md | design-docs/later_spec/ | conversations-archived-20260111/later_spec/ | Tutorial notes |

**Archived**: 2026-01-11T06:15:00Z

**Rationale**: These documents show design rationale and decision-making process - valuable as historical context. The architectural content is already integrated into canonical Topics 01, 04, 05, 07-10.

---

## Archive Locations

All original documents were moved to:
```
design-docs/spec-archived-20260109-160000/          # Original v2 specs
design-docs/conversations-archived-20260111/        # v2.5 design conversations
```

Directory structure preserved within archives.

---

## Using Archived Documents

The archived documents may be useful for:
- Understanding historical context
- Reviewing original phrasing
- Tracing how decisions evolved
- Comparing v2 vs v2.5 type system

They should **NOT** be used for:
- Current implementation guidance
- Authoritative definitions
- Design decisions

---

## Canonical Sources

For authoritative information, use:

| Purpose | Document |
|---------|----------|
| Quick overview | [SUMMARY.md](../SUMMARY.md) |
| Non-negotiable rules | [INVARIANTS.md](../INVARIANTS.md) |
| Term definitions | [GLOSSARY.md](../GLOSSARY.md) |
| Type system | [01-type-system.md](../topics/01-type-system.md) |
| Block system | [02-block-system.md](../topics/02-block-system.md) |
| Time system | [03-time-system.md](../topics/03-time-system.md) |
| Compilation | [04-compilation.md](../topics/04-compilation.md) |
| Runtime | [05-runtime.md](../topics/05-runtime.md) |
| Renderer | [06-renderer.md](../topics/06-renderer.md) |
| Decision history | [RESOLUTION-LOG.md](../RESOLUTION-LOG.md) |

---

## Companion Document

The monolith summary document:
```
design-docs/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md
```

This provides a condensed single-document overview for quick reference.
For detailed specifications, use this encyclopedia.
