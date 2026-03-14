# 09 - Shape Taxonomy And Draw Mode Classification

Spec target: `../WebGPU-Complete/IMPLEMENTATION-INDEX.md`, `../WebGPU-Complete/WS-04-shape-taxonomy.index.md`, `../WebGPU-Complete/shapes/Shapes 0_ Shape Taxonomy_ A Rendering Overview.md`

// [LAW:one-type-per-behavior] Shape classes should reflect real execution differences, not collapse into one generic mesh path with ad hoc flags.

## Where We Are

- `src/compiler/compile.ts:906-942` infers draw mode as only `indexed` or `nonIndexed`, based mostly on whether a topology is a closed path.
- `src/compiler/compile.ts:992-1045` builds draw-prep sinks around that narrow classification.
- `src/shapes/registry.ts:1-169` is a topology registry and topology-bank export, not a full shape-class execution taxonomy.
- The current runtime therefore has no complete class-specific execution model for Type 1 through Type 5. It mostly routes everything through one realized-mesh mental model.

## First Draft Proposal

- Promote shape class to a first-class compile-time and runtime concept with explicit GPU execution contracts.
- Each class should define what lives in ShapeBank, what lives in arena, and how render/draw-prep interpret it.
- Draw-prep and render should branch on shape-class data contracts, not on a thin `indexed` vs `nonIndexed` classification.
- This migration is necessary to avoid re-implementing every new class by first collapsing it into the old CPU mesh path.
