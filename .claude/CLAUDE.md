# Oscilla Animator v2

A clean rewrite of the Oscilla animation system.

## Spec Reference

All implementation must conform to the unified specification in `design-docs/spec/`. See `design-docs/spec/INDEX.md` for the complete spec index.

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
