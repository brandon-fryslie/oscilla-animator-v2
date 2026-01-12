**Accepted as Final System Invariant**

**Needs Rewrite.  techical detail IS accurate**

This is a good moment to be very deliberate about naming, because this concept will quietly become one of the most important pieces of the mental model. The name needs to be:
	•	technically honest
	•	non-magical
	•	not cute
	•	compatible with compiler/runtime thinking
	•	comfortable living half in UI, half in graph semantics

Let’s reason from what it is, not from how it looks.

⸻

What this thing actually is

Stripped of UI language, this block is:
	•	a per-input implicit source
	•	that produces a value of a specific TypeDesc
	•	that is structurally part of the graph
	•	that is automatically substituted when no explicit upstream exists
	•	and that represents the identity / neutral element / constant fallback for that input

It is not:
	•	a parameter (too UI / too block-local)
	•	a literal (too code-y)
	•	a wire (it produces values)
	•	a bus (wrong abstraction)
	•	a macro or composite

It is:
	•	a source
	•	a constant
	•	implicit
	•	defaulted
	•	typed
	•	replaceable

That gives us a very clear semantic category.

⸻

The correct conceptual name

Default Source

That is the cleanest, most accurate name.

Why this works:
	•	Source matches graph semantics (it produces values)
	•	Default explains why it exists, not how
	•	It does not imply UI visibility
	•	It does not imply mutability
	•	It does not imply ownership by the block
	•	It scales to all worlds (Signal, Field, Scalar)

Every input always has a source.
If no explicit source is connected, the Default Source is used.

That sentence alone is worth a lot.

⸻

Why not other tempting names

Let’s quickly rule out the common alternatives so you don’t second-guess this later.

❌ Parameter

Too UI-centric, wrong abstraction. Parameters configure blocks; this feeds them.

❌ Constant

Too low-level and misleading. These are replaceable, typed, contextual sources—not just literals.

❌ Identity

Sometimes wrong. Some defaults are neutral, some are sensible, some are domain-specific. Also “identity” is already overloaded in your system.

❌ Fallback

Behavioral, not structural. Also suggests error handling.

❌ ImplicitInput / PhantomBlock

Cute, but unclear and slightly magical.

❌ InlineValue

UI-biased and minimizes the fact that this is a real node in the graph.

⸻

Canonical terminology (lock this in)

I strongly recommend you formalize the following terms:

1. Default Source (the block class)

An implicit, per-input source node that produces a typed default value when no explicit upstream connection exists.

2. Explicit Source

Any user-created block or bus that feeds an input.

3. Source Replacement Rule

When an explicit source is connected, the Default Source for that input is disconnected. When it is disconnected, the Default Source is reconnected.

This gives you a very crisp invariant:

Every input always has exactly one source.

That invariant will simplify:
	•	compiler logic
	•	UI assumptions
	•	error handling
	•	hot swaps
	•	undo/redo

⸻

Naming in code (recommended)

Use these names consistently across layers:

Block type

type BlockType = 'DefaultSource:number' | 'DefaultSource:vec2' | ...

or, if you want one generic class:

type BlockType = 'DefaultSource'
params: { typeDesc: TypeDesc; value: unknown }

Compiler / runtime
	•	DefaultSourceBlock
	•	isDefaultSource(block)
	•	replaceDefaultSource(input, explicitSource)

UI copy (minimal, factual)
	•	Inspector label: Default source
	•	Tooltip (optional): Used when no input is connected

⸻

Why this will age well

This naming survives future evolution:
	•	Lazy Fields? Still a source.
	•	WASM backend? Still a source.
	•	Multi-client runtime? Still a source.
	•	Composite expansion removed? Still a source.
	•	Different default behaviors per domain? Still a source.

It also plays perfectly with your desire to:
	•	remove jank
	•	eliminate disconnected states
	•	keep graphs always evaluatable
	•	reduce “plumbing” UX

⸻

Final answer

They are called:

Default Sources

If you adopt that term consistently, a lot of other design decisions will suddenly feel simpler and more inevitable.

---

Question: 'Default Source' it is.  Is this a good idea?  It feels necessary to avoid the patch breaking whenever I add anything with an input 

---

Yes — it’s a good idea, and it’s one of the few “fallback” mechanisms that actually reduces complexity instead of hiding it, as long as you make it explicit in the semantics and predictable in the UI.

Why it’s good (for this project specifically)
	•	Your graph becomes total: every input always has a value, so compilation/evaluation never has to deal with “null wiring.” That’s a huge simplification for buses, lenses, lazy fields, and hot-swaps.
	•	No-jank editing becomes feasible: disconnecting a wire doesn’t create a discontinuity of “missing data”; it swaps to a neutral value. That’s exactly what you want for live patching.
	•	Discoverability improves: users can add a block and immediately see it “do something” because defaults produce a meaningful baseline.

## The main risk

It can become “magic” if users can’t tell where a value is coming from.

You avoid that by making the Default Source visible as a source in the inspector and on the port affordance:
	•	Port badge: Default (or an icon) when it’s fed by a Default Source
	•	Inspector shows: Source: Default Source (number = 0) with editable value
	•	Clicking the port can show “Replace default…” options (connect bus, insert block, etc.)

If you do that, it won’t feel like a hack; it will feel like the system has a coherent rule: inputs are never undefined.

Two design constraints to keep it “honest”
	1.	Never silently choose a non-neutral default unless the type explicitly defines a neutral element / identity.
Example: number→0 is safe, color→transparent/black is OK, vec2→(0,0) is OK. But “duration” defaults need care.
	2.	Defaults must be stable and deterministic (no randomness).

One key clarification

Your current statement says “should generally implement the identity function, should one be defined.”
That’s correct in spirit, but operationally it should be:
	•	Default Source outputs the neutral value for its domain (the identity element of the bus combiner if applicable, otherwise a type-defined neutral)
	•	If the input represents a transform (e.g. “scale”), the neutral is the identity transform (scale=1), not always 0.

**Critical detail:**  neutral is sometimes per-port semantic, not just per-type. We handle that with “default hints” on the port definition.

Bottom line: it’s not just necessary to avoid breakage — it’s a foundational rule that makes the whole “playable, no-jank, always-live” philosophy actually implementable.