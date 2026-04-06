# B2: SourceBundle + Expression-as-Modifier Initiative

**Status:** Design phase
**Goal:** Redesign the C1 block library around the 4-Pillar architecture using `SourceBundle` as the compound proxy type and `Expression` as a universal math Modifier with variadic ports derived from bundle types.

## Background

The C1 block library currently has 10 blocks migrated from V1, all using decomposed scalar ports (e.g., `RenderInstances2D` has separate `pos_x`, `pos_y`, `color_r`, `color_g`, `color_b` inputs). This was a temporary shortcut to get the first vertical slice working. The real architecture, established in `B0-4-Pillar-Arch-UBER.md`, uses opaque compound proxies that flow between Generators, Modifiers, Materials, and Intents.

This initiative replaces the decomposed-scalar approach with a `SourceBundle` proxy model. Key properties:

- A `SourceBundle` is a named collection of fields, each with its own type
- Modifier blocks receive a bundle, expose selected fields as modulatable input ports (derived from the bundle's type), and output a new bundle with some fields replaced
- The Expression block becomes the universal math primitive — Sin/Cos/Add etc. are palette presets, not separate block types
- Variadic ports are real ports (full type solver participation), not the `collectAccepts` hack
- Feedback is detected from graph topology (back edges in cycles) and handled transparently

## Documents

| File | Purpose |
|------|---------|
| `01-engineering-design.md` | Engineering constraints and design decisions, traced back to GPU execution model and existing IR shape |
| `02-vertical-slice-plan.md` | Concrete next step: smallest possible end-to-end implementation that proves the model works in real code |

## Related

- Architecture context: `../B0-4-Pillar-Arch-UBER.md`
- Reference implementations: `../B0-4-Pillar-Reference-Implementations.md`
- Design mockup tool: `src/design-mockup/` (run via `npm run dev` → `/design-mockup.html`)
- Memory note: `~/.claude/projects/-Users-bmf-code-oscilla-animator-v2/memory/project_shape_bundle_design.md`
