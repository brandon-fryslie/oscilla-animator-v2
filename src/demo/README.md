# Demo Library

This demo set is curated around four purposes:

- `examples`: small, readable starter patches.
- `features`: focused demos for specific authoring/runtime capabilities.
- `showcase`: high-impact patches chosen primarily for visual punch.
- `integration` / `stress`: regression and systems coverage that still render something useful.

`src/demo/demo-catalog.ts` is the canonical source of truth for demo grouping, order, and intent.

## Curation Rules

- Prefer the cooler-looking patch when two demos cover the same path.
- Keep at most one plain variant when a richer patch proves the same feature.
- Every retained demo should either teach something quickly, cover a distinct engine path, or look strong enough to justify its slot.

## Removed As Redundant

- `domain-test.hcl`
- `tile-grid-uv.hcl`
- `diagnostic-expression-broadcast.hcl`
- `feedback-simple.hcl`
- `golden-spiral.hcl`
- `mouse-reactive.hcl`

## Still Missing

- Event-system demos: `EdgeTrigger`, `SampleHold`, `PulseDivider`, `ChanceGate`, `EventToOneMask`.
- External gate / IO coverage beyond scalar mouse-driven motion.
- Composite-authoring demos that exercise reusable graph composition.
- Text/glyph showcase demos, if and when text becomes authorable through demo patches.
