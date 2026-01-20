# Definition of Done: Documentation Alignment

**Sprint:** SPRINT-20260120-doc-alignment

## Acceptance Criteria

- [ ] Spec note added about naming conventions (1 sentence, ADDITIVE)
- [ ] Spec note added about ValueSlot (2-3 sentences, ADDITIVE)
- [ ] No existing spec text modified
- [ ] Notes placed in appropriate sections of 04-compilation.md

## Out of Scope

- Code changes
- Separate mapping documents
- Adding new types

## Verification

```bash
grep -q "convention" design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md
grep -q "ValueSlot" design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md
```
