Order of passes:

Frontend normalization passes (final pipeline order)
1.	Composite expansion
      •	Expand composite blocks into internal blocks/edges.
      •	Preserve stable IDs and origin metadata.
2.	Lens expansion
      •	Rewrite user-authored lens constructs into explicit blocks/edges (purely structural).
      •	Must run before any constraint extraction so Solve sees the real graph.
3.	Build DraftGraph
      •	Convert expanded Patch -> DraftGraph (blocks, edges, origins, stable ordering).
      •	Create initial obligations:
      •	missingInputSource for every unconnected input.
4.	Fixpoint loop
      •	Repeat until no plans are produced (or max iterations):
      4.1 Extract constraints
      •	From current DraftGraph, derive constraints for:
      •	payload
      •	unit
      •	cardinality (including zip groups, clampOne/forceMany, edge equalities)
      •	any other axes you’re actually solving now
      4.2 Solve types
      •	Pure solvers return substitutions (no graph mutation):
      •	payload/unit substitution
      •	cardinality substitution (+ instances if used)
      •	(later: temporality/binding/etc)
      4.3 Compute TypeFacts
      •	For each port, produce ok | unknown | conflict with inference/canonical where possible.
      4.4 Derive obligations (type-dependent)
      •	Create obligations that require solved facts, e.g.:
      •	needsAdapter for edges whose endpoints are canonicalizable and mismatched
      •	(later) needsLaneAlignment, needsDomainElaboration, needsVarargMaterialization
      •	Add-if-missing (deterministic IDs) so the set is stable across iterations.
      4.5 Plan discharge
      •	For each open obligation (sorted by ID), if deps satisfied:
      •	DefaultSourcePolicy -> plans default sources
      •	AdapterPolicy -> plans adapter insertion
      •	(later) LaneAlignmentPolicy / DomainElaborationPolicy / VarargPolicy
      •	Obligations waiting on deps remain open; truly unsupported become blocked.
      4.6 Apply plans
      •	Apply ElaborationPlans (add/replace edges, add blocks), bump graph revision.
      •	Stop fixpoint when plans.length === 0.
5.	Varargs validation/materialization
      •	Validate vararg wiring rules on the finalized DraftGraph.
      •	If you do vararg expansion/materialization, it belongs here (or as an obligation + policy inside the loop).
6.	Block indexing
      •	Produce any index maps the backend lowering expects (toposort groups, port lookup tables, etc).
7.	Strict finalization
      •	If no open obligations and all required ports are TypeFacts.status === 'ok':
      •	finalize inference -> CanonicalType (the only boundary)
      •	produce StrictTypedGraph/StrictTypedPatch product
      •	Otherwise: strict product is null + diagnostics.
8.	Axis validation
      •	Enforce “no var axes leak past strict,” cardinality invariants, domain invariants, etc.
9.	Cycle classification
      •	Analyze cycles for scheduling/runtime rules.
10.	TypedPatch / FrontendCompileResult build

	•	Bridge final graph + canonical port types into the exact structures the backend and UI consume.
	•	Store TypeFacts + obligations for debugging surfaces.

That is the order.

---

You don’t need to reinvent lenses.

What you do need is to pick one of two compatible shapes and stick to it, because the fixpoint engine needs lens expansion to be a deterministic structural rewrite with stable provenance.

Option A (recommended): Keep your current lens model, just formalize the existing expansion

What stays the same
•	Lens blocks remain exactly as they are today in the saved patch.
•	expandExplicitLenses() stays as the implementation and semantics.

What changes (only spec-level formalization)
•	You define the pass contract: “Lens Expansion takes a DraftGraph and returns a DraftGraph with those lens blocks removed and replaced with ordinary blocks/edges.”
•	You define stable ID rules for any artifacts created by expansion (even if today you reuse existing IDs).
•	You record provenance for debugging (lensBlockId -> expanded artifacts + rewritten edges), so later diagnostics can point back to the original lens.

Why it’s still required
•	Type solving and obligation planning must not have to understand “lens semantics.” They operate on normal graph structure.
•	Determinism and debug traceability are the non-negotiables, not a new lens language.

Option B: Registry-driven “lens defs” (what my spec assumed)

This is only necessary if your lenses are intended to be extensible by plugins or data-defined without code changes. If lenses are a fixed UX affordance with a fixed expansion implementation, Option B is extra surface area you don’t need.

The real reason any lens pass exists in the pipeline

Because lenses are user-authored ergonomic sugar, and the rest of the compiler shouldn’t have to treat sugar as a first-class semantic feature. Expansion is where you turn sugar into normal nodes so the rest of the pipeline is uniform.

What I would change in the lens spec to match your reality
•	Delete LensRegistry, LensDef, and the “inlineGraph” expand spec.
•	Replace with: “Lens Expansion calls the existing expandExplicitLenses() (adapted to DraftGraph), producing a lens-free graph.”
•	Keep only:
•	deterministic ID requirements for any created blocks/edges
•	provenance mapping for debug
•	diagnostics for malformed lens usage (missing ports, invalid references, expansion limit)

That’s it.