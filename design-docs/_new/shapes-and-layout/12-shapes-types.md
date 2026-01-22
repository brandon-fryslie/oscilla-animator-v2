Deal. Here’s the “real” type story for an arbitrary drawable (paths/lines/curves/polygons) that can flow through your node graph, be modulatable in the middle, and be renderable at the end—without any “temporary JS object” representation.

I’m going to define:
1.	Compile-time types (what ports carry, how unification works)
2.	Runtime value layout for shape2d (packed, slot-addressed, no strings)
3.	How “modulatable geometry” is typed (control points as a first-class Field<vec2> and how it relates to a shape)
4.	Combine / default-source rules for shape2d so the graph remains total and predictable

Everything below is written to slot into the system you already have: PayloadType, SignalType, Extent, Cardinality, Temporality, FieldSlot, ScalarSlot, Schedule steps, and your PathTopologyDef registry.

⸻

1) Compile-time types: introduce shape2d as a first-class PayloadType

A. PayloadType

Add a payload type whose semantic meaning is “a draw-capable 2D shape handle,” not a geometry blob.

type PayloadType =
| 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit'
| 'shape2d';

B. SignalType / Extent

No special cases: shape2d uses the same SignalType and Extent machinery.
•	Signal<shape2d> means “one shape value per tick”
•	Field<shape2d> means “one shape value per instance lane per tick” (you can support this from day one even if your first blocks only output Signal<shape2d>)

const shape2dSignal = signalType('shape2d');          // cardinality one, continuous
const shape2dField  = signalTypeField('shape2d', 'instance'); // cardinality many(instance), continuous

C. CombineMode constraints (important)

A shape2d input cannot have numeric combine semantics. If multiple writers exist, you want deterministic selection or layering, not sum/avg.

Enforce at type-check time:
•	Allowed: last, first, layer
•	Disallowed: sum, avg, mul, min, max, and, or

This becomes part of your port schema validation:

function isCombineAllowed(payload: PayloadType, mode: CombineMode): boolean {
if (payload === 'shape2d') return mode === 'last' || mode === 'first' || mode === 'layer';
// existing rules...
}

This matters because it guarantees that a shape2d wire is always well-defined, even with multiple writers.

⸻

2) Runtime value layout: shape2d is a packed, fixed-width struct stored in scalar slots

Your renderer wants “topology + control points + style-ish fields.” The correct runtime representation is a fixed-width record stored in a dedicated typed array bank, referenced by a normal ScalarSlot index.

A. Define a topology id type

Use a numeric TopologyId at runtime (string ids stay compile-time/editor-time).

type TopologyId = number; // u32-ish

Your registry maps editor ids → numeric ids during compilation (or during topology registration).

B. Define the packed Shape2D record

This is the runtime “shape handle” that moves through slots.

// 8 x u32 words per shape value (fixed width, extensible)
const SHAPE2D_WORDS = 8;

enum Shape2DWord {
TopologyId = 0,        // numeric id (dispatch key)
PointsFieldSlot = 1,   // FieldSlot id containing control points (vec2)
PointsCount = 2,       // number of vec2 points expected (validation / fast path)
StyleRef = 3,          // optional: scalar slot or style table id (0 means default)
Flags = 4,             // bitfield: fill/stroke, fillRule, closed, etc.
Reserved0 = 5,
Reserved1 = 6,
Reserved2 = 7,
}

// Stored in a dedicated bank, not Float32 scalars:
type Shape2DBank = Uint32Array; // length = numShapeSlots * SHAPE2D_WORDS

Why this layout is “the real solution”:
•	Fixed-width → slot allocation is trivial and deterministic.
•	Pure numeric → no runtime string lookups, no JS object churn.
•	Extensible → later you can add stroke styles, clipping, text, etc. by expanding meaning of StyleRef or using reserved words.

C. Slot typing: add shape2d scalar storage kind

You need slot meta to know that a given scalar slot index refers into the shape bank, not Float32 scalars.

At compile-time:

type ScalarStorageKind = 'f32' | 'i32' | 'shape2d';

interface ScalarSlotDecl {
slot: number;
storage: ScalarStorageKind;
offset: number; // offset into the corresponding bank
}

At runtime, RuntimeState has banks:

interface RuntimeState {
scalarsF32: Float32Array;
scalarsI32: Int32Array;
scalarsShape2D: Uint32Array; // packed shape bank
fieldsF32: Map<number, Float32Array>; // or arena later
fieldsI32: Map<number, Int32Array>;
fieldsVec2: Map<number, Float32Array>; // packed x,y
// ...
}

If you already have a single scalars: Float32Array, this is the point where you make storage explicit and aligned with your invariant I8 (slot addressed, no string lookups). This is not a “rip it out later” design; it’s the end state.

⸻

3) Modulatable geometry: control points are just Field<vec2> and are referenced by the shape handle

Your ProceduralPolygon block is already producing the right modulatable object: computedPositions is a Field<vec2> over an instance sized to the point count.

The only rule you need in types is:

A shape2d value may reference exactly one control-point field slot, whose payload is vec2 and whose lane count equals PointsCount.

A. Type-level contract (compile-time)

Define the concept:
•	shape2d is a scalar-like payload, but it carries a reference to a FieldSlot<vec2> used as geometry.

This doesn’t require dependent typing; it requires compile-time validation rules when constructing shape2d values:

// Pseudocode for compiler validation when creating a shape2d value:
assert(fieldSlot.payload === 'vec2');
assert(fieldSlot.laneCount === pointsCount); // from instance decl, known at compile-time

B. Runtime contract (validation / diagnostics)

At runtime, during render pass assembly (not per particle), validate:
•	pointsFieldSlot exists
•	pointsCount matches actual buffer length / stride

If mismatch: throw or emit a diagnostic and substitute a safe default.

C. Why this makes modulation natural

All of your “interesting mid-graph modulation” for arbitrary paths becomes:
•	blocks that take Field<vec2> and return Field<vec2>
•	blocks that take Signal<float> and modulate those Field<vec2> ops (warp amount, twist, noise phase, smoothing strength, etc.)

Then you repack the modified points into a shape2d handle by emitting a new packed record that references the new points field slot.

Type-wise: everything stays within your existing system of Signal and Field, with shape2d acting as a handle tying “drawability” to a particular geometry field.

⸻

4) Path topology typing: keep topology out of the value system

Topology is not a signal. It should not be wireable or modulatable continuously. It is:
•	compile-time/editor-time identifier
•	resolved to a numeric TopologyId at compile time
•	used for rendering dispatch and point-arity checks

So the correct type split is:
•	shape2d runtime value holds TopologyId (u32)
•	the topology definition lives in a registry indexed by TopologyId
•	that registry is not part of the slot/value type system

This matches what you already have: PathTopologyDef and registerDynamicTopology(topology).

Type-wise, you do not add a topology payload type.

⸻

5) Default sources and totality for shape2d

Because of your invariant “every input has exactly one source,” shape2d must have a default source too.

Pick a canonical “fallback shape2d”:
•	e.g., triangle or unit segment, with a small fixed topology and a small fixed control-point instance.

Type system enforcement:
•	Any input port of payload shape2d must have default source that produces a shape2d value (packed) and an associated control-point field slot.

This ensures the graph is total and the renderer never sees “missing shape.”

⸻

6) Minimal type additions that your current Polygon block needs to align with the above

Your block currently does:

const shapeRefSig = ctx.b.sigShapeRef(topology.id, [], signalType('shape'), computedPositions);

In the “real” type system:
•	signalType('shape') becomes signalType('shape2d')
•	sigShapeRef(...) must allocate/write into the shape2d scalar bank using the packed layout and must record:
•	TopologyId (numeric)
•	PointsFieldSlot (the slot allocated for computedPositions)
•	PointsCount (sides)
•	flags (closed/fillRule)

So sigShapeRef is not “return a JS object.” It is “return a ScalarSlot whose storage kind is shape2d and whose value is written into the packed bank.”

That’s the type-level target.

⸻

7) What this buys you immediately

With just the type + runtime layout above, you can represent from day one:
•	any polygon (MOVE/LINE/CLOSE)
•	any polyline (MOVE/LINE/LINE/…)
•	any quadratic/cubic curve path (QUAD/CUBIC verbs)
•	multiple subpaths (multiple MOVE segments)
•	“bucket of strokes” either as:
•	Field<shape2d> (per instance different shapes), or
•	multiple render passes (later), without changing the core type

And the modulatable parts are always expressible as Field<vec2> transforms, which is exactly what your system is good at.

That is the type foundation you actually want.