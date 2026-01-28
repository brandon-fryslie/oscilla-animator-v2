Frontend should include structural cycle analysis, but not backend-only execution cycle decomposition (SCC/scheduling), and it must treat “cycle detection” as graph classification + invariants, not as “reject cycles.”

What belongs in the frontend

1) Pure structural validation
   •	Dangling ports, invalid IDs, illegal self-edge rules (if any), duplicate writers where forbidden, etc.
   •	This is independent of types and needed for UI correctness.

2) Type constraint building + unification
   •	As discussed.

3) Adapter insertion
   •	Requires concrete types (or at least enough type info to choose adapters deterministically).

4) Cycle classification (yes)
   Frontend should compute and expose a CycleSummary that the UI and diagnostics can use:
   •	Identify SCCs (strongly connected components) on the dataflow dependency graph.
   •	Mark each SCC as:
   •	Acyclic (size 1, no self-loop)
   •	Trivial self-loop (size 1, self-edge)
   •	Cyclic SCC (size > 1)
   •	For each SCC, compute whether it is:
   •	Legal feedback (contains at least one explicit delay/state boundary in every cycle)
   •	Instantaneous cycle (no delay boundary somewhere → unschedulable / undefined)

This is “cycle detection,” but it’s cheap, stable, and doesn’t require “multiple rounds.” It’s a single analysis pass over the normalized graph.

Why frontend needs this
•	UI needs to explain “why compilation fails” before backend scheduling.
•	UI needs to guide fixes: “insert Delay/StateRead/History block here to break instantaneous cycle.”
•	Your adapter insertion and type unification also benefit from knowing which edges cross a delay boundary (because those edges change temporality constraints).

What must stay in the backend

5) Execution ordering, SCC scheduling, lowering-time dependency graph, multi-phase scheduling
   •	Anything that decides:
   •	evaluation order,
   •	phase ordering (signals vs fields vs events),
   •	topo ordering across lanes,
   •	continuity phases,
   •	per-op dependency edges created during lowering.

That’s backend territory because it depends on:
•	lowered IR steps,
•	runtime resource constraints (materialization, slot banks),
•	and “what actually runs” rather than “what the user connected.”

The key trick that avoids “multiple rounds”

Stop thinking about “cycles” as a thing you repeatedly rediscover. In the frontend, compute SCCs once on a canonical dependency view of the graph:
•	Nodes = block outputs (or ports) as producers
•	Edges = “this output depends on that output” induced by connections
•	But treat explicit delay/state boundaries as edge cuts:
•	e.g., StateRead (prev frame), Delay, History, etc. break instantaneous dependence

Then you get a stable partition:
•	SCCs on “instantaneous edges only”
•	Everything else is acyclic by construction

Backend can still do its own SCC and scheduling on the lowered step graph, but that’s a separate artifact and not something the UI should depend on.

Concrete rule
•	Frontend includes SCC computation on instantaneous dependencies and emits diagnostics for illegal instantaneous SCCs.
•	Backend handles scheduling and any SCC decomposition needed for execution, without feeding back into frontend artifacts.

That keeps the frontend “engineerable” and UI-useful, while avoiding ad-hoc special casing for your intentional feedback model.