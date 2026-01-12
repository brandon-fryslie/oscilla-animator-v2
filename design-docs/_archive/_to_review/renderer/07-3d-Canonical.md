Yep. Here are the canonical additions as standalone spec fragments you can paste into new docs. No patch/diff formatting—just the authoritative content.

⸻

Canonical Additions: 3D + Projection Pass

1) Type system additions

// Add to TypeDomain
export type TypeDomain =
| "number" | "boolean" | "string"
| "vec2" | "vec3" | "vec4"
| "quat"
| "color" | "bounds"
| "timeMs" | "phase01" | "unit01"
| "trigger"
| "domain"
| "renderTree" | "renderCmds"
| "mesh" | "camera" | "mat4"
| "path" | "strokeStyle" | "filterDef"
| "unknown";


⸻

2) Camera IR

Purpose: Deterministic, portable camera definition that can be evaluated into matrices (float32) and reused across nodes/steps. This is the only camera contract the runtime supports.

export type CameraId = string;
export type ProjectionKind = "perspective" | "orthographic";

export interface CameraIR {
id: CameraId;

// Locked conventions for parity across TS and Rust/WASM
handedness: "right";
forwardAxis: "-Z";
upAxis: "+Y";

projection: {
kind: ProjectionKind;
near: number; // > 0
far: number;  // > near

    // perspective-only
    fovYRad?: number; // (0, pi)

    // orthographic-only
    orthoHeight?: number; // world-units visible vertically
};

// Canonical camera pose
pose: {
position: { x: number; y: number; z: number };
orientation: { x: number; y: number; z: number; w: number }; // unit quaternion
};

// Screen mapping convention (explicit, fixed)
ndcToScreen: {
origin: "center";
yAxis: "down";
};
}

// Evaluated camera (runtime cache product)
export interface CameraEval {
viewMat4: Float32Array;      // length 16
projMat4: Float32Array;      // length 16
viewProjMat4: Float32Array;  // length 16
viewportKey: { w: number; h: number; dpr: number };
}

export interface CameraTable {
cameras: CameraIR[];
cameraIdToIndex: Record<CameraId, number>;
}

Rules:
•	CameraEval is computed with float32 math.
•	Any “implicit camera” is forbidden; camera must be explicit in IR.
•	Viewport-dependent projection (aspect, px mapping) is encoded via viewportKey.

⸻

3) Mesh IR (extrusion-only subset)

Purpose: Enable simple 3D extrusions without admitting arbitrary triangle meshes as user-authored primitives. This keeps the system coherent, debuggable, and optimizable.

export type MeshId = string;

export type ExtrudeProfile2D =
| { kind: "circle"; radius: number; segments: number }
| { kind: "ngon"; sides: number; radius: number }
| { kind: "polyline"; points: { x: number; y: number }[]; closed: boolean };

export type ExtrudeKind =
| { kind: "linear"; depth: number; cap: "both" | "front" | "back" | "none" }
| { kind: "rounded"; depth: number; roundSegments: number; radius: number };

export interface MeshIR {
id: MeshId;

recipe: {
profile: ExtrudeProfile2D;
extrude: ExtrudeKind;
bevel?: { size: number; segments: number };
};

attributes: {
normals: boolean;
uvs: boolean;
};

winding: "CCW";
indexed: true;
indexType: "u16" | "u32";
}

export interface MeshTable {
meshes: MeshIR[];
meshIdToIndex: Record<MeshId, number>;
}

// Materialized mesh buffers (runtime cache product)
export interface MeshBufferRef {
positions: Float32Array; // xyz packed
normals?: Float32Array;  // xyz packed
uvs?: Float32Array;      // uv packed

indices: Uint16Array | Uint32Array;

bounds: {
min: { x: number; y: number; z: number };
max: { x: number; y: number; z: number };
};
}

Rules:
•	Meshes are recipes, not raw triangles.
•	Materialization is cached by a canonical recipe hash.
•	Index type defaults to u16; promotion to u32 is allowed but must be explicit.

⸻

4) Instance2D buffer contract (Canvas sink input)

Purpose: One canonical “fast path” shape for high-volume renderable instances on Canvas. This is the output of projection and the input to 2D render sinks.

Color storage: Option C (split RGBA channels).

export interface Instance2DBufferRef {
x: Float32Array;
y: Float32Array;

// Per-instance size (semantic: px unless explicitly declared otherwise)
s?: Float32Array;

// Per-instance rotation in radians (optional)
rot?: Float32Array;

// Color option C: split RGBA channels (0..255)
r: Uint8Array;
g: Uint8Array;
b: Uint8Array;
a: Uint8Array;

// Optional depth for ordering / diagnostics
z?: Float32Array;

// Optional alive mask (0/1) produced by culling steps
alive?: Uint8Array;
}

Rules:
•	Buffers may be arena-backed; reuse is expected.
•	“Alive” is canonical for culling without reallocating.

⸻

5) Standard perf counters for scheduled steps

Purpose: Debug and optimization must use the same canonical perf model.

export interface StepPerfCounters {
stepId: StepId;
cpuMs: number;
cacheHit: boolean;

bytesWritten: number;
buffersReused: number;

instancesIn?: number;
instancesOut?: number;
culled?: number;
clipped?: number;

nanCount: number;
infCount: number;
}


⸻

6) Schedule semantics additions (dependency + phase requirements)

These are required schedule dependencies and stable ordering semantics for 3D.

6.1 New dependency edges

A schedule compiler MUST include these step classes and dependencies:
•	mesh recipe -> MeshMaterialize -> meshBufferRef slot
•	camera id -> CameraEval -> cameraEval slot
•	domain + modelMat4 + cameraEval + attrs -> Instances3D_ProjectTo2D -> instance2d buffer slot
•	instance2d buffer slot -> Render2DCanvas sink

6.2 Phase partitioning constraints

materialize + render phase is refined into stable sub-phases (interleaving allowed only by deps):
1.	cameraEval
2.	meshMaterialize
3.	instances3d_projected2d
4.	fieldMaterialize (only where forced)
5.	renderAssemble

6.3 Stable ordering rules
•	When multiple camera eval steps exist: sort by cameraIndex.
•	Mesh materializations: sort by meshIndex.
•	Projection steps: topological order with stable tie-break (nodeIndex, outputPortIndex).

⸻

7) Canonical opcode + node contracts

7.1 OpCode additions

These are the only new opcodes required for this 3D slice:

export type OpCode =
| { kind: "CameraEval" }
| { kind: "MeshMaterialize" }
| { kind: "Instances3D_ProjectTo2D" }
| /* existing opcodes */;

7.2 Node contract: Instances3D_ProjectTo2D

Purpose: Convert per-element 3D transform state into a canonical 2D instance buffer.

Inputs (minimum):
•	domain: special/domain
•	cameraEval: special/camera
•	modelMat4: field/mat4 (canonical; packed TRS is allowed only if it compiles to mat4 in IR)
•	color: field/color
•	size: field/number

Optional inputs:
•	meshId: scalar/mesh (or field/mesh only if you explicitly support per-element mesh selection)
•	zSort: scalar/boolean
•	clipMode: scalar/string with allowed set: "discard" | "clamp" (default "discard")
•	cullMode: scalar/string with allowed set: "none" | "frustum" (default "frustum")
•	sizeSpace: scalar/string with allowed set: "px" | "world" (default "px")
•	worldToPx: scalar/number (required if sizeSpace==="world")
•	pivot: field/vec3 (optional; default (0,0,0) in local space)

Outputs:
•	instances2D: special/renderCmds (preferred)
•	If you keep Instance2DBufferRef as distinct from renderCmds, then output is special/instances2D—but pick one canonical representation and do not allow both at runtime.

Determinism rules:
•	All math is float32.
•	Clipping/culling policy is explicit and stable.
•	If zSort=true, the downstream sorting tie-break is element identity stable key.

Perf counters (required):
•	instancesIn
•	instancesOut
•	culled
•	clipped
•	bytesWritten
•	buffersReused
•	nanCount, infCount

7.3 Node contract: CameraEval

Inputs:
•	cameraId: scalar/camera (or const camera index)

Output:
•	cameraEval: special/camera (CameraEval handle in ValueStore)

Cache key:
•	(cameraId, viewportKey, cameraIRHash).

7.4 Node contract: MeshMaterialize

Inputs:
•	meshId: scalar/mesh (or const mesh index)

Output:
•	meshBuffer: special/mesh (MeshBufferRef handle)

Cache key:
•	(meshId, meshRecipeHash, indexType).

⸻

8) What this adds to the runtime “value store” model

The VM must include dedicated stores/caches, referenced by stable handles in ValueSlots:
•	CameraStore: cameraId -> CameraEval (viewport keyed)
•	MeshStore: meshId -> MeshBufferRef (recipe keyed)
•	Instance2DStore: arena for Instance2DBufferRef (reused per frame)

Hard rule: ValueSlots store handles/refs, not arbitrary JS objects, in hot paths.

⸻

If you want, I can also give you the canonical cache key specs as explicit typed structures (CacheKeySpecIR additions) so engineers don’t invent ad-hoc keys per step.