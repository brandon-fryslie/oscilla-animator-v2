Below is a concrete, implementation-grade Render IR that supports the hybrid renderer (Instances2D + Paths2D) while staying consistent with your “compiled IR + scheduled runtime + value store” direction.

This is not a UI-facing schema. This is the runtime-facing contract between compiler/VM and the Canvas renderer.

⸻

1) High-level shape

Core idea

The VM produces one RenderFrameIR per frame into a ValueSlot (or a well-known output). The renderer consumes it and draws.

export interface RenderFrameIR {
version: 1;

// Optional: lets renderer skip work if unchanged (hot-swap friendly)
frameKey?: FrameKey;

// Canvas clearing / compositing defaults
clear: ClearSpecIR;

// A flat list of passes, stable order, no implicit graph traversal
passes: RenderPassIR[];

// Optional overlays: debug, selection, etc (same machinery)
overlays?: RenderPassIR[];

// Metadata for debugging/profiling (not used in hot path)
meta?: RenderFrameMetaIR;
}


⸻

2) Pass model

A “pass” is a draw unit with a concrete payload type.

export type RenderPassIR =
| Instances2DPassIR
| Paths2DPassIR
| PostFXPassIR; // optional later; can be stubbed now

Shared pass header

export interface RenderPassHeaderIR {
id: string;              // stable across compiles if same semantic pass
z: number;               // stable ordering control
enabled: boolean;

// Optional: clip region for this pass
clip?: ClipSpecIR;

// Optional: global transform applied to the pass (camera-ish for 2D)
view?: Mat3x2IR;         // 2D affine

// Optional: blend / alpha
blend?: BlendSpecIR;

// Optional: warnings / perf notes (non-fatal)
notes?: string[];
}


⸻

3) Instances2D pass

This is your “thousands of particles” workhorse.

Pass IR

export interface Instances2DPassIR {
kind: "instances2d";
header: RenderPassHeaderIR;

// How many instances are in the buffers
count: number;

// Material defines how to interpret buffers into visuals
material: InstanceMaterialIR;

// The packed, typed buffer views needed to render
buffers: InstanceBufferSetIR;

// Optional: per-instance sorting (for alpha), stable deterministic
sort?: InstanceSortIR;
}

Material

You need a small material system so “circles + squares + stars” doesn’t explode your block set.

export type InstanceMaterialIR =
| { kind: "shape2d"; shading: "flat"; colorSpace: "srgb" | "linear"; }
| { kind: "sprite"; sampling: "nearest" | "linear"; textureId: string; }
| { kind: "glyph"; fontId: string; } // optional; can be implemented later

Buffers

All buffers are packed typed arrays referenced via BufferRefs (allocated by the VM Field materializer).

export interface InstanceBufferSetIR {
// Required
posXY: BufferRefIR;          // Float32Array length = count*2

// Optional but common
size: BufferRefIR | ScalarF32IR;     // Float32Array length=count OR scalar broadcast
rot: BufferRefIR | ScalarF32IR;      // radians
colorRGBA: BufferRefIR | ScalarU32IR;// Uint32Array packed or Float32Array*4 (choose one and standardize)
opacity: BufferRefIR | ScalarF32IR;

// Shape selection per instance
shapeId?: BufferRefIR | ScalarU16IR; // Uint16Array length=count (0=circle,1=square,2=star,...)

// Stroke/fill style (optional; can be material-defined)
strokeWidth?: BufferRefIR | ScalarF32IR;
strokeColorRGBA?: BufferRefIR | ScalarU32IR;

// User-defined custom channels for advanced materials
custom?: Record<string, BufferRefIR>;
}

Sorting

export type InstanceSortIR =
| { kind: "none" }
| { kind: "byKey"; key: BufferRefIR; order: "asc" | "desc" }; // Float32 key


⸻

4) Paths2D pass (geometry-first)

This is your “morphing line art / glyph outlines” track.

Pass IR

export interface Paths2DPassIR {
kind: "paths2d";
header: RenderPassHeaderIR;

// Geometry buffer describing many paths (multiple contours)
geometry: PathGeometryBufferIR;

// Styling can be per-path or global; support both
style: PathStyleIR;

// Optional: draw mode control (stroke/fill/both)
draw: { stroke: boolean; fill: boolean };
}

Geometry buffer

This is the critical part. Keep it minimal but real.

You want:
•	a single packed command stream,
•	a single packed point stream,
•	a path index so you can style per-path.

export interface PathGeometryBufferIR {
// Each path i references a slice of commands/points
pathCount: number;

// Indices into command/point arrays per path
pathCommandStart: BufferRefIR; // Uint32Array length=pathCount
pathCommandLen: BufferRefIR;   // Uint32Array length=pathCount
pathPointStart: BufferRefIR;   // Uint32Array length=pathCount
pathPointLen: BufferRefIR;     // Uint32Array length=pathCount

// Packed command stream
commands: BufferRefIR;         // Uint8Array or Uint16Array
// Packed points stream: x,y pairs
pointsXY: BufferRefIR;         // Float32Array length = totalPoints*2

// Optional: per-command additional scalars (for arcs, etc). You can omit initially.
aux?: BufferRefIR;

// Convention: points referenced by commands in-order (implicit)
encoding: PathEncodingIR;
}

Path encoding

Pick a minimal command set that supports morphing well:

export type PathEncodingIR = {
kind: "v1";
commands: ("M" | "L" | "Q" | "C" | "Z")[]; // conceptual; actual stored as numeric codes in `commands`
// Interpretation:
// M: consumes 1 point
// L: consumes 1 point
// Q: consumes 2 points (ctrl, end)
// C: consumes 3 points (c1, c2, end)
// Z: consumes 0 points
};

Style

Support either global style or per-path style via buffers:

export interface PathStyleIR {
// Fill
fillColorRGBA?: BufferRefIR | ScalarU32IR;    // per-path or global
fillRule?: "nonzero" | "evenodd";

// Stroke
strokeColorRGBA?: BufferRefIR | ScalarU32IR;
strokeWidth?: BufferRefIR | ScalarF32IR;
lineCap?: "butt" | "round" | "square";
lineJoin?: "miter" | "round" | "bevel";
miterLimit?: number;
dash?: { pattern: number[]; offset?: number } | null;

// Opacity
opacity?: BufferRefIR | ScalarF32IR;
}


⸻

5) Buffer references and scalar broadcasts

BufferRef

The VM owns allocation; the renderer just reads.

export interface BufferRefIR {
bufferId: number;              // dense id in a BufferStore
type: "f32" | "u32" | "u16" | "u8";
length: number;                // elements, not bytes
}

Scalar broadcasts

Let IR represent “scalar used as if it were a buffer” without materializing count copies.

export type ScalarF32IR = { kind: "scalar:f32"; value: number };
export type ScalarU32IR = { kind: "scalar:u32"; value: number };
export type ScalarU16IR = { kind: "scalar:u16"; value: number };


⸻

6) Clear, blend, clip, transforms

export interface ClearSpecIR {
mode: "none" | "color";
colorRGBA?: number; // packed u32 or 4 floats; pick one convention globally
}

export interface BlendSpecIR {
mode: "normal" | "add" | "multiply" | "screen";
opacity?: number; // pass-wide alpha multiplier
}

export type ClipSpecIR =
| { kind: "rect"; x: number; y: number; w: number; h: number }
| { kind: "path"; geometry: PathGeometryBufferIR }; // optional

export interface Mat3x2IR {
a: number; b: number; c: number; d: number; e: number; f: number;
}


⸻

7) How the compiler/VM should produce this

Rule: renderer IR contains only buffers + tiny headers

No closures. No per-shape objects. No arrays of JS objects per instance.

So the compilation pipeline is:
1.	Patch compiles to scheduled VM steps
2.	Field/Signal plans evaluate
3.	Materializer produces:
•	instance buffers
•	path geometry buffers
4.	A final step assembles RenderFrameIR referencing those buffers

The RenderFrameIR itself can be a small JS object; it’s not hot compared to buffer filling.

⸻

8) Mapping your example asks onto this IR
   •	“thousands of particles swirl” → Instances2D pass with posXY, size, colorRGBA, maybe shapeId
   •	“letters form briefly” → Paths2D pass for glyph outlines OR Instances2D sampled from glyph paths; you can crossfade between passes
   •	“morphing paths like visualizer” → Paths2D pass where geometry is the output of PathMorph (materializer emits the packed buffers)
   •	“2d mapping user controls per-circle” → Instances2D posXY coming from a Domain + Field that’s driven by UI/external input
   •	“circles + squares + stars together” → Instances2D shapeId selects shape, renderer draws switch per instance

⸻

If you want, next I can give:
1.	the exact Canvas renderer responsibilities for this IR (what it must do vs what must stay in the patch), and
2.	a concrete TS implementation skeleton of renderFrame(ctx, frame: RenderFrameIR, bufferStore) for Canvas 2D.