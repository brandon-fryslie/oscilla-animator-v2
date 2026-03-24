Even with patch-level, explicit, inspectable defaults, there are still classes of inputs where “always defaultable” tends to reduce correctness, debuggability, or composability.

Cases where a default is usually a bad idea

1) Inputs that define identity or topology

Examples:
•	Array.count (instance creation size)
•	Instance/domain selection for a transform (“make circles vs rectangles”)
•	Anything that changes which instances exist

Why defaults hurt: a patch can silently become “valid” but semantically meaningless (e.g., it renders 1 element because count defaulted to 1). That masks authoring mistakes and makes it hard to tell whether the user intended “one element” or “forgot to wire count.”

2) Inputs that select a mode or algorithm

Examples:
•	Blend/combine mode, sort order, culling strategy, coordinate-space mode
•	Anything that’s a discrete choice among behaviors, not a numeric parameter

Why: defaulting a mode can make two patches that look similar behave differently due to an implicit choice. This is especially sharp when the downstream behavior is discontinuous (“layer” vs “sum”, “screen” vs “multiply”).

3) Inputs that are meant to be “external authority”

Examples:
•	MIDI/OSC/controller mappings, microphone amplitude, cursor position, “user input”
•	Anything that is supposed to reflect the outside world rather than be generated internally

Why: a default makes the patch “work” without the external wiring, but now it’s easy to ship a patch that never actually listens to the external input. You’ll see “it animates” rather than “it responds.”

A patch-level default like “cursor position defaults to (0.5,0.5)” is explicit and fine, but for performance workflows it often hides the fact that the patch is disconnected from the instrument.

4) Inputs where a wrong default is indistinguishable from a correct value

Examples:
•	Seed inputs for randomness/noise
•	Time scaling / BPM / period
•	Camera parameters that affect framing

Why: these don’t obviously “break”; they subtly change output. If the default seed is stable, you might think your seeded randomness wiring is working when it’s not. If the default time scale is 1, you might think your tempo modulation is working when it’s not.

5) Types that are not meaningfully constructible without context

Examples:
•	shape2d handles, asset references, font IDs, geometry IDs
•	Domain handles or “opaque” identifiers

Why: any default becomes either (a) a fake placeholder that propagates far before failing, or (b) a real asset selection hiding in “defaults.” Even if the default is declared at patch level, it tends to create confusing behavior when the patch is moved/shared and the asset set differs.

6) Event inputs where “never fires” is technically valid but semantically misleading

Examples:
•	Triggers for SampleAndHold, reset, re-seed, latch, capture
•	“commit” style events that define discrete updates

A default of “never fires” is coherent, but it often turns blocks into inert state machines that look wired but never update. For authoring this is a common footgun because the output stays constant and users debug the wrong thing.

7) Inputs that must be intentionally wired for safety or correctness

Examples:
•	Any input that can drive expensive materialization or create huge instance counts
•	Anything that can create unbounded work if defaulted incorrectly

If you make count defaultable and the default can be user-configured, one wrong patch-level default could explode perf across many patches. Guardrails still matter even if the default is explicit.

The opposing view, and when “everything defaultable” works well

“Everything defaultable” can be a strong UX stance if you treat defaults as part of the patch’s declared environment, not as hidden behavior:
•	A patch can always run, always render, always audition.
•	Defaults become a shareable “instrument preset” layer.
•	You can support progressive disclosure: novices rely on defaults; experts override.

This works best when two conditions hold:
1.	Defaults are visible at the connection site (the UI shows “DefaultSource: phaseA” or “DefaultSource: const(0)” on every unconnected port).
2.	The system can still distinguish “default-fed” from “wired-fed” for diagnostics and authoring guidance (“these 7 ports are using defaults”).

A practical compromise that preserves your goal

Keep “everything has a defined default source,” but allow some ports to be defaultable only to an explicit sentinel that surfaces strongly:
•	For opaque handles/assets: default plan can be “MissingAsset” (a real, typed, non-crashing sentinel) that produces a loud diagnostic and a safe visual fallback.
•	For topology/identity-defining ports: default exists, but the UI and diagnostics treat it as “needs intent” (hint/warn) rather than silently fine.
•	For event triggers: default “never fires” exists, but the UI marks it as “inactive trigger.”

That gives you total definedness without letting defaults masquerade as intentional wiring.