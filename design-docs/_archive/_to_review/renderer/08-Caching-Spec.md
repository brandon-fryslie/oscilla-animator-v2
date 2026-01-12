Below is the canonical, exhaustive Cache Spec for Oscilla’s IR + scheduled VM. This is the thing engineers follow so they don’t invent “helpful” bespoke caching rules per feature.

⸻

Oscilla Cache Spec

0) Non-negotiable invariants
    1.	Caching is step-scoped. No ad-hoc caches inside opcode implementations except via the cache APIs specified here.
    2.	Cache keys are structural. A cache hit must be explainable entirely by IR identities + declared dependencies.
    3.	Cache correctness beats cleverness. If a step cannot declare a correct key cheaply, it must be policy: "none".
    4.	Stable IDs are the bridge across hot-swap. Step-level caches may persist across program swaps only when stepId is stable.
    5.	No “hidden inputs.” If a value influences a step result, it must appear in its CacheKeySpec dependencies.

⸻

1) Concepts and terminology

1.1 Step output cache

A Step cache memoizes the outputs of one scheduled step (usually one or more ValueSlots) for a given CacheKey.

1.2 Slot fingerprint

A SlotFingerprint is a tiny, comparable summary of a ValueSlot’s current value as seen by caching.

1.3 Epoch

An Epoch is a monotonically increasing revision for a value’s semantic identity:
•	programEpoch changes when IR changes (compileId)
•	patchRevision changes when edit commit occurs
•	viewportEpoch changes when viewport/dpr changes
•	externalEpoch changes when external IO samples update

⸻

2) IR additions: cache tables and specs

2.1 Cache spec per step

export type CachePolicy = "none" | "perFrame" | "perTime" | "persistent";

export type TimeQuantization =
| { kind: "exact" }                           // tAbsMs exact identity (rare)
| { kind: "frame" }                           // same frame => same
| { kind: "ms"; quantumMs: number }           // e.g. 1ms, 4ms
| { kind: "phase"; quantum: number };         // e.g. 1/4096 in phase01 domain

export type CacheStorage =
| { kind: "localStep" }                       // stored in StepCache only
| { kind: "globalShared"; class: CacheClass } // shared across steps (mesh, camera, etc)

export type CacheClass =
| "FieldExpr"            // expression nodes (hash-consing + plan cache)
| "FieldMaterialize"     // buffers by (expr, domain, layout, tolerance)
| "MeshMaterialize"      // mesh buffers by recipe hash
| "CameraEval"           // matrices by camera + viewport
| "PathCache"            // path geometry by asset + tolerance + flattening
| "ImageAsset"           // decoded images / atlases
| "TextGlyphAtlas"       // glyph geometry / atlas
| "Instances2D"          // arena reuse; keyless but tracked
| "Instances3D"          // arena reuse; keyless but tracked
| "RenderCmds"           // command buffers by deps
| "ExportFrame"          // export pipeline frame cache
| "ExternalIO";          // OSC/MIDI/audio analysis, etc

export interface CacheKeySpecIR {
policy: CachePolicy;

// what time identity contributes (if any)
time?: {
domain: "tAbsMs" | "tCycleMs" | "phase01";
quant: TimeQuantization;
};

// compile-time structural identity dependencies
structural: {
// always included for any cacheable step:
stepId: StepId;

    // optional but common:
    opcode?: string;                // OpCode.kind (for sanity/debug)
    nodeId?: NodeId;
    busId?: BusId;
    exprId?: ExprId;
    stateId?: StateId;

    // stable hashes emitted in IR:
    programHash?: string;           // hash of whole IR (compileId ok)
    nodeShapeHash?: string;         // inputs/outputs/types/op params
    kernelHash?: string;            // implementation version id for opcode
};

// runtime dependencies (ValueSlots and epochs)
deps: {
slots?: ValueSlot[];            // these slots contribute fingerprints
epochs?: ("viewport" | "external" | "assets")[];
};

// for caches that depend on domain/layout/materialization
materialization?: {
domainSlot?: ValueSlot;         // Domain handle slot
layout?: BufferLayoutIR;        // SoA/AoS, stride, etc
tolerance?: { kind: "none" } | { kind: "path"; px: number };
flattening?: { enabled: boolean; tolerancePx?: number };
};

// how results are stored
storage: CacheStorage;

// optional: allow runtime to drop caches aggressively
costHint?: {
estBytesWritten?: number;
estOps?: number;
hot?: boolean;
};
}

export interface ScheduleStepIR {
id: StepId;
kind: "nodeEval" | "busEval" | "timeDerive" | "transform" | "materialize" | "render" | "external";
reads: ValueSlot[];
writes: ValueSlot[];
cache: CacheKeySpecIR;  // REQUIRED, even if policy "none"
meta?: { label?: string };
}

2.2 Buffer layout IR (minimal but canonical)

export type BufferLayoutIR =
| { kind: "soa"; fields: string[] }                 // x[],y[],r[],g[]...
| { kind: "aos"; strideBytes: number; schemaId: string };


⸻

3) Runtime: canonical key construction

3.1 Hash requirements
•	Keys MUST be computable as u64 (or two u64s) in Rust/WASM.
•	In TS, you may store as {hi:u32, lo:u32} or bigint (but avoid bigint in hot paths; use two u32).

3.2 CacheKey format

export interface CacheKey {
// Structural identity
stepId: StepId;

// Combined 64-bit hash:
h0: number; // u32
h1: number; // u32

// Time component (if any)
tTag?: number; // u32 packed quantized time id

// Optional: debug breakdown
debug?: CacheKeyDebug;
}

export interface CacheKeyDebug {
policy: CachePolicy;
structuralParts: string[];
depSlots: ValueSlot[];
epochs: string[];
timeDesc?: string;
}

3.3 Canonical hashing algorithm (normative)

Use a stable non-crypto hash (xxHash64 or wyhash). In TS, you can emulate with a fast 32-bit mix and pair, but the layout must match what Rust uses.

Key composition order (exact):
1.	mix(stepId)
2.	mix(structural.programHash | compileId) if present
3.	mix(structural.nodeShapeHash) if present
4.	mix(structural.kernelHash) if present
5.	mix(structural.opcode) if present
6.	mix(timeTag) if present
7.	For each dep slot in deps.slots (sorted ascending): mix(slotFingerprint(slot))
8.	For each epoch in deps.epochs (sorted by fixed order viewport, external, assets): mix(epochValue)

Sorting rules are part of determinism.

⸻

4) SlotFingerprint: exhaustive rules by ValueKind

The VM must compute a fingerprint for any ValueSlot that appears in deps.slots.

4.1 Fingerprint type

export interface SlotFingerprint {
kindTag: number;  // small int for ValueKind
a: number;        // u32
b: number;        // u32
}

4.2 Rules (normative)

Scalar (number/boolean/etc)
•	kindTag = SCALAR
•	a,b = float32Bits(value) for number (or canonical int/bool encoding)
•	For NaN: use a single canonical NaN bit pattern (to avoid platform differences).

Signal plan handle (SignalExpr / plan)
•	Signals in ValueStore are handles, not closures.
•	Fingerprint is:
•	kindTag = SIGNAL
•	a,b = hash64(signalPlanId + signalPlanShapeHash + kernelHash?)
•	Never fingerprint by sampling at time. That makes caching circular and slow.

Field expr handle (FieldExpr)
•	kindTag = FIELD
•	a,b = hash64(exprId)
•	If the FieldExpr depends on compile-time constants, exprId already encodes it via hash-consing.

Event stream handle
•	kindTag = EVENT
•	Fingerprint is:
•	a,b = hash64(eventStreamId + upstreamStepId + windowQuant?)
•	Events are usually per-frame; most event steps should be perFrame.

Special handles (Domain, CameraEval, MeshBufferRef, RenderCmds, BufferRef)
•	kindTag = SPECIAL
•	Fingerprint uses the stable handle id + a content hash if the handle represents materialized data
•	Domain: domainId + domainRevision
•	MeshBufferRef: meshId + recipeHash + indexType
•	CameraEval: cameraId + viewportKey + cameraHash
•	BufferRef: bufferId + bufferRevision

Hard rule: materialized buffer handles must carry a revision/hash field that changes when their content changes, otherwise caching becomes unsound.

⸻

5) Cache policies: meaning and when to use

5.1 policy: "none"
•	Always execute.
•	Used for:
•	steps with side effects (external IO capture)
•	steps whose key would require heavy hashing each frame
•	steps that are trivial compared to hashing overhead

5.2 policy: "perFrame"
•	Key includes frameId implicitly (or time quant = frame).
•	Used for:
•	render command assembly
•	projection passes
•	anything depending on real time in a non-quantized way
•	Allows reuse within frame if step is triggered twice (should not happen but safe).

5.3 policy: "perTime"
•	Key includes quantized timeTag.
•	Used for:
•	deterministic sampling steps with quantizable time
•	“phase-quantized” evaluations (common for cyclic visuals)

5.4 policy: "persistent"
•	Key excludes time (or uses coarse time) and is safe across frames and hot swaps.
•	Used for:
•	mesh materialization
•	camera evaluation (viewport dependent)
•	path flattening
•	glyph atlas generation
•	field expr hash-consing

⸻

6) Canonical cache classes (shared caches)

These are globally shared caches referenced by storage: {kind:"globalShared"}.

6.1 FieldExprCache (hash-consing)
•	Key: exprStructuralHash64
•	Value: canonical ExprId + pointer to node in FieldExpr DAG store
•	Policy: persistent

6.2 FieldMaterializationCache
•	Key: (exprId, domainId, layout, tolerance, flattening, seed?, viewport?)
•	Value: BufferRef (SoA buffers)
•	Policy: perTime or perFrame depending on inputs; but storage is persistent and entries carry epoch tags.

Rule: Domain must contribute a stable domainRevision so the same domain identity + same layout can hit.

6.3 MeshMaterializeCache
•	Key: (meshRecipeHash, indexType)
•	Value: MeshBufferRef
•	Policy: persistent

6.4 CameraEvalCache
•	Key: (cameraHash, viewportKey)
•	Value: CameraEval
•	Policy: persistent with viewport epoch

6.5 PathCache
•	Key: (assetId, assetRevision, flatteningTolerancePx, canonicalToleranceEnabled, defaultTolerancePx)
•	Value: Path buffers + optional flattened variant
•	Policy: persistent

6.6 Instances arenas (2D/3D)

These are not memoization caches; they are reuse pools.
•	Key: none; allocation is “best fit” reused buffer
•	Perf counters must record reuse.

6.7 RenderCmds cache (optional but allowed)
•	Key: depends on whether command generation is heavy; if cached, must be perFrame.
•	Values: command buffers (u16/u32 command stream + payload buffers)

⸻

7) Required cache specs per step kind (exhaustive)

This section removes discretion. If an engineer adds a new step kind, they must provide a cache spec conforming to these patterns.

7.1 timeDerive
•	Default: policy: perFrame
•	deps:
•	epochs: none
•	slots: typically none (derived from runtime time + timeModel)
•	time:
•	domain: tAbsMs or phase01 depending on output slots
•	quant: {kind:"frame"}

Rationale: time derivation is cheap; caching mainly prevents redundant recalculation inside a frame.

7.2 busEval
•	Default: policy: perFrame for signals, persistent for pure structural field expressions
•	structural:
•	busId
•	nodeShapeHash for bus combine mode + default + ordering
•	deps:
•	slots: publisher source slots (already adapter-resolved slots)
•	epochs: none
•	time:
•	if bus produces signal plan handles: no time tag needed (plans are structural)
•	if bus produces sampled scalars (should be rare): perTime with quant

Important: A bus combine that outputs a FieldExpr should be persistent keyed only by publisher exprIds + combine mode. It should not re-run per frame.

7.3 nodeEval

Split by capability:

pure / identity / io / state / render is irrelevant; what matters is ValueKind produced.
•	If outputs are scalars sampled at time: perTime (with quant) or perFrame if not quantizable
•	If outputs are SignalExpr handles: persistent (structural only)
•	If outputs are FieldExpr handles: persistent
•	If outputs are materialized buffers/render cmds: perFrame

Deps always include input slots (post transform resolution) and relevant epochs.

7.4 transform

Transforms are the adapter/lens chain application steps. They MUST follow:
•	Scalar -> scalar: perTime/perFrame depending on time dependency
•	Signal -> SignalExpr: persistent
•	Field -> FieldExpr: persistent
•	Field reduce -> SignalExpr: perTime/perFrame (and must be explicitly allowed)

structural includes:
•	transformChain hash
•	kernelHash for transform implementations

7.5 materialize

Materialization MUST be cached, always. Policy depends on time dependency of the underlying expr.
•	structural:
•	exprId
•	layout
•	tolerance/flattening config
•	deps:
•	domainSlot fingerprint (domainId+rev)
•	epochs: viewport if pixel-space involved; assets if geometry depends on assets
•	storage:
•	globalShared FieldMaterialize

7.6 render

Render is split into:
•	geometry prep (instances projection etc)
•	render cmds assembly

Both default to perFrame.

Projection steps (Instances3D_ProjectTo2D) must include:
•	deps: cameraEval slot, modelMat4 exprId/slot, domainSlot, size/color exprId/slots
•	epochs: viewport
•	perf counters: instancesIn/out, culled, clipped, buffersReused

7.7 external
•	Default: none
•	If it produces a stable sampled buffer with an explicit externalEpoch, it may be perFrame keyed by that epoch.

⸻

8) Epochs and what increments them

These are required runtime counters.

export interface RuntimeEpochs {
viewport: number;   // changes on resize/dpr change
assets: number;     // changes when assets reload/alter
external: number;   // changes when OSC/MIDI/audio analysis updates
program: number;    // increments on program swap (compileId)
}

Rules:
•	viewportEpoch++ on any change to {w,h,dpr}.
•	assetsEpoch++ when any referenced asset revision changes.
•	externalEpoch++ at the boundary of an external input sampling tick.

⸻

9) Cache persistence across hot-swap

A cached entry may be reused across program swap iff:
1.	Cache policy is persistent or perTime and the quantized timeTag matches
2.	stepId matches (stable)
3.	All structural hashes referenced in the key spec match (nodeShapeHash, kernelHash, etc.)
4.	All dep slot fingerprints match (they will if the upstream stable steps also persisted)

State continuity is separate from cache continuity; caches do not “own” state.

⸻

10) Memory management and eviction (canonical)

10.1 Cache budgets

Runtime must configure budgets per cache class:

export interface CacheBudgets {
FieldMaterializeBytes: number;  // e.g. 256MB desktop
MeshMaterializeBytes: number;   // e.g. 128MB
PathCacheBytes: number;         // e.g. 128MB
RenderCmdsBytes: number;        // e.g. 64MB
CameraEvalCount: number;        // e.g. 64
}

10.2 Eviction policy
•	FieldMaterialize/Path/Mesh: LRU by lastUsedFrameId
•	RenderCmds: drop aggressively (LRU + small cap)
•	CameraEval: tiny map, LRU by lastUsedFrameId

10.3 Pinning rules
•	Entries referenced by the current frame’s schedule may not be evicted mid-frame.
•	Export pipeline may request pinning for a sequence of frames (export-specific scope).

⸻

11) Diagnostics requirements (power-user debugger hooks)

Every cacheable step must emit:
•	cacheHit: boolean
•	cacheKey.h0/h1 (or a readable key id)
•	bytesWritten
•	buffersReused
•	and (if miss) a MissReasonCode:

export type MissReasonCode =
| "NoCachePolicy"
| "KeyChanged_Structural"
| "KeyChanged_Time"
| "KeyChanged_DepSlot"
| "KeyChanged_Epoch"
| "Evicted"
| "DisabledByDebug";

This is mandatory for “no ghost hunting”.

⸻

12) Minimal canonical helper algorithms

12.1 Quantized timeTag computation
•	For ms quantum: tTag = floor(tMs / quantumMs)
•	For phase quantum: tTag = floor(phase01 * quantum) with phase clamped [0,1)

All computed in float32 where applicable.

12.2 Dep slot list

deps.slots in CacheKeySpec must be sorted at compile time. Runtime must not sort in hot paths.

⸻

13) “Exhaustive” mapping: what must be cached vs must not

Must be cached (always):
•	FieldExpr hash-consing (ExprId canonicalization)
•	Field materialization buffers
•	Mesh materialization
•	Camera evaluation
•	Path flattening / geometry decode
•	Glyph atlas generation (if/when text exists)

Must not be cached (default):
•	External IO sampling steps (unless keyed by externalEpoch)
•	Anything with side effects
•	Steps that output raw JS objects (shouldn’t exist in the final architecture)

May be cached (optional):
•	RenderCmds assembly (perFrame)
•	Projection outputs (perFrame) if reused within frame by multiple sinks

⸻

If you want, I can also provide the canonical list of CacheKeySpec templates that your schedule compiler uses (like cacheSpecForNodeEval(outputsKinds, inputs, timeModel)), but the above is already sufficient to prevent “random cache logic” from creeping in.