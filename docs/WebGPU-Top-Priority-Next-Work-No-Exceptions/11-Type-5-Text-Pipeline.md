# 11 - Type 5 Text Pipeline

Spec target: `../WebGPU-Complete/workstreams/slices/S06-first-type5-text.md`, `../WebGPU-Complete/shapes/Shapes 5_ Deep Dive_ Text_Glyph Hybrid Rendering.md`

// [LAW:one-type-per-behavior] Text is its own rendering class with a different ownership split from rigid/path geometry.

## Where We Are

- The spec expects a Type 5 path with CPU/worker shaping plus GPU glyph rendering through atlas metadata and MSDF fragment evaluation.
- In `src/`, there is no production implementation for `MSDF`, `glyph`, `font atlas`, or `HarfBuzz`.
- The current shape and draw-prep paths do not contain a Type 5 class-specific contract. They still assume the generic realized-mesh pipeline described in the other documents in this folder.
- This is not a partial migration gap. It is an unimplemented spec topic.

## First Draft Proposal

- Add Type 5 as an explicit shape class with its own compile/runtime contracts.
- Keep shaping on the CPU or worker where the spec intends, but make the render path GPU-native: shared quad topology, glyph-instance arena payloads, atlas metadata lookup, and MSDF fragment evaluation.
- Do not force text through the current generic ShapeBank-to-mesh realization path.
- Treat text as a separate implementation stream once the lower-level ShapeBank/draw-prep/render ownership model is corrected.
