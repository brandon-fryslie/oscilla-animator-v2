Frontend/Backend Compiler Redesign Spec

0. Scope and non-goals

Scope
- Introduce an explicit Frontend (normalize + type/unify + repair) and Backend (lowering + IR + schedule + runtime program) compiler split.
- Frontend will insert adapter blocks automatically during normalization (and any other derived blocks).
- Backend consumes a fully normalized, derived-block-expanded, fully typed graph and must not contain any derived-block-specific logic (default sources, lenses, adapters, etc).  Note: this is already how the compiler works today.  We must maintain that separation.

Non-goals
- No implicit unit conversion at runtime.
- No backend “helpfulness” or fallback typing.
- No hidden edges or implicit coercions that aren’t represented as blocks in the graph.
- No default values or fallbacks except at boundary layers (ie, no defaults whatsoever in side block lowering functions, or within passes).  Errors should be explicit and noisy, and tests should ensure this is the case.

1. Terms
- RawGraph: UI-authored graph. May contain type mismatches and missing information.
- NormalizedGraph: Fully explicit graph (all derived nodes/edges present, stable identities, adapters inserted when applicable).
- TypedGraph: NormalizedGraph annotated with per-port resolved types and unification results.
- Adapter Block: A standard block type, in a restricted registry subset, whose sole job is to transform one concrete type into another.
- Frontend: The only stage allowed to:
  - compute constraints
  - solve/unify
  - generate diagnostics
  - insert adapters or other derived blocks
- Backend: Must assume:
  - graph is structurally valid
  - all port types are fully concretized
  - all required conversions already exist as blocks in the graph
  - no further type reasoning is needed

-

2. High-level pipeline (normative)

2.1 Frontend pipeline (must always produce an artifact unless RawGraph is structurally invalid)

Given RawGraph, Frontend produces:
1.	Normalize.Structural

  - Validates graph structure, expands derived nodes/edges that are purely structural.
  - Output: NormalizedGraphPreAdapters

2.	Analyze.Types

- Builds a constraint set for payload + unit + extent (cardinality/temporality) for every port and edge.
- Solves constraints (partial solutions allowed).
- Output: TypeAnalysisResult = { solution, residual, diagnostics }

3.	Normalize.Adapters

- Uses TypeAnalysisResult to determine where automatic adapter insertion is permitted and inserts adapter blocks.
- Output: NormalizedGraph (now includes adapters)

4.	Analyze.Types.Final

- Rebuild constraints for the adapter-expanded graph and re-solve.
- Must converge to fully concrete types for all connected ports, unless there are genuine user-visible errors.
- Output: TypedGraph + Diagnostics

Frontend outputs are the only compiler products the UI may consume.

2.2 Backend pipeline (runs only if Frontend declares graph “backend-ready”)

Given TypedGraph and NormalizedGraph:
1.	Lowering
2.	IR Building
3.	Schedule / Slot Allocation
4.	CompiledProgramIR

Backend must not:
- insert adapters
- infer types
- relax compatibility rules
- apply implicit conversions

-

3. Core invariants

3.1 Visibility invariant

All conversions that change type semantics (payload/unit/extent) must be represented as explicit nodes (adapter blocks) in NormalizedGraph. No invisible conversions.

3.2 Determinism invariant

Given the same RawGraph and the same Frontend configuration (adapter registry + policies), Frontend must produce the same NormalizedGraph and TypedGraph (stable IDs included).

3.3 Backend ignorance invariant

Backend compilation cannot branch on “this edge used to have an adapter” or “this block was auto-inserted.” The backend sees only the final graph.

3.4 Type soundness invariant

After Analyze.Types.Final, every connected edge in NormalizedGraph is type-correct by exact compatibility rules (no implicit unit conversion, etc.). Any remaining mismatch is a frontend diagnostic and blocks backend compilation.

-

4. Data model and APIs (normative)

4.1 Required artifacts

4.1.1 NormalizedGraph
Must contain:
- Nodes with stable nodeId
- Ports with stable portId
- Edges with stable edgeId and fromPortId -> toPortId
- origin metadata for every node/edge:
- origin.kind = 'user' | 'derived' | 'adapter'
- if adapter: origin.adapter = { fromType, toType, reasonDiagnosticId, policyId }

4.1.2 TypedGraph
Must contain all of NormalizedGraph, plus:
- portTypes[portId] = ResolvedPortType
- nodeTypes[nodeId] = ResolvedNodeTypeInfo (optional but recommended)
- analysis.diagnostics[] (see below)
- analysis.solutionSummary (for debugging)

4.1.3 ResolvedPortType
Must be one of:
- ConcreteType (backend-ready)
- TypeVarRef (frontend partial state only)
- ConflictType (frontend error state only)

Backend receives graphs where every connected port is ConcreteType.

4.1.4 Diagnostic
Diagnostics must be stable and reference:
- diagnosticId
- kind
- severity
- primarySpan (node/port/edge IDs)
- expectedType, actualType (as concrete or partially-resolved representations)
- optional repair payload (see §7)

4.2 Frontend API boundary

Frontend exposes exactly:
- frontendNormalize(raw: RawGraph, config: FrontendConfig): FrontendResult

Where FrontendResult contains:
- normalized: NormalizedGraph
- typed: TypedGraph
- diagnostics: Diagnostic[]
- backendReady: boolean (true iff all required typing is concrete and no blocking diagnostics)
- adapterInsertions: AdapterInsertion[] (for UI audit/telemetry)

Backend exposes exactly:
- backendCompile(typed: TypedGraph, config: BackendConfig): CompiledProgramIR

Backend must assert:
- typed.backendReady === true
- all connected ports are concrete
- no blocking diagnostics

-

5. Type system interaction (normative)

5.1 Type compatibility (edge validity)

For an edge A.out -> B.in to be valid without adapters:
- payload must match exactly
- unit must match exactly
- extent must be compatible exactly under your existing rules (cardinality/preserve policies must already be encoded in the solved types)

If any dimension mismatches, the edge is invalid unless an adapter block exists in between.

5.2 Polymorphism handling (no block special cases)

No block gets “directional inference.” Instead:
- each block instance contributes constraints based on its schema
- each edge contributes equality constraints between endpoint port types
- unification solves globally
- any specialization is expressed as the solver binding type variables, not by ad-hoc inference code

-

6. Adapter system (normative)

6.1 Adapter block registry subset

Define a distinct registry view:
- AdapterRegistry ⊂ BlockRegistry

Every adapter block must declare:
- adapterSpec: { from: ConcreteTypePattern, to: ConcreteTypePattern }
- adapterCost: integer (default 1)
- adapterStability: 'stable' (must be stable for auto insertion)
- adapterVisibility: 'always' (must be visible in UI)

Patterns are allowed only if they resolve to a single concrete transform after typing.
Examples:
- float<deg> -> float<rad>
- float<rad> -> float<deg>
- float<scalar> -> float<phase01> (only if you actually want it; if not, do not include)
- pos2 -> pos3 (if you formalize them)

6.2 Automatic insertion policy (frontend only)

Frontend has an explicit policy table:
- AutoAdapterPolicy

For each mismatch kind, specify:
- allowed? (yes/no)
- max adapters per edge (typically 1)
- ambiguity policy (must be deterministic)
- whether insertion can happen for:
- user edges only
- derived edges too

Minimum required policies:
- Unit mismatch for same payload: allowed only when an adapter exists and is unique.
- Payload mismatch: allowed only when adapter exists and is unique (likely rare).
- Extent mismatch (signal/field): allowed only when your design says it’s representable as explicit adapter blocks (e.g., Broadcast / Materialize / Sample). If you do not have these as explicit adapters, then it is not allowed.

6.3 Deterministic selection

If multiple adapters could satisfy the same (fromType, toType):
- Frontend must not guess.
- Emit a diagnostic AmbiguousAdapter and do not insert automatically.
- UI may prompt user to choose; chosen adapter becomes explicit.

6.4 Graph rewrite semantics

For any edge e: A.out -> B.in with mismatch but allowed by policy:

Rewrite into:
- Remove e
- Insert adapter node X
- Create edges:
- e1: A.out -> X.in
- e2: X.out -> B.in

Identity rules
- Adapter node IDs must be deterministic and stable under the same raw graph and policy.
- Canonical ID derivation:
- adapterNodeId = hash(edgeId, fromPortId, toPortId, adapterBlockTypeId)
- Similar for edges e1, e2

6.5 UI visibility and editing
- Adapter nodes must be editable like any other block:
- user can delete it
- user can replace it with another adapter block (if compatible)
- Adapter nodes have a UI affordance indicating they were auto-inserted:
- reads from origin.kind === 'adapter'
- not a separate block type

-

7. Diagnostics + repair integration (normative)

7.1 Required diagnostic kinds

Frontend must emit at least:
- TypeMismatch (with from/to types)
- UnitMismatch
- PayloadMismatch
- ExtentMismatch
- NoConversionPath (no adapter available)
- AmbiguousAdapter
- UnresolvedTypeVar (cannot become concrete due to insufficient constraints)
- StructuralError (invalid graph references)

7.2 Repair payload

Diagnostics may include:
- repair.suggestedAdapters: AdapterCandidate[] (from registry)
- repair.insertionPlan if deterministic and allowed:
- { adapterBlockTypeId, onEdgeId }

If the insertion is automatic, the diagnostic is still recorded but at severity: info (for traceability).

-

8. Backend contract (normative)

Backend accepts only graphs meeting all:
- backendReady === true
- no blocking diagnostics
- every edge is compatible by exact rules
- all port types are concrete
- all adapters are already in the graph

Backend must:
- treat adapter blocks as normal blocks
- compile them via standard lowering paths
- never special-case “auto inserted” vs “user inserted”

-

9. Implementation requirements (engineering checklist)

9.1 Module boundaries

Create two top-level modules:
- src/compiler/frontend/
- normalization (structural + adapters)
- constraints
- solver wrapper
- diagnostics
- typed graph artifact
- src/compiler/backend/
- lowering
- IR builder
- schedule
- compiled program

9.2 Strict prohibition: backend access to raw graph

Backend must not accept RawGraph directly. Only TypedGraph/NormalizedGraph.

9.3 Remove defaulting behavior

Any behavior like “if unit unresolved, default to scalar” must be removed from type checking. Unresolved must be represented explicitly and surfaced to UI as such.

9.4 Stable identity

Normalization must guarantee stable IDs for:
- derived nodes/edges
- adapters

This is required for UI diffing, selection persistence, and undo/redo stability.

-

10. Testing requirements (must exist)

10.1 Frontend tests (must pass without backend)
1.	Adapter insertion

	 - Input: edge float<deg> → float<rad>
	 - Policy: unit adapters allowed
	 - Expect: graph rewritten with DegToRad adapter block inserted and visible.

	2.	No conversion path

	 - Input: edge mismatch with no adapter available
	 - Expect: no rewrite; diagnostic NoConversionPath; backendReady=false

	3.	Ambiguous adapter

	 - Two adapters satisfy same transform
	 - Expect: no rewrite; diagnostic AmbiguousAdapter

	4.	Partial solvability

	 - Graph with a disconnected polymorphic node
	 - Expect: UnresolvedTypeVar on that node, but does not block unrelated subgraph.

10.2 Backend tests
1.	Backend compiles a graph containing adapter blocks with no special casing.
2.	Backend rejects a graph flagged backendReady=false.

-

11. Operational behavior in the UI (normative)

On any patch edit:
1.	Call frontendNormalize()
2.	UI renders normalized graph
3.	UI reads all port types from typed.portTypes
4.	UI renders diagnostics + suggested repairs
5.	Only when backendReady=true, call backendCompile() and proceed to runtime

No other compiler outputs are consumed by UI.

-

12. Minimal adapter set recommendation (normative requirement for v1)

If you want automatic fixes, you must define and ship at least:
- DegToRad and RadToDeg (or your canonical unit transforms)
- Any scalar normalization transform you consider legitimate (if none, ship none)
- Any extent adapters you claim to support as explicit blocks (e.g., Broadcast) must be modeled as adapters or as normal blocks but included in the adapter registry if you want auto insertion.

If an adapter is not in the AdapterRegistry, it cannot be auto inserted.

-

This architecture makes adapter insertion a deterministic, auditable graph rewrite in the frontend, produces a typed artifact that’s usable even in the presence of errors, and keeps the backend pure and stable.
