It manifests as a backend-agnostic RenderIR plus a thin backend adapter per target, with one clear seam: the runtime produces the same RenderFrameIR regardless of backend, and each backend implements renderFrame(frame, target).

The important part is choosing what “backend-agnostic” means. For your goals (slot-addressed, deterministic, sink-only renderer), the right split is:
•	Runtime emits a generic draw program (RenderIR) with explicit geometry + style + ordering.
•	Backends implement rasterization / submission, not meaning.

There are two viable levels of abstraction; pick one now so you don’t redo it later.

⸻

1) The seam: “RenderAssembler” outputs generic ops, backends consume ops

A. Runtime responsibility

executeFrame() (or RenderAssembler) returns:

type RenderFrameIR = {
passes: RenderPassIR[];
};

type RenderPassIR =
| { kind: 'drawPathInstances'; op: DrawPathInstancesOp }
| { kind: 'drawMeshInstances'; op: DrawMeshInstancesOp }   // later
| { kind: 'drawImageInstances'; op: DrawImageInstancesOp } // later
;

Where each op is fully resolved:
•	typed arrays
•	numeric topology ids
•	concrete control point buffers
•	explicit style values
•	explicit transforms

No slot ids, no expression ids, no runtime state in the renderer.

B. Backend responsibility

Each backend implements the same interface:

interface RenderBackend<TTarget> {
beginFrame(target: TTarget, frameInfo: FrameInfo): void;
executePass(pass: RenderPassIR): void;
endFrame(): void;
}

For Canvas2D, TTarget = CanvasRenderingContext2D.
For WebGL/WebGPU, TTarget is a GPU context or command encoder.
For SVG, TTarget is a DOM builder or string sink.

⸻

2) What changes in RenderIR to support multiple backends cleanly

Canvas is immediate-mode; GPU is retained-ish/command-buffer. SVG is retained and vector. If you encode RenderIR too “canvas-like” (moveTo/lineTo/fill on a mutable context), you’ll fight every other backend.

So RenderIR should be declarative about what to draw, not imperative about how to draw it on a stateful API.

A. Geometry in RenderIR should be explicit data

For your “arbitrary drawable path” focus:

type PathTopologyId = number;

type PathGeometry = {
topologyId: PathTopologyId;      // verbs live in registry keyed by id
points: Float32Array;            // local-space x,y pairs
pointsCount: number;             // vec2 count
};

B. Instancing should be explicit

Instead of “ctx.translate inside loop,” RenderIR carries instance transforms:

type Transform2D = {
position: Float32Array; // count*2, in normalized or pixels (choose one and stick to it)
rotation?: Float32Array | number; // optional
scale: Float32Array | number;     // size
};

C. Style should be explicit

No “fillStyle string” as the primary. Use numeric style fields so GPU backends can batch:

type FillStyle = { color: Uint8ClampedArray | number /* packed RGBA */; };
type StrokeStyle = { color: Uint8ClampedArray | number; width: Float32Array | number; join: number; cap: number; dash?: Float32Array; };

type DrawPathInstancesOp = {
geometry: PathGeometry;
transform: Transform2D;
fill?: FillStyle;
stroke?: StrokeStyle;
blendMode?: number;
opacity?: Float32Array | number;
count: number;
};

Canvas backend converts these to ctx.fillStyle = ... and ctx.fill().
GPU backend converts them into attribute buffers/uniforms and shader draws.
SVG backend converts them into <path d="..."> with attributes.

⸻

3) Backend differences and how you handle them without polluting the system

A. Canvas2D backend
•	Uses topology verbs + points to build a path each instance
•	Fills/strokes per instance (or per batch if style uniform)
•	Simple, correct reference implementation

B. WebGL/WebGPU backend

For paths you have a choice:
1.	Tessellate paths to triangles in the runtime (or a geometry stage)
•	RenderIR gains an optional “mesh” form:
•	DrawMeshInstancesOp { positions, indices, ... }
•	Path backends either:
•	tessellate once per topology+points cache key, then instance
2.	Use signed distance fields / analytic distance shaders (harder)

If you want to keep the same RenderIR, you can support both by adding a derived op:
•	RenderAssembler can optionally emit a tessellated mesh op when backend asks for it, but that’s a policy you can keep out of the renderer if you structure it as a prepass.

C. SVG backend

SVG wants a d string. That’s just a serialization of verbs+points. No need to change core representation.

⸻

4) How this manifests in code structure (files/modules)

You end up with:
•	runtime/executeFrame.ts
Produces backend-agnostic RenderFrameIR.
•	render/backends/canvas2d.ts
renderFrame(ctx, frame)
•	render/backends/svg.ts
renderFrame(svgBuilder, frame)
•	render/backends/webgpu.ts
renderFrame(gpuContext, frame) (likely with caching and tessellation)

And a registry shared by runtime + backends:
•	shapes/topologyRegistry.ts
•	numeric topology ids
•	verbs, arity, maybe precomputed “d” strings for svg caching

⸻

5) The non-negotiable rule that keeps this sane

Backends must not force changes to the meaning of RenderIR.
If a backend can’t draw something directly (GPU + paths), the adaptation is either:
•	a deterministic, cache-keyed lowering step (path → mesh) in a backend-specific prepass, or
•	a capability negotiation that causes compilation to choose different ops

But you don’t let “the WebGPU backend needs triangles” leak into “what a shape is” in the graph.

⸻

6) Capability negotiation (how the runtime knows what to emit)

Eventually you’ll want:

type BackendCaps = {
supportsPaths: boolean;
supportsInstancedPaths: boolean;
supportsMeshes: boolean;
supportsGradients: boolean;
};

Two clean ways:
1.	Always emit the highest-level IR (paths), and let backend lower if needed.
Best for correctness and simplicity early.
2.	Emit backend-targeted IR by running a lowering pipeline based on caps.
Best for performance later.

Either way, the “manifestation” is: different backends consume the same logical RenderIR, possibly after deterministic lowering steps.

⸻

In short: you make “multiple backends” a property of the renderer module, not the core runtime graph or type system, by standardizing on a declarative, backend-agnostic RenderIR whose primitives are explicit geometry + transforms + style + ordering, and by making each backend a pure consumer (or a consumer plus deterministic lowering) of that same IR.