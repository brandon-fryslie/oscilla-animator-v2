Nice, this is exactly where the instance index starts to earn its keep.

I’ll give you concrete, realistic examples of both:
•	needsLaneAlignment policies
•	needsDomainElaboration policies

And for each one I’ll spell out how facts.instances is actually used.

⸻

1. needsLaneAlignment policy examples

These are “your lanes must line up” situations: multiple field ports that are supposed to be in 1–1 correspondence over the same instance set.

1.1 PathField: controlPoints + tangents must share instance

Block: PathField
Ports:
•	controlPoints: Field<VEC2> (input)
•	tangents: Field<VEC2> (input)
•	path: Field<PathSegment> (output)

Intent: Each lane of controlPoints and tangents must correspond to the same logical path point. If one is many(instance A) and the other is many(instance B), you’re in trouble.

How needsLaneAlignment uses facts.instances:
1.	Detection step (create obligation):
•	After solving, you inspect the block’s ports:
•	facts.ports[controlPoints].canonical.extent.cardinality = many(instanceA)
•	facts.ports[tangents].canonical.extent.cardinality = many(instanceB)
•	If instanceA !== instanceB, you emit:

NeedsLaneAlignmentObligation {
kind: 'needsLaneAlignment',
anchor: { blockId: pathFieldBlockId, laneGroupId: 'control+tangent' },
deps: [
{ kind: 'portCanonicalizable', port: controlPoints },
{ kind: 'portCanonicalizable', port: tangents },
],
policy: { name: 'laneAlignment.v1', version: 1 },
}


	2.	Policy uses facts.instances:
	•	facts.instances might have:

key("Shape:array1") → { ref: instanceA, ports: [someProducer.out, controlPoints] }
key("Shape:array2") → { ref: instanceB, ports: [someOtherProducer.out, tangents] }


	•	The lane alignment policy can now:
	•	See which producers feed each instance group.
	•	Decide how to fix it: e.g., insert an AlignInstances helper block that reindexes tangents to instanceA.

	3.	Example ElaborationPlan:

// Pseudocode
plan = {
obligationId,
role: 'laneAlignHelper',
addBlocks: [ AlignInstancesBlock(...) ],
replaceEdges: [
{ remove: edge(tangentsProducer → tangentsIn), add: [edge(tangentsProducer → align.in), edge(align.out → tangentsIn)] },
],
};



Key point: Without the instance index, you know that the two ports conflict, but you don’t know what other ports are in each instance set, which makes designing a sensible, reusable AlignInstances helper much harder.

⸻

1.2 RenderInstances2D: positions + colors must align

Block: RenderInstances2D
Ports:
•	positions: Field<VEC2>
•	colors: Field<Color>
•	sizes: Field<float> (optional)
•	glyphs: Field<Glyph> (optional)

Intent: All these field inputs are describing attributes of the same instance set.

needsLaneAlignment usage:
•	After solving:
•	positions: many(instanceScene1)
•	colors: many(instanceScene2)
•	Policy looks up both in facts.instances and discovers:
•	instanceScene1 includes [ArrayOfPoints.out, positions]
•	instanceScene2 includes [ArrayOfColors.out, colors]
•	Policy might choose:
•	“The position instance set is canonical; align all others to it.”
•	Insert AlignInstances blocks on colors, sizes, glyphs inputs as needed.

The invariant is: for a given RenderInstances2D block, all field ports in the same lane group must share the same instance ref; needsLaneAlignment enforces that.

⸻

1.3 Layout blocks: child transforms + child styles

Block: GridLayout
Ports:
•	children: Field<InstanceHandle>
•	offsets: Field<VEC2>
•	childColors: Field<Color>

If children has many(instanceGridRows) and offsets has many(instanceOther), you don’t really have a coherent layout. A lane alignment policy enforces: all “per-child” field ports in that block’s lane group share one instance.

Implementation is analogous to RenderInstances2D.

⸻

2. needsDomainElaboration policy examples

These are “you have the right instance set, but not the right domain-specific properties yet” situations.

The instance index tells you what to elaborate (which instance group), and the domain tells you how.

2.1 Shape domain: path points from polygon

This is basically your PolygonPrimitive → PathPointsFromShape split, generalized.

Domain types:
•	Shape domain: an instance has properties like kind: 'circle' | 'rect' | 'poly', plus shape-specific attributes.
•	PathPointField domain: instance describing control points and tangents for each shape.

Blocks:
•	PolygonPrimitive: produces Shape instances with kind:'poly', plus vertices.
•	PathPointsFromShape: consumes Shape and emits Field<VEC2> (points) with its own instance.

Where needsDomainElaboration comes in:

Imagine a downstream block that expects a Shape that has already had certain derived properties computed — e.g., arc-length, bounding boxes, or baked tessellation.

Example block: ShapeLighting that expects per-shape normals or area.
1.	Detection:
•	After type solving, you know:
•	shapePort: payload domain = Shape
•	cardinality = many(instanceSceneShapes)
•	You also know, via some domain metadata, that ShapeLighting requires an “elaborated shape” property set (e.g., hasNormals: true).
•	But the provider for shapePort is a bare PolygonPrimitive that only has raw vertices, not derived normals.
•	That triggers:

NeedsDomainElaborationObligation {
kind: 'needsDomainElaboration',
anchor: { port: shapePort },
deps: [{ kind:'portCanonicalizable', port: shapePort }],
policy: { name:'shapeDomain.v1', version:1 },
}


	2.	Policy uses facts.instances:
	•	Use facts.ports[shapePort].canonical to:
	•	Confirm payload domain is Shape
	•	Find its instance instanceSceneShapes
	•	Use facts.instances.get(instanceKey(instanceSceneShapes)) to:
	•	See all ports tied to that instance set (where else the same shapes flow).
	•	The policy can then plan an elaboration block once per instance set, not once per edge:
	•	e.g., insert ComputeShapeNormals between the PolygonPrimitive output and all Shape consumers that require normals.
	3.	Elaboration plan example:

plan = {
obligationId,
role: 'internalHelper',
addBlocks: [ ComputeShapeNormalsBlock { id: `_norm_${instanceKey}`, ... } ],
replaceEdges: [
// For each edge from PolygonPrimitive.out to a Shape-normal-requiring port,
// reroute through ComputeShapeNormals.
],
};



Without facts.instances, the policy knows a port needs domain elaboration, but not which other ports share that same logical instance set or where to insert a single shared elaboration block.

⸻

2.2 Path domain: arc-length parametrization

Domain types:
•	Path domain: a set of curves with control points.
•	ArcLengthParam domain/metadata: per-path lookup from t to arc-length and back.

Blocks:
•	PathField: produces Path instances.
•	SamplePathAtDistance: wants to sample at a distance along the path, not parametric t.

needsDomainElaboration usage:
1.	You detect that SamplePathAtDistance.path expects a Path with arc-length metadata.
2.	The provider is a plain PathField that has no such metadata.
3.	You emit a needsDomainElaboration obligation for that path port.
4.	The policy:
•	Uses facts.instances to find the instance group for the path (all “this path set” uses).
•	Inserts BuildArcLengthTable once for that instance set.
•	Reroutes edges from producers to consumers requiring arc-length-aware paths.

Again, the instance index ensures you elaborate per logical path set, not per edge.

⸻

2.3 Field domain: sampling grid elaboration

Scenario:
•	NoiseField2D outputs a field on some 2D sampling grid instance.
•	BlurField2D expects not just values but a neighborhood kernel (a grid structure).
•	Some upstream pipeline produced values only; the grid structure is implicit.

Domain elaboration:
•	needsDomainElaboration obligation on the field port of BlurField2D.
•	Policy looks at:
•	Payload domain: Field<float> with domain Grid2D (or similar).
•	Instance: instanceGridA.
•	Uses facts.instances to find all field ports in instanceGridA.
•	Inserts a BuildGridNeighborhood block, outputs a richer domain (Grid2DWithNeighborhood), and reroutes field consumers that need neighbor access through it.

⸻

Why these are “20-year” features, not one-offs
•	Lane alignment is a structural concept: any time you have multiple field attributes sharing an instance set, you want something like this. The instance index gives you a generic way to express and enforce it across all such blocks.
•	Domain elaboration is a pattern where:
•	Some blocks produce a base domain (shapes, paths, grids).
•	Other blocks require an “elaborated” version (with extra derived properties).
•	The instance mapping tells you exactly where to insert “upgrader” blocks in a way that is:
•	Per instance set, not per edge
•	Reusable for future domain elaborations (normals, tangents, arc-length, mip-maps, etc.)

All of that leans directly on the solver’s instances substitutions flowing into canonical types and then into facts.instances, so that map is a real, first-class part of the architecture, not a debug afterthought.