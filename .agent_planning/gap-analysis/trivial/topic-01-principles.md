---
topic: 01
name: Principles - Single Type Authority
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/principles/t1_single-authority.md
category: trivial
audited: 2026-01-29
item_count: 3
---

# Topic 01: Principles - Single Type Authority — Trivial Gaps

These are cosmetic divergences. No action needed unless doing a cleanup pass.

- `getInstValue` (spec helper) not present in code: `src/core/canonical-types.ts` — `deriveKind()` inlines the axis extraction with `card.kind !== 'inst'` checks instead of calling a named helper. Same semantics, different shape.
- `requireSignalType` / `requireEventType` (spec names) vs `assertSignalType` / `assertEventType` (code names): `src/core/canonical-types.ts:751,799` — Spec uses "require" prefix, code uses "assert" prefix. Both throw on failure. The `requireManyInstance` function does follow the spec name.
- `DEFAULTS_V0.perspective = 'global'` / `DEFAULTS_V0.branch = 'main'` vs spec `PerspectiveValue = { kind: 'default' }` / `BranchValue = { kind: 'default' }`: `src/core/canonical-types.ts:894-895` — V0 defaults use plain strings instead of the value types. These are already marked `@deprecated` with TODO comments.
