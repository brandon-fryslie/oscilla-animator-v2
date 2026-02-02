# Sprint: assets-crossdomain - Path Asset System & Cross-Domain Following
Generated: 2026-02-02
Confidence: HIGH: 0, MEDIUM: 0, LOW: 3
Status: RESEARCH REQUIRED
Source: EVALUATION-20260202.md
Beads: oscilla-animator-v2-3v5y (Phase 4: Path Asset System), oscilla-animator-v2-opd7 (Phase 5: Cross-domain path following)

## Sprint Goal
Research and design the path asset system (save/load path definitions) and cross-domain path following (LayoutAlongPath with arbitrary control points and dynamic topology queries).

## Scope
**Deliverables:**
- Path asset format and persistence (save/load path definitions)
- Cross-domain path following (LayoutAlongPath block)
- Dynamic topology queries at runtime

## Work Items

### P3 WI-1: Path asset format and persistence [LOW]

**Dependencies**: Sprint bezier-support complete
**Spec Reference**: N/A (not in current spec) | **Status Reference**: N/A (not evaluated)

#### Description
Define a serialization format for path definitions that can be saved and loaded. A path asset captures:
- Topology (verb sequence, point counts)
- Default control point positions
- Metadata (name, description, creation date)

This enables users to save custom path shapes and reuse them across patches.

#### Acceptance Criteria
- [ ] Path asset format defined (JSON schema or TypeScript interface)
- [ ] Save function: PathTopologyDef + default control points -> serialized format
- [ ] Load function: serialized format -> registered topology + default field values
- [ ] Round-trip test: save -> load -> compare original
- [ ] Asset format is version-tagged for future evolution

#### Unknowns to Resolve
1. **Storage mechanism**: Local storage? File system? IndexedDB? This depends on the broader asset system architecture. Research: how does the project handle other persistent data?
2. **Control point representation**: Store absolute positions or normalized (0-1)? Normalized is more reusable across different canvas sizes.
3. **Interop with SVG paths**: Should the asset format support import from SVG `<path d="...">` data? This would enable importing paths from design tools.
4. **Topology identity**: When a path asset is loaded, should it get a new topologyId or reuse the original? New ID is safer (no conflicts) but breaks continuity if the same asset is loaded twice.

#### Exit Criteria (to reach MEDIUM confidence)
- [ ] Storage mechanism decided
- [ ] Format schema drafted and reviewed
- [ ] SVG import scope decided (yes/no/later)
- [ ] Topology identity strategy documented

---

### P3 WI-2: Cross-domain path following (LayoutAlongPath) [LOW]

**Dependencies**: Sprint advanced-ops (uniform parameterization), Sprint bezier-support
**Spec Reference**: ESSENTIAL-SPEC.md "DrawPathInstancesOp" | **Status Reference**: N/A (not evaluated)

#### Description
LayoutAlongPath places instances from one domain along a path from another domain. For example: place 100 circles evenly along a bezier curve.

This requires:
1. A path (topology + control points) from one block
2. A target domain with N instances to place
3. Uniform parameterization to distribute instances evenly
4. Position + tangent at each instance location

The output is a set of placement fields (position, tangent/rotation) over the target domain.

#### Acceptance Criteria
- [ ] LayoutAlongPath block accepts path input and instance count
- [ ] Instances distributed evenly by arc length along path
- [ ] Position output is vec2/vec3 field over target domain
- [ ] Tangent/rotation output available for oriented placement
- [ ] Works with both polygon and bezier paths

#### Unknowns to Resolve
1. **Domain crossing semantics**: How does the field system handle values from domain A (path control points) being used to generate values in domain B (placed instances)? This may require a new kind of field expression or a domain-bridge mechanism.
2. **Instance count**: Fixed at compile time? Dynamic? If dynamic, the topology registration model needs to support runtime count changes.
3. **Interpolation**: Instance positions fall between control points. For polygons, linear interpolation. For bezier, need to evaluate B(t) at arbitrary t values. This requires a bezier evaluation function (not just endpoint tangents).
4. **Performance**: Evaluating bezier curves at N arbitrary t values per frame could be expensive for large N. Research: precompute lookup table?
5. **Block interface**: What inputs/outputs does LayoutAlongPath expose? How does it integrate with the graph editor?

#### Exit Criteria (to reach MEDIUM confidence)
- [ ] Domain crossing mechanism designed or existing mechanism identified
- [ ] Instance count (static vs dynamic) decided
- [ ] Bezier evaluation at arbitrary t implemented (or approach designed)
- [ ] Block interface designed and reviewed

---

### P3 WI-3: Dynamic topology queries [LOW]

**Dependencies**: Sprint bezier-support
**Spec Reference**: N/A | **Status Reference**: N/A

#### Description
Enable runtime queries against path topologies: "is this point inside the path?", "what is the nearest point on the path?", "where does this ray intersect the path?". These are foundational for interactive path editing and collision detection.

#### Acceptance Criteria
- [ ] Point-in-path query for closed paths
- [ ] Nearest-point-on-path query (returns t parameter and distance)
- [ ] At least one query works for both polygon and bezier paths
- [ ] Performance: 10,000 queries per frame for simple paths

#### Unknowns to Resolve
1. **Query API**: Are these blocks, field operations, or a separate query system? Research: how do other animation systems expose spatial queries?
2. **Acceleration structure**: For complex paths, brute-force per-segment testing is O(N). Options: bounding box hierarchy, spatial hash. Research: what path sizes justify acceleration?
3. **Bezier nearest-point**: Finding the nearest point on a bezier is a nonlinear optimization problem. Research: standard approaches (subdivision, Newton iteration on distance function).
4. **Integration with event system**: Should path queries trigger events (e.g., "instance entered path region")? This connects to the event hub architecture.

#### Exit Criteria (to reach MEDIUM confidence)
- [ ] Query API approach decided
- [ ] Performance requirements clarified (what path sizes, how many queries)
- [ ] At least one query algorithm implemented and tested for polygons
- [ ] Bezier nearest-point approach identified

## Dependencies
```
Sprint bezier-support ──> WI-1 (path assets)
Sprint bezier-support ──> WI-3 (topology queries)
Sprint advanced-ops (parameterization) ──> WI-2 (LayoutAlongPath)
```

## Risks
- **Scope**: This sprint covers two bead items (Phase 4 + Phase 5). If scope is too large, split WI-2 (LayoutAlongPath) into its own sprint.
- **Domain crossing**: LayoutAlongPath requires cross-domain field evaluation, which may not be supported by the current field system. This could require significant architecture work.
- **Performance**: Spatial queries and bezier evaluation at arbitrary t are expensive. May need acceleration structures or precomputation.
- **Spec gaps**: Path assets and cross-domain following are not detailed in the current spec. Design decisions need user input.
