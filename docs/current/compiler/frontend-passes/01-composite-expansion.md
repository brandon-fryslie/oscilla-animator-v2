Composite Expansion Spec

Note: this is a generic spec.  Please adapt it to our project's specific naming conventions and types.

1. Purpose

Composite Expansion converts a user patch that contains composite instance blocks into a flat patch graph containing only primitive blocks and primitive edges, while preserving deterministic IDs and producing a complete provenance map for diagnostics and debugging.

This step runs before any type solving, default sources, adapters, lenses, indexing, or obligation processing.

⸻

2. Inputs and Outputs

2.1 Inputs
•	Patch (already validated as a graph: blocks + edges)
•	CompositeRegistry (lookup table of composite definitions by CompositeDefId)
•	ExpansionOptions:
•	maxDepth: number (hard limit)
•	maxNodesAdded: number (hard limit)

2.2 Output
•	ExpandedPatch:
•	blocks: Block[] (no composite blocks)
•	edges: Edge[] (no edges referencing composite blocks)
•	provenance: ExpansionProvenance (required for debugging)
•	diagnostics: Diagnostic[]

If diagnostics contain any error severity, the compiler frontend stops after this step and returns the diagnostics.

⸻

3. Required Data Model Additions

3.1 Composite Instance Block Contract

A composite instance is represented as a normal Block with:
•	block.type === 'Composite' (or your existing composite marker)
•	block.params.compositeId: CompositeDefId
•	block.params.instanceVersion?: string (opaque; used only in provenance)
•	Ports on the instance block are the composite interface:
•	inputs[] correspond to composite interface inputs
•	outputs[] correspond to composite interface outputs

3.2 Composite Definition Contract

A composite definition CompositeDef includes:
•	id: CompositeDefId
•	interface:
•	inputs: PortName[]
•	outputs: PortName[]
•	graph:
•	blocks: Block[] (may include composites; recursion permitted)
•	edges: Edge[]
•	interfaceWiring:
•	inputBindings: Map<PortName, PortRef> mapping each interface input to an internal target port
•	outputBindings: Map<PortName, PortRef> mapping each interface output to an internal source port

All bound PortRef entries must reference ports that exist in graph.blocks.

3.3 Provenance Types

Every expanded block and edge must carry origin metadata.

type ExpansionPath = readonly ExpansionFrame[];

type ExpansionFrame = {
instanceBlockId: BlockId;     // the composite instance in the parent graph
compositeId: CompositeDefId;  // definition applied at this frame
};

type BlockOrigin =
| { kind: 'user' }
| { kind: 'expandedFromComposite'; path: ExpansionPath; innerBlockId: BlockId };

type EdgeOrigin =
| { kind: 'user' }
| { kind: 'expandedFromComposite'; path: ExpansionPath; innerEdgeId: EdgeId }
| { kind: 'compositeBoundaryRewrite'; path: ExpansionPath; boundary: 'in' | 'out'; port: PortName };

type ExpansionProvenance = {
// For any expanded block/edge, map it back to the composite path + inner id.
blockMap: Map<BlockId, BlockOrigin>;
edgeMap: Map<EdgeId, EdgeOrigin>;

// For any composite instance in the original patch, record how its boundary rewires were performed.
boundaryMap: Map<BlockId /* instanceBlockId */, {
path: ExpansionPath;
inputRewrites: Map<PortName, { replacedEdges: EdgeId[]; internalSink: PortRef }>;
outputRewrites: Map<PortName, { replacedEdges: EdgeId[]; internalSource: PortRef }>;
}>;
};


⸻

4. Deterministic ID Scheme

Composite expansion must be bit-identical for the same inputs.

4.1 Expanded Block IDs

For each internal block innerBlockId inside a composite instance with expansion path path:

expandedBlockId = "cx:" + pathKey(path) + ":b:" + innerBlockId

Where:
•	pathKey(path) is the concatenation of frames in order:
•	frameKey = instanceBlockId + "@" + compositeId
•	pathKey = frameKey.join("/")

No hashing is used; the scheme is plain ASCII concatenation. IDs are stable across runs.

4.2 Expanded Edge IDs

For each internal edge innerEdgeId:

expandedEdgeId = "cx:" + pathKey(path) + ":e:" + innerEdgeId

4.3 Boundary Rewrite Edge IDs

Edges created when replacing wires into/out of the composite instance use:
•	For each rewritten incoming edge origEdgeId targeting instance input p:

newEdgeId = "cx:" + pathKey(path) + ":in:" + p + ":re:" + origEdgeId


	•	For each rewritten outgoing edge origEdgeId sourcing from instance output p:

newEdgeId = "cx:" + pathKey(path) + ":out:" + p + ":re:" + origEdgeId



4.4 Ordering

All output arrays are stable-sorted:
•	blocks sorted by id (lexicographic)
•	edges sorted by id (lexicographic)

⸻

5. Expansion Algorithm

5.1 Overview

Expansion is a recursive graph rewrite that:
1.	Removes the composite instance block.
2.	Inlines its internal blocks and edges with remapped IDs.
3.	Rewrites any edges that used to connect to the instance’s interface ports so they connect to the bound internal ports.
4.	Records provenance for every expanded artifact and every boundary rewrite.

5.2 Procedure

Implement:

function expandComposites(input: Patch, registry: CompositeRegistry, options: ExpansionOptions): ExpandedPatch

Algorithm:
1.	Initialize:
•	workBlocks = input.blocks
•	workEdges = input.edges
•	provenance = empty maps
•	diagnostics = []
2.	Define recursive expansion function:

expandInstance(instanceBlock: Block, parentPath: ExpansionPath): void

For a given instanceBlock:

A) Lookup definition
•	def = registry.get(instanceBlock.params.compositeId)
•	If missing: emit error diagnostic CompositeDefinitionMissing and return.

B) Validate interface shape
•	Validate that instance block ports match def.interface exactly.
•	Mismatches emit error CompositeInterfaceMismatch.

C) Create path = parentPath + [{ instanceBlockId: instanceBlock.id, compositeId: def.id }]
•	If path.length > options.maxDepth: emit error CompositeExpansionDepthExceeded.

D) Validate bindings
•	For each def.interface.inputs[i]:
•	binding must exist in def.interfaceWiring.inputBindings
•	bound internal port must exist
•	For each output:
•	binding must exist in def.interfaceWiring.outputBindings
•	bound internal port must exist
•	Any failure emits error CompositeBindingInvalid.

E) Inline internal blocks
•	For each innerBlock in def.graph.blocks:
•	Create expandedBlock with id = expandedBlockId(path, innerBlock.id)
•	Copy type, params
•	Set origin = { kind:'expandedFromComposite', path, innerBlockId: innerBlock.id }
•	Add to workBlocks

F) Inline internal edges
•	For each innerEdge in def.graph.edges:
•	Remap from.blockId and to.blockId by prefixing using the expanded ID mapping.
•	Create expandedEdge with id = expandedEdgeId(path, innerEdge.id)
•	Set origin = { kind:'expandedFromComposite', path, innerEdgeId: innerEdge.id }
•	Add to workEdges

G) Rewrite boundary edges (incoming)
•	For each edge e in workEdges where e.to.blockId === instanceBlock.id:
•	Let p = e.to.port
•	Find bound internal sink sink = def.interfaceWiring.inputBindings[p]
•	Remap sink.blockId to expanded internal block ID for this path
•	Remove original edge e
•	Create new edge e2 with:
•	id = boundaryInEdgeId(path, p, e.id)
•	from = e.from unchanged
•	to = remapped sink
•	role = e.role unchanged
•	origin = { kind:'compositeBoundaryRewrite', path, boundary:'in', port:p }
•	Record boundaryMap[instanceBlock.id].inputRewrites[p] with replacedEdges += [e.id]

H) Rewrite boundary edges (outgoing)
•	For each edge e in workEdges where e.from.blockId === instanceBlock.id:
•	Let p = e.from.port
•	Find bound internal source src = def.interfaceWiring.outputBindings[p]
•	Remap src.blockId to expanded internal block ID for this path
•	Remove original edge e
•	Create new edge e2 with:
•	id = boundaryOutEdgeId(path, p, e.id)
•	from = remapped src
•	to = e.to unchanged
•	role = e.role unchanged
•	origin = { kind:'compositeBoundaryRewrite', path, boundary:'out', port:p }
•	Record boundaryMap[instanceBlock.id].outputRewrites[p] with replacedEdges += [e.id]

I) Remove the composite instance block
•	Remove instanceBlock from workBlocks.

J) Recursive expansion of newly inlined composite blocks
•	Scan the inlined blocks of this instance (the ones just added).
•	For each block whose type is composite, call expandInstance(block, path).

	3.	Drive expansion

	•	Scan input.blocks in stable order by id.
	•	For each composite instance block, call expandInstance(block, []).

	4.	Enforce resource limits

	•	After all expansions, if total blocks/edges added exceed options.maxNodesAdded, emit CompositeExpansionSizeExceeded error.

	5.	Finalize output

	•	Stable sort workBlocks, workEdges.
	•	Return { blocks, edges, provenance, diagnostics }.

⸻

6. Diagnostics

Diagnostics emitted by this step use a dedicated namespace CompositeExpansion/*.

Each diagnostic includes:
•	severity: 'error' | 'warning'
•	code: string
•	message: string
•	at (source location):
•	instanceBlockId?: BlockId
•	compositeId?: CompositeDefId
•	port?: PortName
•	path?: ExpansionPath
•	innerId?: BlockId | EdgeId
•	related?: DiagnosticRef[] (optional cross-links)

6.1 Error Diagnostics
•	CompositeExpansion/CompositeDefinitionMissing
•	Trigger: registry lookup fails
•	at.instanceBlockId, at.compositeId
•	CompositeExpansion/CompositeInterfaceMismatch
•	Trigger: instance ports do not match def interface
•	at.instanceBlockId, at.compositeId
•	CompositeExpansion/CompositeBindingInvalid
•	Trigger: missing binding, or binding points to non-existent internal port
•	at.instanceBlockId, at.compositeId, at.port
•	CompositeExpansion/CompositeExpansionDepthExceeded
•	Trigger: path.length > maxDepth
•	at.instanceBlockId, at.path
•	CompositeExpansion/CompositeExpansionSizeExceeded
•	Trigger: expansion exceeded maxNodesAdded
•	at.path (deepest path reached)
•	CompositeExpansion/CompositeIdCollision
•	Trigger: computed expanded IDs collide with existing IDs in workBlocks/workEdges
•	at.instanceBlockId, at.path, at.innerId

6.2 Warning Diagnostics
•	CompositeExpansion/UnusedInterfacePort
•	Trigger: an interface input has no incoming edge in the parent graph, or an interface output has no outgoing edge
•	at.instanceBlockId, at.port

Warnings do not stop compilation.

⸻

7. Debugging Requirements

7.1 Artifact Attribution

Every expanded block/edge must be traceable to:
•	the composite instance chain (ExpansionPath)
•	the inner definition artifact (innerBlockId / innerEdgeId)
•	or the boundary rewrite event (in/out, port, original edge)

This is satisfied exclusively by ExpansionProvenance.

7.2 Diagnostic Source Mapping

When any later compiler stage produces a diagnostic referring to an expanded block/edge ID, the UI/debug tooling must be able to:
•	resolve it via provenance.blockMap or provenance.edgeMap
•	present the composite instance chain and the inner artifact ID

Composite Expansion must therefore preserve provenance for all expanded artifacts even if they are later removed by subsequent normalization steps.

7.3 Stable Expansion Trace

If options.trace === true, expansion emits a structured trace:

type ExpansionTraceEvent =
| { kind:'expandBegin'; instanceBlockId; compositeId; path }
| { kind:'expandEnd'; instanceBlockId; compositeId; path; addedBlocks; addedEdges }
| { kind:'rewriteIn'; instanceBlockId; port; origEdgeId; newEdgeId; internalSink }
| { kind:'rewriteOut'; instanceBlockId; port; origEdgeId; newEdgeId; internalSource }
| { kind:'diagnostic'; code; severity; at };

Trace events are recorded in stable order and attached to the step output for developer debugging.

⸻

8. Invariants
    1.	Output contains zero blocks of type === 'Composite'.
    2.	All edges reference existing blocks and ports.
    3.	All expanded IDs are deterministic and collision-free for a given input + registry.
    4.	Provenance maps contain entries for every expanded artifact and every boundary rewrite edge.
    5.	On any error diagnostic, output patch is still returned (for debugging) but compilation stops after this step.

⸻

9. Required Tests
    1.	Expanding a patch with no composites is identity (blocks/edges unchanged; provenance marks all as user).
    2.	Single composite instance expands to exact expected block/edge IDs and stable ordering.
    3.	Nested composites produce correct ExpansionPath sequences and correct remapped IDs.
    4.	Boundary rewrites preserve roles and rewire to correct internal bound ports.
    5.	Missing composite definition emits CompositeDefinitionMissing and stops further expansion.
    6.	Invalid binding emits CompositeBindingInvalid with correct port.
    7.	Depth limit emits CompositeExpansionDepthExceeded.
    8.	ID collision emits CompositeIdCollision.
    9.	Provenance maps cover every expanded block/edge and every boundary rewrite edge.

This is the composite expansion spec.