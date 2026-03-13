# P1-3: GPU-Driven Rendering (Indirect Command Buffer) - CRITICAL Items

## Item 1: CPU Owns Dynamic Draw Counts (Invariant Violation)
**Spec says**: Invariant: "The CPU never writes dynamic draw counts (instanceCount, vertexCount, indexCount) during the frame loop." (Top of document). These must be owned by GPU draw-prep.
**Implementation**: Instance counts are authored by the CPU in `DrawPrepSinkTablePacker.ts` and uploaded to the sink table via SharedArrayBuffer. The draw-prep compute shader then copies these CPU-provided counts into the indirect buffer. The flow is: CPU sets `instanceCount` in sink table -> upload via SharedArrayBuffer -> draw-prep copies to indirect args. The CPU IS writing dynamic draw counts every frame (when install revision changes).
**Gap**: This violates the spec's fundamental invariant. The spec says the GPU must determine draw counts. Currently, the CPU is the authority for instance counts, with the GPU draw-prep merely copying CPU-provided values. For the system to support GPU-driven particle systems (variable visibility), this flow must be inverted so that GPU computes the counts and draw-prep reads them.
**Classification**: CRITICAL

**Rationale**: This is listed as the primary invariant of the P1-3 spec. The current design works for static-cardinality scenes but fundamentally blocks GPU-driven dynamic rendering (the stated objective of P1-3).
