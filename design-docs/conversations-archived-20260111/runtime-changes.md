It should change your runtime much less than it changes your compiler and IR contract, if you hold to the “axes are compile-time only” rule.

What stays the same in the hot loop

Your runtime remains “dumb” in exactly the way your slotMeta note is aiming for:
•	It executes a compiled schedule over preallocated stores.
•	It does not infer layout or semantics from the schedule.
•	It does not carry or inspect axis tags on values.

In other words, the five-axis model does not add per-frame branching like “if temporality is discrete then…” inside inner loops; those decisions are moved into compilation and expressed as different ops / different schedules.

What changes at runtime (concretely)

1) More compile-time specialization → fewer runtime conditionals
   Today you likely have places where runtime behavior depends on “is this a signal vs field vs event?” even if indirectly (different tables, different caches, inference, etc.). With the axis model:
   •	one + continuous becomes scalar schedule fragments
   •	many(domain) + continuous becomes looped fragments with fixed bounds
   •	discrete becomes event-buffer fragments

So runtime shifts toward:
•	more predictable loops
•	fewer “guessing” paths
•	fewer dynamic checks

Net effect: runtime typically gets simpler, not more complex.

2) Domain becomes a loop-constant, not a runtime concept
   If you implement domains as compile-time resources (DomainDecl) and lower them into loop bounds and strides, runtime only needs:
   •	N (lane count)
   •	maybe small derived constants (grid width/height if you want (x,y) helpers)

No runtime “domain object,” no runtime “domain wiring,” no domain inference.

3) Stateful blocks allocate per-lane state where needed
   This is the only unavoidable runtime footprint: when a stateful op is compiled for many(domain) you allocate N(domain) state cells (or vectors) for that slot.

But you already pay the same cost in the current system for fields; the five-axis model just makes it explicit and compile-time deterministic.

4) Events become explicit buffers in the IR
   If you currently “fake” event behavior via sentinel values or ad hoc conventions, the axis model wants it explicit:
   •	one + discrete → EventSlot (buffer per tick)
   •	many(domain) + discrete → either (a) buffer per lane, or (b) one buffer with lane ids

Runtime cost: iterating event buffers on ticks where events occur, which is usually sparse and cheap if represented compactly.

5) Perspective/Branch do not exist at runtime in v0
   If you keep defaults canonical in v0 (global/main) then runtime doesn’t change at all for those axes.

When you later enable them, the runtime change should be exactly one of these patterns:
•	Variant dispatch: select CompiledProgramIR by (perspective, branch) and run it
•	State selection: select StateBuffer by (perspective, branch) and run the same program

Either way, the hot loop cost is one pointer selection, not axis propagation.

How this interacts with your slotMeta hard rule

Your slotMeta rule is the right shape for this architecture. Five-axis compilation makes more schedules and storage layouts possible (mixed stores, packed bundles, per-domain state, event buffers), so runtime inference becomes even more dangerous.

So the runtime-side contract you wrote becomes more important, not less:
•	offsets computed in compiler, emitted in program.slotMeta
•	runtime throws if schedule contains slot ops and slotMeta is missing
•	capacities derived from program tables, not hardcoded
•	one canonical SlotMeta type imported from the IR module

That is exactly consistent with a compile-time axis system.

What could get worse (the opposing view)

If you implement the axes in a way that leaks into runtime—e.g., you carry Extent on every value, or you allow runtime “inherit” resolution per operation—then you will absolutely blow your 5–10ms budget via:
•	tag branching in inner loops
•	runtime domain lookups / dynamic lane counts
•	runtime type unification
•	state keyed by maps instead of arrays

So the entire win depends on enforcing “axes compile-time only” as a non-negotiable constraint, which your slotMeta approach already aligns with.

The net runtime impact should be “more deterministic loops and buffers, fewer guesses,” with the only meaningful new runtime surface area being explicit event buffers and potential variant/state selection when you later turn on branch/perspective.