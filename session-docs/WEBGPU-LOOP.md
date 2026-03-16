Evaluator Note

active_ticket: RECOVER-11
evaluated_commit: 8d2a3b09
repo_base_for_next_run: HEAD
verdict: completed
next_action: evaluate

do:
- RECOVER-11 implementation is complete. Type 2 parametric foundation established.
- Post-RECOVER-10 validation gate was completed before implementation began.
- The accepted visible baseline is unchanged: breathing-ring.hcl renders colored animated polygons in a ring pattern through the canonical GPU-owned ShapeBank/topology path.
- RECOVER-11 is the terminal leaf in the RECOVER chain. No further tickets to unlock.

avoid:
- Do NOT regress the restored visible baseline.
- Do NOT reintroduce CPU mesh realization for any slice.
- Do NOT collapse Type 2 into the Type 1 rigid path.
- Do NOT route Type 2 through the generic realized-mesh compatibility route.

implementation_summary:
- ShapeClass.Type2Parametric = 2 added to enum (src/shapes/types.ts)
- ParametricTopologyDef type with degree, resolution, closed, ribbonWidth
- Topology registry: registerDynamicTopology accepts ParametricTopologyDef
- isParametricTopology() type guard added
- generateParametricTemplate(resolution) → Float32Array of R+1 t-values
- parametricRibbonVertexCount(resolution) → resolution * 6
- buildCanonicalTopologyHeaders(): Type 2 branch writes template t-values to ShapeBank param block
  - Kind=2, ParamBlockOffset/Words point to template, BoundsMinPacked=degree, BoundsMaxPacked=ribbonWidth
- Uber vertex shader: vs_type2_parametric() with cubic/quadratic/linear Bezier evaluation
  - Reads template t-values from ShapeBank
  - Reads control points from Arena (SoA layout via cpArenaBase/LaneStride/ComponentStride)
  - Evaluates B(t) analytically (not rigid CP fetch)
  - Computes tangent B'(t) for ribbon extrusion
  - NaN guardrail for collapsed CPs (epsilon tangent normalization)
  - Ribbon offset via perpendicular normal × ribbonWidth
  - Full instance transform (scale, rotation, position)
- 14 new contract tests in type2-parametric-contract.test.ts
- Existing shape-class-contract.test.ts updated for Type2

verification:
- typecheck: clean (0 errors)
- build: clean (vite, 11.94s)
- all tests: 1970 passed (172 files), 2 todo
- WASM: 401.49 KB (up from 393.54 KB — Type 2 vertex shader code)
- visible baseline: breathing-ring.hcl renders identically across 9 burst frames
- screenshot: `/tmp/oscilla-test-screenshots/breathing-ring_burst_3x3_100ms_20260316-001909.png`

acceptance_criteria_status:
- AC 1 (Type 2 exists as explicit class-specific foundation): YES
  - ShapeClass.Type2Parametric = 2, ParametricTopologyDef type, distinct type guard
- AC 2 (ShapeBank stores template topology/progression metadata): YES
  - ParamBlockOffset/ParamBlockWords point to t-value template in ShapeBank
  - Template is generated from resolution, not from rigid CP positions
- AC 3 (Arena owns per-instance control points): YES
  - CpArenaBaseOffset/LaneStride/ComponentStride in header
  - Vertex shader reads CPs from Arena via these addresses
- AC 4 (Render/draw-prep seams for analytical Type 2 vertex evaluation): YES
  - vs_type2_parametric() evaluates B(t) and B'(t) analytically
  - Dispatch on SHAPE_CLASS_TYPE2_PARAMETRIC in vs_main
  - Does NOT reuse Type 1 rigid CP fetch or triangle fan
- AC 5 (Type 1 baseline still works): YES
  - breathing-ring.hcl renders identically, 1970 tests pass

remaining_risks:
- Type 2 path is not yet exercised by a live demo patch (no block produces Kind=2 yet)
- Draw-prep bucketing for Type 2 is not yet tested with real instances
- Arc-length reparameterization not implemented (documented as future work in spec)
