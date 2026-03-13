# Shapes 2: Parametric Curve - TRIVIAL Items

## Item 1: Uniform Resolution Mandate
**Spec says**: Hard Invariant 1: "A single indirect record requires a uniform topology count contract for all instances in that record. Resolution is locked per compatible bucket."
**Implementation**: `src/blocks/shape/parametric-curve-2d.ts:97-100` resolves resolution from the input and uses it for topology registration. All instances sharing a render sink use the same topology (enforced by `DrawPrepSinkTablePacker.ts:141-149` which asserts all instances have the same shape handle).
**Gap**: Uniform resolution is implicitly enforced by the single-topology-per-sink model. No explicit "resolution lock" check exists but the architecture prevents mixing.
**Classification**: TRIVIAL - Enforced by architecture, not by explicit check. No functional gap.

## Item 2: Template Immutability
**Spec says**: Hard Invariant 3: "The t-value progression in the ShapeBank must remain static during the render pass."
**Implementation**: t-values are computed fresh each frame in `ParametricCurveGeometry.ts:29-37` but are deterministic (same resolution produces same values). In the current CPU model, t-values are transient and consumed immediately, never persisted in ShapeBank.
**Gap**: Immutability is trivially satisfied because t-values are recomputed identically each frame. In a GPU model, they would need to be stored immutably in ShapeBank.
**Classification**: TRIVIAL - Satisfied by deterministic recomputation.
