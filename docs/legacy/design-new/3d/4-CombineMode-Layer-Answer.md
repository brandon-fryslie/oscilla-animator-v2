Assistant: I’d make layer illegal for shape2d in v1, and I’d do it for a precise architectural reason: CombineMode is a conflict-resolution rule inside a single value slot; “layer” is an operation that necessarily produces more than one drawable or a new compound drawable. Those are different features with different storage and scheduling implications, so conflating them will rot the system.

Canonical rule

CombineMode never changes the payload type or cardinality of the port.
It only selects or combines values within the existing representation.
	•	For numeric payloads, add/mul/min/max etc can stay within the same scalar/vec representation, so they’re valid.
	•	For handle-ish payloads (shape2d, image, text, etc.), the only unambiguous combine semantics are selection:
	•	last: last writer wins
	•	first: first writer wins
	•	Everything else is either meaningless or implies allocating/creating new objects/records.

So: shape2d supports only {first,last}.

Why “layer” doesn’t belong here

“Layer” has to mean one of:
	1.	Multiple drawables (render both) → requires a list or multi-slot representation, and usually per-instance variability, ordering, and style scoping.
	2.	New compound drawable (merge into one path) → requires compiler-time topology synthesis (or runtime path building), and also a styling model (fill rules, stroke joins, per-subpath style).
	3.	Multiple passes → still requires representing multiple shapes to pass down, and creates scheduling concerns (sorting, batching, depth, material separation).

All three are valid features, but they are not “combine two values into one value of the same type” in a crisp way.

What to do instead (clean, future-proof)

Introduce an explicit Composite Shape concept as its own payload/structure, not as CombineMode.

Two good options, both explicit:

Option 1: shapeList2d payload (preferred if you want true layering)
	•	New payload type: shapeList2d
	•	Representation: a handle to a render-assembly-owned compact list (not a scalar slot record).
	•	A dedicated ShapeLayer block (or ShapeStack) takes shape2d inputs and produces shapeList2d.
	•	RenderAssembler expands shapeList2d into one or more render items (or one render item with internal list) with defined ordering.

This keeps “multiple shapes” explicit in the graph and keeps CombineMode honest.

Option 2: compoundPath2d payload (preferred if you only care about geometry union/concatenation)
	•	New payload type: compoundPath2d or just a path2d that supports multiple subpaths internally.
	•	A dedicated PathCompose block merges path sources into a single path object.
	•	Styling rules are explicit: either “single style for entire compound” or “subpath carries style,” but you pick one and encode it.

Again: explicit, not a side-effect of multiple writers.

Spec-level change you should make
	•	Update the CombineMode restrictions table:
	•	shape2d: allowed modes = {first,last} only.
	•	Remove layer from shape2d.
	•	Add a sentence near CombineMode definition:
	•	“CombineMode must not introduce allocation, change payload type, or increase representational cardinality; it is strictly an intra-slot conflict resolver.”

If you absolutely insist on keeping layer on shape2d

Then define it as a compile-time error in v1 with a reserved keyword:
	•	You can keep the word “layer” in UI as a disabled choice with tooltip “requires shapeList2d.”
	•	Compiler diagnostic: “CombineMode=layer on shape2d requires ShapeStack; insert adapter/block.”

That gives you forward compatibility without lying about semantics.

My take is: remove layer for shape2d now, and add an explicit ShapeStack → shapeList2d feature later when you’re ready to pay the representation/scheduling cost.

User: I never added layer on shape, that was from a spec you generated

Assistant: Yep — that’s on me. The earlier spec was internally inconsistent: it allowed layer for shape2d without also specifying a representation that can hold “more than one shape,” or a compiler transformation that deterministically composes them into one shape.

The concrete fix is:
	•	Amend the spec: shape2d allowed CombineModes = {first, last} only.
	•	Define the invariants explicitly:
	•	CombineMode must not change payload type.
	•	CombineMode must not increase representational cardinality (a scalar slot stays a scalar slot).
	•	CombineMode must not require allocating composite objects or synthesizing new topology.

If you want “layering shapes,” it becomes a separate explicit feature with its own payload and block:
	•	Add shapeList2d + ShapeStack (explicit multi-shape) or
	•	Add compoundPath2d + PathCompose (explicit geometry composition)

But it is not a CombineMode on shape2d under the current slot model.

This is now.