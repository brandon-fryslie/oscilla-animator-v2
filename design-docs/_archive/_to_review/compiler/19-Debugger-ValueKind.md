Next part: Value encoding (TypeDesc/ValueKind), and the only allowed stats/hash payloads per domain

This is the contract that prevents “someone logged a 2M-element field into the trace” and that makes JS↔Rust tracing compatible.

You will implement two parallel encodings:
	1.	Type identity encoding: TypeKeyId (stable across compiles if possible)
	2.	Value summary encoding: ValueRecord (tiny, fixed-size, ring-buffer friendly)

Full values (arrays, strings, big structs) never go into trace; they go into separate opt-in “capture buffers” if you ever add them later.

⸻

1) Type identity: TypeKeyId

1.1 Canonical type key

We unify editor TypeDesc and compiler ValueKind under one canonical key:

// Canonical shape used by debugger (and eventually IR too)
export type TypeWorld = 'scalar' | 'signal' | 'field' | 'special';
export type TypeDomain =
  | 'number' | 'boolean' | 'string'
  | 'vec2' | 'vec3' | 'vec4'
  | 'color' // canonical: linear RGBA or HSLA, but the *encoding* is stable
  | 'bounds'
  | 'phase'
  | 'timeMs'
  | 'domain'         // identity domain
  | 'renderTree'
  | 'renderNode'
  | 'program'
  | 'event'
  | 'unknown';       // should not appear after compile

export interface TypeKey {
  world: TypeWorld;
  domain: TypeDomain;
  semantics?: string;   // e.g. 'point', 'hsl', 'srgb', 'unitInterval'
  unit?: string;        // e.g. 'ms', 'px', 'deg'
}

1.2 Dense ID table

At compile time build a TypeKeyTable and assign a dense u16:

export type TypeKeyId = number; // u16 in memory, widened to number in TS

export interface DebugTypeTables {
  typeKeyToId: Map<string, TypeKeyId>; // key string = stable serialization of TypeKey
  idToTypeKey: readonly TypeKey[];
}

Stability rule: The key string MUST be produced by a canonical serializer with sorted keys and absent-default elision (so semantics?: undefined doesn’t change identity).

1.3 Mapping from your existing types
	•	Editor TypeDesc → TypeKey (world/domain/semantics/unit map directly).  ￼
	•	Compiler ValueKind → TypeKey by parsing the string prefix:
	•	Scalar:number → {world:'scalar', domain:'number'}
	•	Signal:phase → {world:'signal', domain:'phase'}
	•	Field:vec2 → {world:'field', domain:'vec2'}
	•	specials → {world:'special', domain:'renderTree' | ...}

Hard rule: debugger uses TypeKeyId only in spans, never raw strings.

⸻

2) Value summary: ValueRecord (ring-buffer safe)

2.1 Fixed payload

A ValueRecord is exactly 32 bytes (8×u32) so you can store it in a single typed array block (JS) or a packed struct (Rust).

export const enum ValueTag {
  None = 0,

  // scalar-ish
  Number = 1,
  Boolean = 2,
  SmallEnum = 3,     // phase wrap pulse, discrete modes, etc.
  Color = 4,         // packed or 4 floats summary
  Vec2 = 5,
  Vec3 = 6,
  Vec4 = 7,

  // composite summaries
  FieldStats = 20,
  SignalStats = 21,
  RenderStats = 22,

  // hash-only (when stats are too expensive)
  Hash64 = 30,
}

export interface ValueRecord32 {
  tag: ValueTag;       // u32
  typeId: TypeKeyId;   // u32
  a: u32;
  b: u32;
  c: u32;
  d: u32;
  e: u32;
  f: u32;
}

2.2 Numeric encoding conventions

We need stable float packing:
	•	Use IEEE754 float32 reinterpret into u32 for any float payload:
	•	packF32(x) and unpackF32(u)
	•	For “two floats” in one u32, do not pack half floats unless you commit to it forever. Prefer separate u32s.

⸻

3) Allowed ValueRecord shapes by TypeKey

This is the part that stops random invention.

3.1 Scalars / Signals sampled values

number / timeMs / phase

ValueTag.Number
	•	a = packF32(value)
	•	b = flags (e.g. NaN/Inf already in SpanFlags; b is optional local flags)
	•	c..f = 0

boolean

ValueTag.Boolean
	•	a = value ? 1 : 0

vec2

ValueTag.Vec2
	•	a = packF32(x)
	•	b = packF32(y)

vec3 / vec4

ValueTag.Vec3 / ValueTag.Vec4
	•	a,b,c,(d) = packed components

color (canonical internal)

Pick one canonical representation for tracing:
	•	either linear RGBA floats
	•	or premultiplied RGBA floats
	•	or HSLA floats

I recommend premultiplied linear RGBA float32 for render correctness. Whatever you choose, lock it.

ValueTag.Color
	•	a,b,c,d = packF32(r), packF32(g), packF32(b), packF32(a)

3.2 Field expressions and materialization

Fields are never “values” in the normal sense; they become:
	•	FieldStats after materialization
	•	or Hash64 if you can’t afford stats

FieldStats record (after materialize)

ValueTag.FieldStats
	•	a = domainId (dense u32)
	•	b = n element count
	•	c = statMask bitset (which stats are valid)
	•	d = packF32(min) or 0 if not applicable
	•	e = packF32(max) or 0
	•	f = hashLow32 (or 0)

You will also emit a second ValueRecord when you want a full 64-bit hash:

Hash64 record

ValueTag.Hash64
	•	a = hashLow32
	•	b = hashHigh32
	•	rest 0

StatMask bits

export const enum FieldStatMask {
  None = 0,
  HasMinMax = 1 << 0,     // numeric-like domains
  HasMeanVar = 1 << 1,    // optional
  HasNanInfCounts = 1<<2, // numeric-like
  HasColorLuma = 1 << 3,  // color
  HasVecMagnitude = 1<<4, // vec2/vec3
  HasHash64 = 1 << 5,
}

Domain-specific meaning (locked)
	•	field<number>: min/max mandatory; mean/var optional; nan/inf optional
	•	field<phase>: min/max; also optional “wrapCount estimate” if you ever add it (would be a second record, not overloaded)
	•	field<vec2>: min/max refers to magnitude unless you emit separate component stats (choose one; magnitude is simpler and stable)
	•	field<color>: min/max refers to luma (defined exactly: luma = dot(rgb, [0.2126, 0.7152, 0.0722]) in linear)

Hard rule: never interpret min/max differently per patch. It’s per domain only.

3.3 Signals (as expressions)

For SignalExpr nodes, don’t log “values” unless sampling; instead use SignalStats:

ValueTag.SignalStats
	•	a = sampleWindowMs (how big the window is, e.g. last 500ms)
	•	b = sampleCount (e.g. 32)
	•	c = statMask
	•	d = packF32(min)
	•	e = packF32(max)
	•	f = hashLow32 (hash of samples)

This is what the power user UI uses to show “this signal is chaotic / clipped / dead”.

⸻

4) Hash function (must be stable across JS/Rust)

You need one hash spec for:
	•	per-field materialization signature
	•	per-signal sample signature
	•	“value changed?” quick compare

Requirements
	•	works on bytes
	•	stable across languages
	•	fast
	•	low collision risk

Pick: xxHash64 or HighwayHash (xxHash64 is common; HighwayHash is great but more code). The key point is: specify the exact algorithm and seed.

Spec:
	•	hash64(bytes, seed=0xC0FFEE1234n) (example seed; choose one and freeze)
	•	For float arrays: hash the raw float32 byte representation
	•	For vec arrays: hash as interleaved float32 bytes

If you don’t want external deps initially, you can implement a simple 64-bit FNV-1a but I don’t recommend it long term; choose a real hash now.

⸻

5) “When do we emit ValueRecords?” (strict policy)

This keeps tracing cheap.

Always emit (cheap)
	•	TimeSignalSample → sampled scalar record
	•	PortValue for scalar/small vec/color outputs only when trace mode includes values
	•	MaterializeField → FieldStats (min/max + hashLow) always in power-user trace
	•	Violation → include the offending sample value if scalar-like

Never emit full arrays
	•	No raw field arrays in trace, ever.
	•	If you later add “capture”, it’s a separate opt-in buffer keyed by (frameId, subjectId).

Sampling policy knobs
	•	trace.values: off | scalarsOnly | scalarsAndColors | includeVecs
	•	trace.fields: off | statsOnly | statsAndHash64
	•	trace.signals: off | sampled | sampledAndStats

Default for power-user mode: scalarsAndColors + statsAndHash64 + sampledAndStats

⸻

6) How this ties into your current runtime hooks

You already emit runtime health snapshots with nanCount, infCount, and fieldMaterializations counters. That becomes:
	•	Violation spans when they occur
	•	MaterializeField spans for each materialization
	•	plus aggregated FramePost stats (optional)  ￼

⸻

If you say Next, the next part is: the exact “ValueStore / NodeStore” layout needed for fast probing (dense indices, per-frame scratch arenas, and how to attribute values to causal parents without allocations).