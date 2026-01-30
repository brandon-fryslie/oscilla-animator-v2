---
topic: 01
name: Helper Function Naming
spec_file: design-docs/canonical-types/04-CanonicalTypes-Analysis.md
category: trivial
audited: 2026-01-28T21:00:48Z
item_count: 3
---

# Topic 01: Helper Function Naming — Trivial Gaps

These are cosmetic divergences. No action needed unless doing a cleanup pass.

- signalTypeSignal → canonicalSignal: src/core/canonical-types.ts:809 — helper name uses "signalType" prefix
- signalTypeField → canonicalField: src/core/canonical-types.ts:822 — helper name uses "signalType" prefix  
- signalTypeTrigger → canonicalTrigger: src/core/canonical-types.ts:837 — helper name uses "signalType" prefix
