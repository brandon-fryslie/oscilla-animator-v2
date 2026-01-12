Good — these choices mostly tighten the IR rather than expand it. Concretely, they land in three places in the architecture:
1.	type/shape of renderer buffers in the IR (authoritative)
2.	cache-key semantics (so flattening + encoding are deterministic)
3.	runtime codecs (so TS now + Rust/WASM later do the exact same thing)

Below is exactly how I’d encode each decision into the IR + runtime contracts you already have open.

⸻

1) Color storage = u8x4 (channels explicit)

What changes in the IR

Right now your IR spec is generic about “buffers/slots”. You need one explicit buffer layout descriptor for any output that is “renderable instances”.

Add these IR-level concepts (names are up to you, but the fields are not):

A. A canonical color buffer type
•	TypeDesc stays as-is (field/color etc).
•	But any materialized render cache that carries color must declare:

type ColorEncoding = "linear_premul_rgba8"; // canonical and only accepted render encoding

interface ColorBufferDesc {
kind: "u8x4";
encoding: ColorEncoding;          // must be linear premul
channelOrder: "RGBA";             // fixed
strideBytes: 4;                   // fixed
}

This is not “extra metadata”. This is the contract that prevents “random engineers inventing stuff”.

B. Instance cache schema must reference it

Wherever your renderer IR defines “instance buffers” (you hinted at instance buffers + path buffers), the instance schema must say:
•	pos: f32x2
•	scale/radius: f32
•	rot: f32 (or optional)
•	color: ColorBufferDesc (u8x4)

So the renderer never has to guess what color is.

C. Transform/lens boundary

You will still do math in float. That’s fine. The rule is:
•	Patch-level color values (signals/fields) can be float-like semantics.
•	Materialization step quantizes into linear_premul_rgba8 deterministically.

This belongs in your materialization step semantics: the quantizer is a kernel, and it’s part of the schedule (not a hidden “renderer thing”).

Why this is “LED-safe”

LED pipelines tend to want per-channel control and nonstandard channel order. Your IR is still safe because:
•	your internal canonical encoding is fixed (RGBA, linear premul),
•	any LED output is an export/output adapter that maps RGBA → whatever hardware wants.

That preserves determinism and keeps the renderer contract simple.

⸻

2) Path commands = u16

What changes in the IR

In the path buffer schema, you need to lock command element width:

interface PathCommandStreamDesc {
opcodeWidth: 16;            // fixed (u16)
endianness: "LE";           // fixed (important for Rust/WASM + serialization)
}

And your path cache resource should include:
•	commands: Uint16Array
•	points: Float32Array (or f32x2 stream)
•	pointArity rules per opcode (part of the path opcode table)

Architectural implication

This is exactly what makes “compiled program as data” portable:
•	TS runtime can read Uint16Array.
•	Rust/WASM runtime reads the same stream.
•	No ambiguous “bytecode interpretation” differences.

⸻

3) Flattening = optional per PathCache, default off, canonical tolerance

What changes in the IR

This one is 90% about cache keys and making the tolerance non-negotiable.

Add a policy object that becomes part of the path materialization request:

type FlattenPolicy =
| { kind: "off" }
| { kind: "on"; tolerancePx: number }; // must equal CANONICAL_FLATTEN_TOL_PX

And add a global constant:

const CANONICAL_FLATTEN_TOL_PX = 0.75; // example; pick once and freeze

Then: enforce that tolerancePx is either absent (off) or exactly the canonical constant. No other values permitted unless you explicitly add a new canonical mode later.

Where it lives

Flattening is not a node. It is not a random helper. It is:
•	a materialization parameter for PathCache
•	included in the materialization step’s CacheKeySpec

So the exact same path expr produces distinct cached buffers depending on flatten mode.

Cache key impact

Materialization cache key must include:
•	ExprId (the source geometry expression)
•	FlattenPolicy (off vs on-canonical)
•	viewport/DPR if tolerance is pixel-based (depends on your policy)

You said “canonical tolerance in pixels” — if it’s screen pixels, then the key must include dpr and maybe scale context. If you want cache stability across zoom, make tolerance in world units instead. Pick one and lock it.

Given your earlier “Canvas” focus: I’d do pixel-based, but then it’s explicitly view-dependent. That’s okay as long as you admit it in the cache key.

⸻

Where to encode these in your existing open docs

You already have:
•	TypeDesc and ValueKind in 02-IR-Schema.md
•	Node input/output slots and “ValueSlot” in 03-Nodes.md
•	Schedule semantics and materialization concepts in 02-IR-Schema.md (section 21/18ish)

To make these decisions “real”, you add one new IR section (or expand your renderer section if it exists elsewhere) defining:
1.	RenderCache schemas (InstanceCache2D, PathCache2D)
2.	Buffer descriptors (including ColorBufferDesc, PathCommandStreamDesc)
3.	Materialization parameters (including FlattenPolicy)
4.	Cache key fields (must include encoding/policy)

Nothing else needs to change conceptually; you’re just removing ambiguity and making the VM/renderer boundary table-driven and serializable.

⸻

Runtime responsibilities that fall out of this

These decisions force a clean separation:

VM / Materializer responsibilities
•	Evaluate FieldExpr / geometry exprs
•	Quantize colors → u8x4 in canonical encoding
•	Optionally flatten paths using canonical tolerance (if enabled)
•	Produce cached typed arrays (instance buffers, command streams)

Renderer responsibilities (Canvas2D)
•	Consume typed arrays and draw.
•	No color math, no curve math, no policy decisions.
•	It can be “dumb fast”.

That’s exactly what you want for performance + debuggability + Rust/WASM.

⸻

If you want, paste (or point me at) the section where you currently define “renderer IR / render passes” in your compiler-final docs, and I’ll tell you the minimum exact edits (field additions only) to make these contracts enforced everywhere.