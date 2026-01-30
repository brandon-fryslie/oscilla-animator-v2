---
topic: 04-05
name: Naming Divergences (Validation + Migration)
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/
category: trivial
audited: 2026-01-29
item_count: 4
---

# Topics 04-05: Naming — Trivial Gaps

These are cosmetic divergences. No action needed unless doing a cleanup pass.

- `validateTypes` vs spec `validateAxes`: `src/compiler/frontend/axis-validate.ts:36` — function validates CanonicalType[] rather than ValueExpr[], so "Types" is accurate for now. Rename when ValueExpr exists.
- `typeIndex` vs spec `exprIndex`: `src/compiler/frontend/axis-validate.ts:27` — field name diverges because input is types not expressions. Rename with ValueExpr.
- `blockType: string` vs spec `blockId: BlockId`: `src/graph/adapters.ts:67` — AdapterSpec uses unbranded string for block reference. Cosmetic until full adapter restructure.
- `CompilationInspectorService.getResolvedPortTypes()` method name: `src/services/CompilationInspectorService.ts:263` — uses legacy terminology "PortTypes" but returns CanonicalType values. Rename to `getResolvedTypes()` or similar.
