Below are the IR deltas you need to add (and nothing else) to support the 3D subset you described, while staying consistent with your “program as data + scheduled runtime + value store” model.

⸻

1) CameraIR

1.1 Types

Add these TypeDomains (if not already present):
•	vec3, quat, mat4, camera

Keep camera as special (opaque semantic), but its storage is a compact struct.

export type TypeDomain =
| "vec3" | "quat" | "mat4" | "camera"
| /* existing */ ;

1.2 Camera IR schema

Camera must be data-only and deterministic. No implicit viewport reads inside camera math; viewport is an explicit dependency.

export type CameraId = string;

export type ProjectionKind = "perspective" | "orthographic";

export interface CameraIR {
id: CameraId;

// Stable coordinate convention (must be fixed for Rust parity)
handedness: "right";
forwardAxis: "-Z";     // camera looks down -Z
upAxis: "+Y";

projection: {
kind: ProjectionKind;

    // Common
    near: number;        // > 0
    far: number;         // > near

    // Perspective
    fovYRad?: number;    // (0, pi)
    // OR (alternative if you prefer): focalLengthPx (but then depends on viewport)
    // focalLengthPx?: number;

    // Ortho
    orthoHeight?: number; // world units visible vertically
};

// View transform inputs (choose one canonical form; do not support “either/or”)
pose: {
position: { x: number; y: number; z: number };
orientation: { x: number; y: number; z: number; w: number }; // unit quat
};

// Optional post-projection screen mapping
ndcToScreen: {codex resume 019b5ccf-22ed-7b51-92ee-adf65e26176b
origin: "center";     // NDC origin
yAxis: "down";        // screen space
};
}

1.3 Camera evaluation contract

The runtime produces a CameraEval struct used by the pass:

export interface CameraEval {
viewMat4: Float32Array;      // 16
projMat4: Float32Array;      // 16
viewProjMat4: Float32Array;  // 16
viewportKey: { w: number; h: number; dpr: number }; // hashed in cache keys
}

Determinism rule: matrix build math must be specified (float32 ops, rounding policy) to match Rust/WASM.

⸻

2) MeshIR (extrusion-only subset)

Your goal: “extrude simple 2D shapes into 3D solids” (circle→flattened sphere-ish, etc.) without arbitrary meshes.

2.1 Primitive mesh sources

Do not accept arbitrary triangles as author input. Instead encode procedural mesh recipes:

export type MeshId = string;

export type ExtrudeProfile2D =
| { kind: "circle"; radius: number; segments: number }     // radius in world units
| { kind: "ngon"; sides: number; radius: number }          // regular polygon
| { kind: "polyline"; points: {x:number;y:number}[]; closed: boolean }; // rare, but still 2D

export type ExtrudeKind =
| { kind: "linear"; depth: number; cap: "both" | "front" | "back" | "none" }
| { kind: "rounded"; depth: number; roundSegments: number; radius: number }; // “flattened sphere” feel

export interface MeshIR {
id: MeshId;

// One recipe only: profile + extrusion
recipe: {
profile: ExtrudeProfile2D;
extrude: ExtrudeKind;

    // Optional bevel, kept extremely constrained
    bevel?: { size: number; segments: number };
};

// Vertex attributes included (keep minimal)
attributes: {
normals: boolean;   // needed for simple lighting later
uvs: boolean;       // optional, but define now
};

// Topology determinism
winding: "CCW";
indexed: true;         // always produce indexed geometry
indexType: "u16" | "u32";  // choose based on max verts
}

2.2 Mesh materialization and caching

Mesh generation is expensive, so it becomes a materialization step:
•	Produces MeshBufferRef (typed arrays)
•	Cache key must include the entire recipe + indexType + attribute flags

export interface MeshBufferRef {
positions: Float32Array;  // xyz interleaved or separate; pick one and lock it
normals?: Float32Array;
uvs?: Float32Array;
indices: Uint16Array | Uint32Array;
bounds: { min:{x:number;y:number;z:number}, max:{x:number;y:number;z:number} };
}

Important: this mesh cache is independent of camera/viewpoint. Only recipe changes invalidate it.

⸻

3) instances3d_projected2d pass contract

This is the “bridge”: you keep the renderer 2D-canvas for now, but allow 3D transforms and simple solids by projecting them to 2D primitives (or 2D path buffers) deterministically.

3.1 Pass purpose

Given:
•	a Domain of instances
•	per-instance Transform3D (and optional per-instance mesh selection)
•	a CameraEval
produce:
•	per-instance Projected2D attributes that existing 2D renderer can consume without knowing 3D exists.

3.2 IR: Pass node / opcode

Add an opcode (or kernel id) with explicit slots:

export type OpCode =
| { kind: "Instances3D_ProjectTo2D" }
| /* existing */;

3.3 Inputs/Outputs

This should be a render-prep node: it does not draw; it emits 2D instance buffers.

Inputs
•	domain: Domain
•	camera: CameraEval (or cameraId resolved to CameraEval slot)
•	modelMat4: Field<mat4> OR a packed transform representation (preferred)
•	mesh: Scalar<MeshId> OR Field<MeshId> (optional; start scalar then allow field)
•	style fields (color, size, stroke) as you already do for 2D instances

Outputs
•	instances2D: RenderCmds (or a typed Instance2DBufferRef)
•	optional depth: Field<number> (for painter’s sort)

Suggested output type domain:
•	renderCmds (preferred) or instances2D

// output is a buffer handle in ValueStore, not a JS object list
export interface Instance2DBufferRef {
// one entry per domain element
x: Float32Array;
y: Float32Array;
// optional: per-instance scale after projection
s?: Float32Array;
// optional: angle for sprite-like 2D rotation
rot?: Float32Array;
// packed color channels (your chosen option C)
r: Uint8Array; g: Uint8Array; b: Uint8Array; a: Uint8Array;
// optional depth for sorting
z?: Float32Array;

// optional: cull mask to skip drawing
alive?: Uint8Array; // 0/1
}

3.4 Cache keys

This pass is per-frame-ish, but should still cache aggressively when inputs are stable.

CacheKeySpec must include:
•	StepId (obvious)
•	domainIdentityVersion (or domain slot content hash / stable generation id)
•	cameraKey (hash of viewProj + viewportKey)
•	transformExprIds (or field expr ids) for model transforms
•	style expr ids (color/size/etc)
•	meshRef only if mesh affects projection output (it might not if you only project origins)

Two modes (lock one):
1.	Project-only origins (fast): ignore mesh geometry; treat each instance as a billboard point/sprite.
•	cache keys don’t include mesh recipe
2.	Project mesh silhouette (heavier): mesh affects 2D output (e.g., projected bounds or outline)
•	cache keys must include meshRecipeHash or mesh cache id

Given you’re on Canvas, you probably want (1) first, and later add a separate mesh-to-path pass.

3.5 Performance counters (required)

This pass is exactly where perf goes to die if you’re sloppy, so add counters to RuntimeHealthSnapshot and trace events.

Per-step counters:

export interface StepPerfCounters {
stepId: StepId;

// timing
cpuMs: number;

// throughput
instancesIn: number;
instancesOut: number;

// culling
culled: number;
clipped: number;

// memory
bytesWritten: number;
buffersReused: number;
cacheHit: boolean;

// numeric health
nanCount: number;
infCount: number;
}

Also add global rollups:
•	total projected instances
•	worst pass ms
•	bytes allocated vs reused

3.6 Determinism requirements (don’t skip)
•	Use a single numeric pipeline for projection math (float32).
•	Define clipping/culling rules exactly (near plane, behind camera, outside NDC).
•	Define how NaNs propagate (mark dead vs clamp).
•	Define sort policy if you output z (stable tie-break = element id).

⸻

How this plugs into your existing renderer plan
•	Your Canvas renderer continues to consume 2D instance buffers and/or 2D path buffers.
•	3D is “prep passes” that output those 2D buffers.
•	Later, if you add WebGL/WGPU, you keep the same IR but swap the sink.

⸻

If you want, I can now give you the exact IR table additions (new tables/refs: cameraTable, meshTable, new ValueKinds, and the schedule step shapes for MaterializeMesh + Instances3D_ProjectTo2D) in the same style as your 02-IR-Schema.md / 03-Nodes.md docs.

Patch 1 — 02-IR-Schema.md

Adds: quat, camera, 3D materialization types, CameraIR, MeshIR (extrusion-only), MeshBufferRef, Instance2DBufferRef, StepPerfCounters, and schedule semantics for MeshMaterialize + Instances3D_ProjectTo2D.

*** a/design-docs/12-Compiler-Final/02-IR-Schema.md
--- b/design-docs/12-Compiler-Final/02-IR-Schema.md
***************
*** 1,60 ****
Below is the full, long-term IR schema and the schedule semantics for Oscilla’s “compiled program as data + deterministic VM” architecture.

This is written so engineers don’t invent ad-hoc runtime behavior. If they follow this, you get: deterministic evaluation, lazy Fields, bus provenance, stable hot-swap, and a clean Rust/WASM target.

⸻

Oscilla Compiled IR Spec

Design invariants
1.	Program is data. No user-meaningful logic lives in closures.
2.	Determinism: given the same PatchRevision + Seed + TimeModel + Inputs, you get the same outputs.
3.	Lazy Fields: Fields are expressions until forced by a sink/debug/export.
4.	Stable identity: all nodes/buses/steps have stable ids for diffing, caching, and traces.
5.	Central value store: all intermediate values live in a ValueStore keyed by indices, not names.
6.	Instrumentation is structural: every runtime event corresponds to an IR step id.

⸻

1) Core type system

1.1 Type descriptors

export type TypeWorld = "signal" | "field" | "scalar" | "event" | "special";

export type TypeDomain =
| "number" | "boolean" | "string"
| "vec2" | "vec3" | "vec4"
+   | "quat"
    | "color" | "bounds"
    | "timeMs" | "phase01" | "unit01"
    | "trigger"              // discrete event-ish signal
    | "domain"               // element identity handle
    | "renderTree" | "renderCmds"
    | "mesh" | "camera" | "mat4"
    | "path" | "strokeStyle" | "filterDef"
    | "unknown";

export interface TypeDesc {
world: TypeWorld;
domain: TypeDomain;
semantics?: string;     // e.g. "point", "hsl", "linearRGB", "bpm"
unit?: string;          // e.g. "px", "deg", "ms"
}
***************
*** 60,140 ****
1.2 Value kinds in runtime

Runtime values are strongly tagged so the VM can branch cheaply.

export type ValueKind =
| { kind: "scalar"; type: TypeDesc }
| { kind: "signal"; type: TypeDesc }     // signal value at time t; represented as runtime plan
| { kind: "field"; type: TypeDesc }      // field expression handle
| { kind: "event"; type: TypeDesc }      // event stream / trigger-like
| { kind: "special"; type: TypeDesc };   // domain, render, etc
+
+ // NOTE: For "special" camera/mesh/render values, the ValueStore holds stable handles
+ // (refs) into dedicated stores/caches, not large JS objects.

***************
*** 140,240 ****
3) Program IR: top-level container

export interface CompiledProgramIR {
irVersion: number;

    // Identity / provenance
    patchId: string;
    patchRevision: number;
    compileId: string;        // unique per compile
    seed: number;
  
    // Time topology (authoritative)
    timeModel: TimeModelIR;
  
    // Tables
    types: TypeTable;
    nodes: NodeTable;
    buses: BusTable;
    lenses: LensTable;
    adapters: AdapterTable;
    fields: FieldExprTable;    // optional: may be empty until runtime builds exprs; see semantics
+
+   // 3D support (optional but first-class in IR)
+   cameras?: CameraTable;
+   meshes?: MeshTable;

    // Schedule
    schedule: ScheduleIR;

    // Outputs (render roots)
    outputs: OutputSpec[];

    // Debug + mapping
    meta: ProgramMeta;
    }
***************
*** 240,360 ****
4) Time model IR (authoritative, no “player looping” hacks)

export type TimeModelIR =
| { kind: "finite"; durationMs: number; cuePoints?: CuePointIR[] }
| { kind: "cyclic"; periodMs: number; mode: "loop" | "pingpong"; phaseDomain: "0..1" }
| { kind: "infinite"; windowMs: number; suggestedUIWindowMs?: number };

export interface CuePointIR {
id: string;
label: string;
tMs: number;
behavior?: "snap" | "event";
}

Semantics:
•	Runtime always uses monotonic tAbsMs internally.
•	timeModel defines derived time signals:
•	cyclic -> tCycleMs, phase01, wrapEvent
•	finite -> progress signal, end event
•	infinite -> windowing only for UI/sampling/export
+
+ ⸻
+
+ 4.2 Camera + projection semantics (IR-level contract)
+
+ Camera math must be deterministic and portable to Rust/WASM.
+ The runtime must compute view/proj/viewProj using float32 math and a fixed coordinate convention.
+
+ export type CameraId = string;
+ export type ProjectionKind = "perspective" | "orthographic";
+
+ export interface CameraIR {
+   id: CameraId;
+
+   // Locked conventions for parity
+   handedness: "right";
+   forwardAxis: "-Z";
+   upAxis: "+Y";
+
+   projection: {
+     kind: ProjectionKind;
+     near: number;   // > 0
+     far: number;    // > near
+     // perspective
+     fovYRad?: number;     // (0, pi)
+     // orthographic
+     orthoHeight?: number; // world units visible vertically
+   };
+
+   // Canonical camera pose
+   pose: {
+     position: { x: number; y: number; z: number };
+     orientation: { x: number; y: number; z: number; w: number }; // unit quat
+   };
+
+   ndcToScreen: {
+     origin: "center";
+     yAxis: "down";
+   };
+ }
+
+ export interface CameraEval {
+   viewMat4: Float32Array;      // 16
+   projMat4: Float32Array;      // 16
+   viewProjMat4: Float32Array;  // 16
+   viewportKey: { w: number; h: number; dpr: number };
+ }

***************
*** 360,520 ****
5) Type table

export interface TypeTable {
// Interning TypeDesc to small ints is allowed but not required in TS.
// Rust/WASM will likely intern.
typeIds: TypeDesc[];
}
+
+ ⸻
+
+ 5.1 Camera and mesh tables (optional but standardized)
+
+ export interface CameraTable {
+   cameras: CameraIR[];
+   cameraIdToIndex: Record<CameraId, number>;
+ }
+
+ export type MeshId = string;
+
+ export interface MeshTable {
+   meshes: MeshIR[];
+   meshIdToIndex: Record<MeshId, number>;
+ }
+
+ // Extrusion-only Mesh IR (no arbitrary user triangles)
+ export type ExtrudeProfile2D =
+   | { kind: "circle"; radius: number; segments: number }
+   | { kind: "ngon"; sides: number; radius: number }
+   | { kind: "polyline"; points: { x: number; y: number }[]; closed: boolean };
+
+ export type ExtrudeKind =
+   | { kind: "linear"; depth: number; cap: "both" | "front" | "back" | "none" }
+   | { kind: "rounded"; depth: number; roundSegments: number; radius: number };
+
+ export interface MeshIR {
+   id: MeshId;
+   recipe: {
+     profile: ExtrudeProfile2D;
+     extrude: ExtrudeKind;
+     bevel?: { size: number; segments: number };
+   };
+   attributes: { normals: boolean; uvs: boolean };
+   winding: "CCW";
+   indexed: true;
+   indexType: "u16" | "u32";
+ }
+
+ // Mesh materialization produces buffers (cached by recipe hash)
+ export interface MeshBufferRef {
+   positions: Float32Array; // xyz
+   normals?: Float32Array;
+   uvs?: Float32Array;
+   indices: Uint16Array | Uint32Array;
+   bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
+ }

***************
*** 520,680 ****
18) Runtime VM semantics (authoritative)

The runtime engine processes:
•	ValueStore (typed arrays for slots)
•	StateStore (typed state cells)
•	FieldStore (expr DAG + buffer cache)
•	Tracer (optional)
+ 	•	CameraStore (camera eval cache)
+ 	•	MeshStore (mesh buffer cache)
+ 	•	Instance2DStore (instance buffer cache/arena)

18.1 ValueStore contract (conceptual)
•	slot addresses are dense integers.
•	Each slot holds a tagged value:
•	scalar immediate (number/bool/etc)
•	signal plan handle (e.g. op graph or reference to node output)
•	field expr handle (ExprId)
•	buffer handle (BufferRef)
•	render tree/cmds handle

The VM must enforce:
•	single writer per slot per frame (compile-time guarantee)
•	no reads of uninitialized slots (compile-time guarantee, runtime assertion in debug builds)

***************
*** 680,820 ****
21) The schedule compiler must emit (algorithmic semantics)

Engineers often screw this up unless you pin it down.

21.1 Build a dependency graph over steps, not blocks

Nodes/buses/materializations are steps. Dependencies are:
•	Slot production → slot consumption
•	Publisher source slots → busEval
•	bus slot → consumer nodeEval inputs
•	domain slot + expr deps → materialize
•	buffers → render nodes
+ 	•	mesh recipe -> meshMaterialize -> meshBufferRef slot
+ 	•	camera id -> cameraEval -> cameraEval slot
+ 	•	domain + transforms + cameraEval -> instances3d_projected2d -> instance2d buffer slot

21.2 Phase partitioning

Partition steps into:
1.	timeDerive
2.	preBus nodeEval
3.	busEval (all buses in a stable order)
4.	postBus nodeEval
5.	materialize + render (interleaved as needed)
6.	renderAssemble
+
+ Materialize sub-phases (stable, but can be interleaved by deps):
+ 	•	cameraEval
+ 	•	meshMaterialize
+ 	•	instances3d_projected2d
+ 	•	fieldMaterialize (sinks/debug/export)

Stable ordering rules
•	buses: by busIndex (which itself is stable per busId sorting in compile)
•	nodes: topological order with explicit tie-break
•	materializations: must be scheduled immediately before first use, stable tie-break by materialization id

21.3 Cache keys and invalidation
•	Every Step has a CacheKeySpec.
•	The compile must generate a minimal deps set.
•	Runtime can use this for:
•	skip step when deps unchanged this frame
•	persist caches across hot-swap for unchanged step ids
+
+ 21.4 Standard perf counters (per-step)
+
+ export interface StepPerfCounters {
+   stepId: StepId;
+   cpuMs: number;
+   cacheHit: boolean;
+
+   // throughput / memory
+   bytesWritten: number;
+   buffersReused: number;
+
+   // instance-oriented steps
+   instancesIn?: number;
+   instancesOut?: number;
+   culled?: number;
+   clipped?: number;
+
+   // numeric health
+   nanCount: number;
+   infCount: number;
+ }
+
+ 21.5 Project-to-2D instance buffers (canonical output for Canvas sinks)
+
+ export interface Instance2DBufferRef {
+   x: Float32Array;
+   y: Float32Array;
+   s?: Float32Array;
+   rot?: Float32Array;
+
+   // Color option C: split RGBA channels
+   r: Uint8Array;
+   g: Uint8Array;
+   b: Uint8Array;
+   a: Uint8Array;
+
+   z?: Float32Array;        // optional for sorting
+   alive?: Uint8Array;      // 0/1 mask for cull
+ }

***************
*** 820,960 ****
23) Rust/WASM compatibility requirements (baked in)

To ensure you’re not designing away from Rust:
•	IR is strictly serializable (no functions)
•	All operations are referenced by opcode/kernels
•	All values use typed buffers or primitive scalars
•	No dynamic object graphs in hot loops
•	Transform chains are table-driven
•	Scheduling is explicit
+ 	•	Camera/mesh generation is table-driven, cached, and float32-deterministic


⸻

Patch 2 — 03-Nodes.md

Adds: explicit opcode + node I/O contract for the 3D→2D projection pass, plus notes on mesh materialization and camera eval being explicit steps (not hidden in renderers).

*** a/design-docs/12-Compiler-Final/03-Nodes.md
--- b/design-docs/12-Compiler-Final/03-Nodes.md
***************
*** 1,120 ****

6) Nodes: the block/operator/state/render primitives

6.1 Node table

export interface NodeTable {
nodes: NodeIR[];
nodeIdToIndex: Record<NodeId, NodeIndex>;
}

export interface NodeIR {
id: NodeId;
index: NodeIndex;

    // stable categorization for tooling
    capability: "time" | "identity" | "state" | "render" | "io" | "pure";
  
    // operation executed by the VM
    op: OpCode;
  
    // Input wiring is expressed as slots after adapter/lens resolution.
    inputs: InputPortIR[];
    outputs: OutputPortIR[];
  
    // Compile-time constants (typed)
    consts?: ConstPoolRef;
  
    // Stateful storage owned by node (if any)
    state?: StateBindingIR[];
  
    // Debug metadata hook
    meta?: NodeMeta;
}
***************
*** 120,220 ****
export interface OutputPortIR {
name: string;
type: TypeDesc;
slot: ValueSlot;      // where runtime stores this output
}

6.2 Input sources

export type InputSourceIR =
| { kind: "slot"; slot: ValueSlot }                // another output
| { kind: "bus"; busIndex: BusIndex }              // read bus value slot (resolved)
| { kind: "const"; constId: string }               // typed constant
| { kind: "defaultSource"; defaultId: DefaultSourceId }
| { kind: "external"; externalId: string };        // MIDI/OSC/etc, if present

Hard rule: by runtime execution time, every input has a fully resolved InputSourceIR. No “look it up by name”.
+
+ ⸻
+
+ 6.3 Canonical 3D preparation nodes (camera/mesh/3D->2D projection)
+
+ Principle:
+ 	•	Render sinks do not contain hidden 3D logic.
+ 	•	Camera eval, mesh materialization, and 3D->2D projection are explicit nodes/steps.
+ 	•	This keeps determinism, profiling, and Rust parity.
+
+ 6.3.1 OpCode additions
+
+ export type OpCode =
+   | { kind: "CameraEval" }                 // CameraIR -> CameraEval (matrices)
+   | { kind: "MeshMaterialize" }            // MeshIR recipe -> MeshBufferRef (cached)
+   | { kind: "Instances3D_ProjectTo2D" }    // Domain + transforms + camera -> Instance2DBufferRef
+   | /* existing opcodes */;
+
+ 6.3.2 Node contract: Instances3D_ProjectTo2D
+
+ Purpose:
+ 	Project per-element 3D transforms (and optionally mesh-aware bounds) into 2D instance buffers consumable by Canvas sinks.
+
+ Inputs (minimum):
+ 	•	domain: special/domain
+ 	•	cameraEval: special/camera
+ 	•	modelMat4: field/mat4  (or packed transform; mat4 is canonical in IR)
+ 	•	color: field/color
+ 	•	size: field/number (semantic: px or world->px lens must be explicit)
+
+ Optional inputs:
+ 	•	meshId: scalar/mesh (or field/mesh in advanced usage)
+ 	•	zSort: scalar boolean (if true, emit z and require stable sort policy downstream)
+
+ Output:
+ 	•	instances2D: special/renderCmds (preferred) or special/instances2D buffer handle
+
+ Example OutputPortIR:
+ 	{ name: "instances2D", type: { world: "special", domain: "renderCmds" }, slot: <ValueSlot> }
+
+ Determinism notes:
+ 	•	float32 math for matrix multiply and projection
+ 	•	explicit clipping policy (near/far, behind-camera)
+ 	•	stable tie-break if z-sorting is enabled (element id)
+
+ Perf notes:
+ 	•	This node MUST emit StepPerfCounters (instancesIn/out, culled/clipped, bytesWritten, cacheHit, nan/inf).


⸻

How to apply

If you want a one-liner to apply these on macOS (assuming you paste each diff into a file):

git apply 02-IR-Schema.patch
git apply 03-Nodes.patch

Or just copy/paste the added sections manually—these diffs are written to be append-only / minimal-touch.

If you paste the current tail of each file (last ~50 lines), I can tighten the insertion points so the diffs match exactly with your repo’s current text and apply cleanly on first try.