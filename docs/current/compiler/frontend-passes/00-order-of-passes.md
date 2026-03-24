Frontend normalization passes (final pipeline order)
1.	Composite expansion
   - Expand composite blocks into internal blocks/edges.
     - Preserve stable IDs and origin metadata.
2.	Lens expansion
   - Rewrite user-authored lens constructs into explicit blocks/edges (purely structural).
     - Must run before any constraint extraction so Solve sees the real graph.
3.	Build DraftGraph
   - Convert expanded Patch -> DraftGraph (blocks, edges, origins, stable ordering).
     - Create initial obligations:
     - missingInputSource for every unconnected input.
4.	Fixpoint loop
   - Repeat until no plans are produced (or max iterations):
   4.1 Extract constraints
       - From current DraftGraph, derive constraints for:
       - payload
       - unit
       - cardinality (including zip groups, clampOne/forceMany, edge equalities)
       - any other axes you’re actually solving now
     4.2 Solve types
       - Pure solvers return substitutions (no graph mutation):
       - payload/unit substitution
       - cardinality substitution (+ instances if used)
       - (later: temporality/binding/etc)
     4.3 Compute TypeFacts
       - For each port, produce ok | unknown | conflict with inference/canonical where possible.
     4.4 Derive obligations (type-dependent)
       - Create obligations that require solved facts, e.g.:
       - needsAdapter for edges whose endpoints are canonicalizable and mismatched
       - (later) needsLaneAlignment, needsDomainElaboration, needsVarargMaterialization
       - Add-if-missing (deterministic IDs) so the set is stable across iterations.
     4.5 Plan discharge
       - For each open obligation (sorted by ID), if deps satisfied:
       - DefaultSourcePolicy -> plans default sources
       - AdapterPolicy -> plans adapter insertion
       - (later) LaneAlignmentPolicy / DomainElaborationPolicy / VarargPolicy
       - Obligations waiting on deps remain open; truly unsupported become blocked.
     - 4.6 Apply plans
       - Apply ElaborationPlans (add/replace edges, add blocks), bump graph revision.
       - Stop fixpoint when plans.length === 0.
5.	Varargs validation/materialization
   - Validate vararg wiring rules on the finalized DraftGraph.
   - If you do vararg expansion/materialization, it belongs here (or as an obligation + policy inside the loop).
6.	Block indexing
   - Produce any index maps the backend lowering expects (toposort groups, port lookup tables, etc).
7.	Strict finalization
   - If no open obligations and all required ports are TypeFacts.status === 'ok':
     - finalize inference -> CanonicalType (the only boundary)
     - produce StrictTypedGraph/StrictTypedPatch product
     - Otherwise: strict product is null + diagnostics.
8.	Axis validation
   - Enforce “no var axes leak past strict,” cardinality invariants, domain invariants, etc.
9.	Cycle classification
   - Analyze cycles for scheduling/runtime rules.
10.	TypedPatch / FrontendCompileResult build
    - Bridge final graph + canonical port types into the exact structures the backend and UI consume.
    - Store TypeFacts + obligations for debugging surfaces.

That is the order.