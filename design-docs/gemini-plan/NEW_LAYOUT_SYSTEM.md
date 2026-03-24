This is the exact architectural specification for ripping out the "Grid Trap" and implementing a decoupled **Domain $\rightarrow$ Topology Mapping** pipeline.

By separating the *creation of instances* from the *placement of instances*, we return to pure WebGPU dataflow.

Here is the comprehensive specification for **Oscilla V1: Decoupled Domain Topology**.

---

## Related Contracts
* `docs/current/webgpu-specs/P4-1__Type2_Parametric_Shapes.md`
* `docs/WebGPU-Complete/P4-2__Implicit_Vectorization.md`

## 1. The Core Paradigm Shift (Virtual vs. Physical Memory)

In the old model, a `Grid` block physically allocated memory for `uv` and `rank` and wrote to VRAM.
In the new model, **Domain generation is free.** It consumes absolutely zero VRAM.

`rank` and `index` are not arrays sitting in the Compute Arena. They are **Hardware Intrinsics** evaluated on-the-fly from the GPU's `global_invocation_id.x`. They only materialize into physical memory if a user explicitly wires them into a `Render` block's color/scale port, or if they are transformed by an expensive node (like `SamplePath`) whose result needs caching.

---

## 2. The Authoring Blocks (The UI/UX Contract)

We introduce three targeted blocks to replace the monolithic Basis generators.

### 2.1 `InstanceDomain` (The Origin)
This block is the invisible heartbeat of the patch. It dictates the WebGPU thread dispatch count.
* **Input:** `count` (`Scalar<int>`). Example: 500.
* **Outputs:** * `rank` (`Field<float>`): Exactly $0.0 \rightarrow 1.0$.
    * `index` (`Field<int>`): Exactly $0 \rightarrow N-1$.
* **Compiler Action:** Mints a unique `instanceId` for the graph. Tells `ScheduleNagaLowering.ts` to set `maxActiveLanes = 500`.

### 2.2 `ScatterUV` (The Organic Canvas)
Replaces `Grid.uv` for texture mapping, noise sampling, or 2.5D heightmaps without looking like a spreadsheet. Uses the Halton sequence.
* **Input:** `index` (`Field<int>`). Sourced from `InstanceDomain`.
* **Outputs:** `uv` (`Field<vec2>`). A mathematically perfect, non-overlapping organic distribution in $[0, 1]^2$.

### 2.3 `SamplePath` (The Relational Mapper)
Allows an array of instances to perfectly attach themselves to the topological surface of a Type 2 curve.
* **Inputs:** * `path` (`ParametricShape`). The target Type 2 curve (e.g., `CubicBezierRibbon2D`).
    * `t` (`Field<float>`). Where along the curve to sample. Usually driven by `Domain.rank`.
* **Outputs:**
    * `position` (`Field<vec2>`).
    * `tangent` (`Field<vec2>`).

---

## 3. The Compiler AST Lowering (`ScheduleNagaLowering.ts`)

`// [LAW:dataflow-not-control-flow]` We execute this entirely within the standard node compilation flow.

### 3.1 Intrinsic Resolution (`Domain.rank` and `Domain.index`)
When the compiler encounters a mathematical expression reading `Domain.rank`, it does not issue a `buffer_load`. It emits the hardware derivation directly into the AST:

```typescript
// Inside emitMaterializeExprComponentF32()
if (expr.intrinsicKind === 'domain_property') {
  if (expr.property === 'index') {
      // Returns gid.x directly as a float
      return emitLaneAsF32(args.ctx, args.laneExpr, args.source);
  }
  if (expr.property === 'rank') {
      // Returns gid.x / (laneCount - 1.0)
      const laneAsF32 = emitLaneAsF32(args.ctx, args.laneExpr, args.source);
      const denom = emitLiteralF32(args.ctx, args.builtins, args.targetPlan.laneCount - 1, args.source);
      return args.ctx.addExpression({ kind: 'binary', op: 'div', left: laneAsF32, right: denom }, args.source);
  }
}
```

### 3.2 Halton 2D Resolution (`ScatterUV`)
Your agent already wrote the math for this (`emitHaltonFromLane`). We simply re-map it so it consumes the `index` input instead of assuming a magical "placement" context. It runs the prime-base digit extraction loop entirely in the ALU, outputting the `vec2` dynamically.

---

## 4. The WGSL Compute Implementation: `SamplePath`

This is the crown jewel of the new architecture.

When you wire `SamplePath.position` into `StepRender.positionXY`, the compiler must evaluate the Type 2 Bezier math **inside the Compute Shader**, independent of the Vertex Shader that will eventually draw the source curve.

Because we adopted the strict **SoA (Structure of Arrays)** memory ABI for Type 2 parameters, the Compute Shader executing `SamplePath` can trivially read the control points of the source curve from `arena_out`.

### The `SamplePath` WGSL Kernel (Conceptual Output)

```wgsl
// This kernel runs N times (e.g., 500 threads for 500 instances)
@compute @workgroup_size(64, 1, 1)
fn compute_sample_path(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let gid = global_id.x;
    if (gid >= 500u) { return; }

    // 1. Fetch 't' for this specific instance (driven by Domain.rank)
    // t_offset was allocated by the compiler for the input port
    let t = arena_out[t_offset + gid];

    // 2. Fetch the Source Curve's parameters
    // Because the source curve is just 1 instance (a Scalar), its Lane Count is 1.
    // So its SoA stride is just 1. We read the exact same memory the Vertex Shader will read later!
    let path_base = path_param_offset;
    let p0 = vec2<f32>(arena_out[path_base + 0u], arena_out[path_base + 1u]);
    let p1 = vec2<f32>(arena_out[path_base + 2u], arena_out[path_base + 3u]);
    let p2 = vec2<f32>(arena_out[path_base + 4u], arena_out[path_base + 5u]);
    let p3 = vec2<f32>(arena_out[path_base + 6u], arena_out[path_base + 7u]);

    // 3. Evaluate the Cubic Bezier at 't'
    let u = 1.0 - t;
    let u2 = u * u;
    let u3 = u2 * u;
    let t2 = t * t;
    let t3 = t2 * t;

    // Position
    let pos = (u3)*p0 + (3.0*u2*t)*p1 + (3.0*u*t2)*p2 + (t3)*p3;

    // Tangent (Derivative)
    let tangent = (3.0*u2)*(p1 - p0) + (6.0*u*t)*(p2 - p1) + (3.0*t2)*(p3 - p2);
    let safe_tangent = normalize(tangent + vec2<f32>(0.00001, 0.00001));

    // 4. Write back to the target instance's SoA layout
    // Now, these 500 scattered positions are ready for StepRender to consume
    arena_out[target_pos_x_offset + gid] = pos.x;
    arena_out[target_pos_y_offset + gid] = pos.y;
    arena_out[target_tan_x_offset + gid] = safe_tangent.x;
    arena_out[target_tan_y_offset + gid] = safe_tangent.y;
}
```

---

## 5. Machine Verifiable Acceptance Criteria

To ensure the compiler migration to `InstanceDomain` is flawless:

**AC 1: Zero-Allocation Intrinsics**
* *Test:* Compile a patch with `InstanceDomain(100) -> rank -> Math.Multiply(5.0) -> Render.scale`.
* *Assert:* The compiler must allocate exactly **ONE** `arena_out` block (for `Render.scale`). It must **NOT** allocate a block for `rank`. The `Math.Multiply` Naga expression must directly inline the `gid.x / 99.0` division.

**AC 2: Organic Halton Scattering**
* *Test:* Compile `InstanceDomain(256) -> index -> ScatterUV -> Render.positionXY`.
* *Assert:* Inspect the WebGPU pipeline output. The shapes must be visually distributed evenly across a `[0,1]` bounding box with no discernible overlapping rows or columns.

**AC 3: Cross-Cardinality Attribute Transfer (`SamplePath`)**
* *Test:* `CubicBezier(laneCount: 1)` wired to `SamplePath.path`. `InstanceDomain(10) -> rank` wired to `SamplePath.t`. `SamplePath.position` wired to `Render.positionXY`.
* *Assert:* The Compute Shader generated for `SamplePath` must use a base read offset of `0` for `p0, p1, p2, p3` (Scalar broadcast) but write to a target offset using `+ gid` (Field iteration).

### The Verdict

By deleting `GridBasis` and introducing `InstanceDomain` + `ScatterUV` + `SamplePath`, you turn your engine from a grid-placer into a true relational dataflow engine. The topology mapping happens in mathematical space, giving artists the ability to build flocks, swarms, and organic flow paths natively.