# Oscilla Animator v2

A clean rewrite of the Oscilla animation system.

## Spec Reference

All implementation must conform to the canonical specification in `design-docs/CANONICAL-oscilla-v2.5-20260109/`.

### Spec Reading Strategy

For implementation work, read the **condensed essential spec first**:
- `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` (~25k tokens)

This contains all invariants, core glossary terms, and T1 content from type system, block system, compilation, and runtime.

**Only read full topic files when working in that specific area:**
- Diagnostics: 07-diagnostics-system.md, 08-observation-system.md
- UI panels: 09-debug-ui-spec.md, 14-modulation-table-ui.md, 15-graph-editor-ui.md
- Continuity/anti-jank: 11-continuity-system.md
- Event coordination: 12-event-hub.md, 13-event-diagnostics-integration.md
- Design disputes: RESOLUTION-LOG.md

See `design-docs/CANONICAL-oscilla-v2.5-20260109/INDEX.md` for full topic navigation.

## Key Principles

1. **Spec is source of truth** - When in doubt, consult the spec
2. **Invariants are non-negotiable** - See `00-invariants.md`
3. **Single source of truth** - Each concept has one canonical representation
4. **Mechanical enforcement** - Prefer compile-time over runtime over documentation

## Development

```bash
npm run dev        # Start dev server
npm run build      # Type check and build
npm run typecheck  # Type check only
npm run test       # Run tests
npm run test:watch # Run tests in watch mode
```

## Architecture Notes

<!-- TODO: Add architecture overview as system develops -->

See `.claude/rules/` for domain-specific guidelines tied to spec documents.

## Reference: v1 Codebase

The v1 codebase is at `~/code/oscilla-animator_codex` and contains:
- Block/Edge role discriminated unions: `src/editor/types.ts`
- Role invariants spec: `design-docs/final-System-Invariants/15-Block-Edge-Roles.md`
- GraphNormalizer implementation: `src/editor/graph/GraphNormalizer.ts`
