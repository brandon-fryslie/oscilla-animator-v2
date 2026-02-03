You can get “different blocks per type” without introducing conditional logic in the runtime graph by treating DefaultSource as a compile-time macro node: it exists as a single structural block in the NormalizedGraph, but its lowering expands to a small block-subgraph (or directly to IR) depending on the resolved type. No runtime branching, no graph mutation during compilation, and you still get per-type “different blocks.”

There are two clean ways to do it; pick based on how strongly you care about “the default is built out of real blocks” vs “the default is just an IR plan.”

⸻

Option 1 (minimal + clean): DefaultSource lowers to an IR plan that represents other blocks

Idea: keep DefaultSource as the only inserted block, but its lowering returns a ValueExpr that is equivalent to “TimeRail”, “HueRainbow”, “ConstVec3”, “PlacementBasis”, etc.
•	No additional graph nodes.
•	No conditional logic.
•	The “different block” behavior is expressed by choosing different ValueExpr variants / intrinsics / kernels.

This fits your current system because you already have:
•	intrinsic, kernel, time, construct, hslToRgb, etc.
•	stride-aware runtime evaluation

So the “different blocks” are simply different lowering targets.

When this is best: you don’t actually need users to see the internal default graph as blocks; you just need semantics and diagnostics.

⸻

Option 2 (what you’re asking for): DefaultSource expands to a typed subgraph of real blocks — at compile time

Idea: DefaultSource is a macro block whose lowering can emit a small internal graph recipe (like “HueRainbow(phaseA) → out” for color, or “phaseA rail → out” for float<phase01>), and then you lower that recipe like any other graph.

Key constraint: don’t turn this into “graph mutation during compilation.” You can keep I6 intact by making the expansion live in the lowering result, not by actually splicing nodes into NormalizedGraph.

Shape

type LowerResult =
| { kind: "valueExpr"; expr: ValueExprId }
| { kind: "subgraph"; graph: LowerSubgraph; outputs: Record<PortId, SubgraphOutRef> };

type LowerSubgraph = {
nodes: Array<{ id: string; kind: string; params?: any }>;
edges: Array<{ from: {node: string; port: string}; to: {node: string; port: string} }>;
};

DefaultSource.lower() does:
1.	Look at resolved target type (payload/unit/extent).
2.	Pick a template (pure table).
3.	Emit a subgraph recipe built from existing blocks.

Example mapping:
•	float<phase01> → TimeRoot.phaseA (or Phasor if you want, but time-root rail is cleaner)
•	color → HueRainbow(phaseA) or Palette rail
•	vec2 → ConstVec2(0,0) (or PlacementBasis.xy if you want “nice” defaults)
•	bool discrete → ConstBool(false) (never fires)

No runtime conditionals: the branch happens once, during compilation, based on resolved type.

When this is best: you want defaults to be explainable in terms of “real blocks,” and/or you want to reuse existing block implementations for defaults rather than duplicating logic in a “mega default source.”

⸻

The “partial wrapper block” idea

A wrapper/partial block that “wraps other blocks” is basically Option 2, but phrased as: one block whose lowering is allowed to yield a subgraph.

That’s a good abstraction, and it generalizes beyond DefaultSource (e.g., your Composite Expansion pass already does something similar structurally). The trick is: keep it compile-time-only.

So instead of “conditional logic,” you implement compile-time specialization:
•	specialization key = resolved CanonicalType (and maybe a profileId hint from normalization)
•	output = subgraph template or IR plan

⸻

Where conditional logic belongs

If by “conditional logic” you mean “choose between templates,” that belongs in lowering (compile-time), not in the graph DSL.

Do not put runtime if (payload == color) nodes or a general “typecase” block into the user graph. That violates runtime erasure and tends to metastasize.

The only “typecase” you need is: a deterministic function used by the compiler:

function defaultTemplateForType(profile: ProfileId, t: CanonicalType): TemplateId


⸻

Recommendation

Do Option 2 only if you have a concrete need for defaults to be built out of existing block implementations. Otherwise Option 1 is simpler and more robust.

If you do Option 2, keep it disciplined:
•	DefaultSource exists in NormalizedGraph (structural invariant satisfied).
•	DefaultSource.lower() is the single enforcer that selects a template based on resolved type.
•	Templates are table-driven and deterministic.
•	Expansion happens inside lowering output (not by mutating NormalizedGraph).
•	Diagnostics can still attribute back to the target input port via the DefaultSource’s anchor.

That gives you “different blocks per type” without adding runtime conditionals and without destabilizing your pipeline.