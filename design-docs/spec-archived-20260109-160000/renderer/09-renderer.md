# Renderer Contract (Unified Spec)

The renderer is a deterministic draw executor. It is not a simulator, scheduler, or graph evaluator.

## Responsibilities (Must)

1) Canvas lifecycle and frame orchestration
- Own the canvas/context and handle resize, DPR, and viewport mapping.
- Expose a single entry point: `render(frame: RenderFrame)`.

2) Deterministic command execution
- Execute a fully resolved draw list in a stable order.
- Do not sort unless ordering is explicitly encoded in the commands.

3) Resource management
- Cache immutable resources by stable keys (Path2D, images, gradients, patterns).
- Enforce explicit ownership and use LRU eviction for stale resources.

4) Materialization boundary
- Treat the renderer as the primary sink for field materialization.
- Prefer typed buffers provided by runtime; do not evaluate FieldExpr inside the renderer.

5) Debug overlays (minimal)
- Draw overlays only when explicitly requested via debug draw commands.

## Responsibilities (Should)

- Batch state changes to minimize context churn.
- Reuse Path2D and buffers across frames.
- Keep the draw command set small and explicit.

## Responsibilities (Must Not)

- Do not compute time, cycles, or procedural behavior.
- Do not resolve buses, adapters, or lenses.
- Do not evaluate the graph or compile expressions.
- Do not apply implicit sorting heuristics.
- Do not interpret domain identity (renderer draws buffers, not elements).

## Optional Features (Carefully Scoped)

- Clips and masks (prefer rectangular clips and explicit effect nodes).
- Filters (only at group level; avoid per-instance filters).
- Offscreen passes (explicit render-to-texture nodes only).

## Determinism

Given the same RenderFrame and resources, output must be identical across runs.
