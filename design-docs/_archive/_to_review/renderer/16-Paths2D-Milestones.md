# Paths2D Milestones

This plan breaks the work into staged milestones with clear acceptance checks.

## Milestone 1: Const Paths Render
**Definition:** RenderPaths2D outputs a visible, static path using defaults only.

**Acceptance Checks:**
- Compiler emits `paths2d` render sink.
- Schedule includes `materializePath` step.
- RenderFrameIR includes `paths2d` pass.
- Canvas shows the default path.

## Milestone 2: Path Style Control
**Definition:** Fill, stroke, width, and opacity are correctly applied per path.

**Acceptance Checks:**
- Fill color changes when input field changes.
- Stroke color and width changes take effect.
- Opacity affects output.

## Milestone 3: Path Transforms
**Definition:** Transform ops apply per-element transforms to path geometry.

**Acceptance Checks:**
- PathTranslate/Scale/Rotate ops work on each path.
- Signal-driven transforms animate correctly.

## Milestone 4: Path Morphing (Optional)
**Definition:** Two path fields can be interpolated.

**Acceptance Checks:**
- `FieldZip` path op (PathLerp) produces smooth morphing.
- Morphing respects determinism and caches.

