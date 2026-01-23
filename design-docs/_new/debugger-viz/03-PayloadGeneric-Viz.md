They mostly don’t, if you keep the invariant that visualization keys off the resolved (payload, unit, cardinality) of a specific port/wire, not off the block kind.

Payload-generic only matters in two places:

1) Registry selection is done after type resolution

A payload-generic block can output different payloads depending on what it’s connected to. Your visualization system should not look at “this is a Normalize block”; it should look at:
•	payload
•	unit
•	cardinality

Once the compiler/type-resolver has fixed those, payload-generic disappears for visualization purposes.

2) You need a fallback plan for “unhandled payload/unit”

Payload-generic increases the number of combinations that can appear, so you need a crisp fallback ladder:
1.	Exact match renderer: (payload, unit)
2.	Payload-only renderer: payload (unit-agnostic, e.g. “render vec3 as xyz numbers”)
3.	Generic numeric renderer: “show components as numbers”
4.	Last-resort: hex/JSON-ish dump for non-numeric payloads (ideally never needed)

That’s it.

What you should not do
•	Don’t write per-block visualization logic for payload-generic blocks.
•	Don’t make renderers keyed by block kind to handle “Normalize vs Normalize”; that’s exactly the duplication trap.

One real caveat: multi-interpretation payloads

If you ever allow the same (payload, unit) to mean different things based on context (e.g. float:scalar sometimes “opacity” sometimes “speed”), you’ll want an optional vizIntent hint at the port (or from the block) to pick between multiple valid renderers for the same type. This is independent of payload-generic; payload-generic just makes it show up more often.

That statement.