They ripple into 7 other parts of the architecture. None are optional if you want this to stay deterministic, fast, and Rust/WASM-portable.

1) Type system semantics

You need a hard split between:
•	authoring types (what blocks/lenses operate on: field<color>, signal<color>, etc.)
•	storage/transport encodings (what caches/renderer/export actually store: linear_premul_rgba8, u16 opcodes, etc.)

So TypeDesc stays “semantic”, and you introduce BufferDesc as “physical”. This prevents “phase is just a number” style confusion from leaking into render storage.

2) Materialization boundary becomes a first-class scheduled step

Color quantization + (optional) flattening must not happen “inside the renderer” or “inside a block closure”.
They become explicit Materialize steps in ScheduleIR, because:
•	they are expensive
•	they must be cacheable
•	the debugger must attribute them (“why did we allocate 3MB this frame?”)

3) Cache model and cache keys

All three decisions add fields that must be part of cache keys, or you’ll get wrong reuse:
•	Color cache key includes encoding=linear_premul_rgba8
•	Path cache key includes opcodeWidth=16, endianness=LE
•	Path cache key includes flattenPolicy (+ any view parameters if tolerance is pixel-based)

This impacts:
•	CacheKeySpec schema in IR
•	runtime cache map keys
•	hot-swap continuity rules (same ExprId + same policy ⇒ reuse)

4) Debugger instrumentation + “reason” attribution

Power-user debugger needs to see:
•	when a color buffer is quantized (and from what upstream value)
•	when a path is flattened (and why: UI toggle, export, renderer requirement)
•	sizes of produced buffers (bytes), and cache hit/miss

So your trace events need stable IDs for:
•	MaterializeColor
•	MaterializePath
•	FlattenPath (if you represent it as a sub-step)
and attach policy/encoding fields.

5) Export pipeline semantics

SVG/video/LED export cannot “guess”:
•	whether color is linear/premul
•	whether paths are flattened
•	command stream width

Exports become consumers of the same caches:
•	SVG export likely wants non-flattened curves (or a different canonical flatten), so this forces you to define export’s policy explicitly (not “whatever renderer did”).
•	LED export wants per-channel mapping and possibly gamma; that becomes an explicit OutputAdapter stage, not a renderer hack.

This impacts IR: add OutputSpec fields that can request:
•	color encoding conversion
•	path flatten policy for export

6) Runtime memory layout + perf-critical data structures

Once colors are u8x4 and commands are u16, your runtime should stop allocating generic JS objects in hot loops.
You’ll want:
•	arena / pool for typed arrays (or at least reuse)
•	explicit “buffer lifetime” conventions (per-frame scratch vs persistent cache)
•	tight “struct-of-arrays” layout for instances

This impacts the VM/runtime module boundaries, not just IR.

7) Rust/WASM compatibility contract

These choices force you to lock:
•	endianness
•	numeric ranges and saturation rules (color quantize)
•	float→int rounding behavior
•	canonical flatten tolerance and algorithm (even just “must be this polyline flatten kernel”)

If TS and Rust differ here, your “program as data” promise collapses. So you need a Kernel Spec section:
•	QuantizeColorKernel
•	FlattenPathKernel
•	DecodeCommandStreamKernel (or equivalent)
with deterministic rules.

⸻

The big meta-impact

These decisions move authority out of “renderer implementation details” and into:
•	IR schema
•	schedule steps
•	cache keys
•	kernel specs

That’s the difference between a toy renderer and a renderer that can scale, be debugged, and be ported.

If you tell me where you currently define Field materialization and RenderTree/RenderCmds in your IR docs, I can point to the exact places these additions should land (without rewriting everything).