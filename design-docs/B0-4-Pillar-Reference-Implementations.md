# B0: 4-Pillar Reference Implementations

**Status:** Canonical Reference
**Subject:** Worked block lowering examples demonstrating the 4-Pillar architecture end-to-end
**Prerequisite:** Read `B0-4-Pillar-Arch.md` for the architecture definition
**Source:** Extracted from design conversation (B1-Block-Library-RAW.md, now removed)

---

## 1. Blocks Are Not 1:1 With Shaders

A "Block" is an authoring concept. A single block might compile into:

- **Zero shaders** — if it's a pure math routing node (e.g., `Add`, `Multiply`)
- **A single WGSL snippet** — injected into the Uber Shader's `compute_main` pass
- **An entire sequence of distinct WebGPU Compute Passes** — e.g., `EulerianFluidSolver` compiles to ~30 sequential passes

The block-to-shader relationship is determined by the block's data dependencies and synchronization requirements.

---

## 2. Key Compiler Concepts

### Uniform vs. Varying Resolution

When lowering block inputs, the compiler must distinguish between two resolution modes:

| Mode | GPU Semantics | When To Use | Example |
|------|--------------|-------------|---------|
| **Uniform** (Constant/Signal) | Identical for every thread in a dispatch | Parameter *must* be the same for all instances | `simResolution` — grid size of a fluid solver |
| **Varying** (Dataflow/Field) | Evaluated uniquely per thread (`gid.x`) | Parameter *can* differ per instance | `ejectThreshold` — could be a global scalar OR a spatially-varying noise field |

A Uniform input returns a static integer or scalar arena offset that the shader reads once. A Varying input returns an AST expression (e.g., `arena_in[offset + gid.x * stride]`) inlined into the compute kernel's per-thread loop.

The frontend compiler enforces this distinction during type checking — wiring a `Field` into a Uniform-only port fails early validation.

### Pure Lowering Functions

All lowering functions are **pure / referentially transparent**. They return a `LoweredBlock` record rather than mutating builder state:

```typescript
interface LoweredBlock {
    outputProxy: ResourceProxyId | MaterialProxyId | null;
    arenaRequests: ArenaFieldRequest[];
    textureRequests: TextureRequest[];
    computePasses: CompiledComputePassSpec[];
    renderIntents: RenderIntentSpec[];
}
```

The compiler orchestrator (a fold/reduce loop) takes these records and purely concatenates dependencies and passes. This enables:
- **Dead Code Elimination:** if `outputProxy` is never routed to a `RenderIntent`, drop the `LoweredBlock` entirely
- **Caching:** if inputs to the node haven't changed, reuse the previous `LoweredBlock` output

---

## 3. Reference: EulerianFluidSolver (Pillar 1 — Generator)

A `SolverResourceSource` that compiles into a sub-graph of multiple sequential compute passes. Eulerian fluids require global memory barriers between steps (you cannot calculate Pressure until Divergence is fully calculated for every cell).

### 3.1 Lowering

The compiler does three things:
1. Registers input parameters (viscosity, splat radius) to be evaluated by `compute_main` and written to the `ArenaValueStore`
2. Requests transient 2D textures (ping-pong buffers for the solver)
3. Emits a hardcoded sequence of compute passes into the scheduler

```typescript
function lowerEulerianFluidSolver(node: FluidBlock, inputProxies: BlockInputs): LoweredBlock {
    // 1. Resolve parameters (evaluated in the standard compute_main pass)
    const simRes = resolveUniform(node.inputs.simResolution, 256);
    const viscosityExpr = resolveVarying(node.inputs.viscosity);

    // 2. Define the output Proxy
    const proxyId = allocateResourceProxy({
        kind: 'Texture2D',
        width: simRes,
        height: simRes,
        format: 'rgba16float'
    });

    const dispatchSize = [Math.ceil(simRes / 16), Math.ceil(simRes / 16), 1];

    // 3. Build the sequential passes
    const computePasses = [
        { passId: `${node.id}_splat`, dispatch: dispatchSize,
          astPayload: buildFluidSplatAST(viscosityExpr) },
        { passId: `${node.id}_curl`, dispatch: dispatchSize,
          astPayload: FLUID_CURL_AST },
        { passId: `${node.id}_divergence`, dispatch: dispatchSize,
          astPayload: FLUID_DIVERGENCE_AST },
        // Iterative pressure solver: 25 Jacobi iterations ping-ponging A/B textures
        ...Array.from({ length: 25 }, (_, i) => ({
            passId: `${node.id}_pressure_iter_${i}`,
            dispatch: dispatchSize,
            astPayload: buildPressureIterAST(i)
        })),
        { passId: `${node.id}_advect`, dispatch: dispatchSize,
          astPayload: FLUID_ADVECT_AST },
    ];

    return {
        outputProxy: proxyId,
        arenaRequests: [],
        textureRequests: [
            // Ping-pong buffers for the solver
            { id: 'fluid_velocity_A', width: simRes, height: simRes, format: 'rgba16float' },
            { id: 'fluid_velocity_B', width: simRes, height: simRes, format: 'rgba16float' },
            { id: 'fluid_dye_A',      width: simRes, height: simRes, format: 'rgba16float' },
            { id: 'fluid_dye_B',      width: simRes, height: simRes, format: 'rgba16float' },
            { id: 'fluid_pressure_A', width: simRes, height: simRes, format: 'r16float' },
            { id: 'fluid_pressure_B', width: simRes, height: simRes, format: 'r16float' },
        ],
        computePasses,
        renderIntents: [],
    };
}
```

**Why static WGSL kernels:** We keep the fluid logic as static solver kernels. We do not try to build fluid math out of dynamic AST nodes. The compiler's only job is to wire the user's inputs (like an LFO driving `viscosity`) to the symbolic memory references those static kernels expect.

### 3.2 Resulting IR

```json
{
  "nodeId": "fluid_node_01",
  "kind": "SolverResourceSource",
  "sourceBindings": {
    "simResolution": { "type": "Constant", "value": 256 },
    "viscosity": { "type": "ArenaSymbol", "symbolId": "param:fluid_01_visc" }
  },
  "transientDependencies": [
    "fluid_velocity_A", "fluid_velocity_B",
    "fluid_dye_A", "fluid_dye_B"
  ],
  "output": {
    "proxyId": "proxy_texture_dye_01",
    "semanticType": "Texture2D_RGBA"
  }
}
```

### 3.3 Scheduled Pass Roster

| Pass | ID | Action |
|------|----|--------|
| 0 | `compute_main` | Evaluate all user math (LFOs, noise fields). Write `viscosity` value to arena. |
| 1 | `fluid_node_01_splat` | Read mouse input + arena viscosity. Write impulses to `fluid_velocity_A` and `fluid_dye_A`. |
| 2 | `fluid_node_01_curl` | Curl computation |
| 3 | `fluid_node_01_divergence` | Divergence computation |
| 4–28 | `fluid_node_01_pressure_iter_N` | Ping-pong between `pressure_A` and `pressure_B` textures 25 times |
| 29 | `fluid_node_01_advect` | Push dye/velocity through grid via bilinear sampling. Write final frame to `fluid_dye_A`. |

Downstream passes that read `proxy_texture_dye_01` are guaranteed to be scheduled *after* pass 29.

### 3.4 ABI Payload (JS → WASM)

```json
{
  "manifest": {
    "arenaRequirements": {
      "scalars": ["param:fluid_01_visc"]
    },
    "transientTextures": [
      { "id": "tex_100", "width": 256, "height": 256, "format": "rgba16float" },
      { "id": "tex_101", "width": 256, "height": 256, "format": "rgba16float" },
      { "id": "tex_102", "width": 256, "height": 256, "format": "r16float" },
      { "id": "tex_103", "width": 256, "height": 256, "format": "r16float" }
    ]
  },
  "computePasses": [
    {
      "passId": "eval_params",
      "dispatch": [128, 1, 1],
      "astPayload": { "/* NagaModuleIR_TS — the compute_main AST */" : true }
    },
    {
      "passId": "fluid_splat",
      "dispatch": [16, 16, 1],
      "astPayload": { "/* NagaModuleIR_TS — static fluid kernel */" : true },
      "textureBindings": [
        { "group": 0, "binding": 0, "resourceId": "tex_100" },
        { "group": 0, "binding": 1, "resourceId": "tex_101" }
      ]
    }
  ]
}
```

The Rust runtime reads this, calls `device.create_texture` for items in `transientTextures`, loops over `computePasses`, pipes `astPayload` through Naga to build the pipeline, binds the exact texture IDs requested, and calls `dispatch_workgroups`. **Rust has no idea it is simulating fluid.** It is just executing a 2D compute graph.

---

## 4. Reference: InstanceDomain (Structural — Pre-Pillar)

`InstanceDomain` is the invisible heartbeat. If `EulerianFluidSolver` is a heavy multi-pass memory consumer, `InstanceDomain` is the exact opposite. It consumes **zero VRAM** for its outputs, acting entirely as a mathematical intrinsic.

### 4.1 Lowering

The compiler solves two problems simultaneously: VRAM allocation (static) and active instance count (modulatable per-frame). It does *not* allocate arrays for `rank` or `index` — instead it registers them as hardware intrinsics.

```typescript
function lowerInstanceDomain(node: InstanceDomainBlock, inputProxies: BlockInputs): LoweredBlock {
    // 1. Resolve the requested count.
    // If it's a UI slider (0 to 50,000), maxCapacity is 50,000.
    const countExpr = resolveVarying(node.inputs.count);
    const maxCapacity = countExpr.staticMaximum || 10000;

    // 2. Emit the Intrinsics (Zero Allocation!)
    // Instead of pointing to memory, we return AST expression generators.
    const indexIntrinsic = { type: 'Intrinsic', name: 'global_invocation_id.x' };
    const rankIntrinsic = {
        type: 'BinaryOp', op: 'Div',
        left: { type: 'Intrinsic', name: 'f32(global_invocation_id.x)' },
        right: { type: 'BinaryOp', op: 'Sub',
            left: { type: 'SymbolicLoad', symbolId: 'sys:active_lanes' },
            right: { type: 'LiteralF32', value: 1.0 }
        }
    };

    return {
        outputProxy: { kind: 'DomainProxy', maxCapacity, indexIntrinsic, rankIntrinsic },
        arenaRequests: [
            // Only the active_lanes scalar — the intrinsics themselves are zero-allocation
            { field: 'active_lanes', type: 'scalar' }
        ],
        textureRequests: [],
        computePasses: [],  // Does NOT generate its own compute pass
        renderIntents: [],
    };
}
```

**Why hardware intrinsics:** In legacy visual programming, "Grid" nodes physically generated X/Y coordinates and stored them in memory. In WebGPU, the thread ID *is* the index. By emitting AST intrinsics, any downstream math node that uses `Domain.rank` simply inlines the math `(gid.x / active_lanes)` directly into ALU instructions, bypassing slow VRAM reads entirely.

### 4.2 Resulting IR

```json
{
  "nodeId": "domain_01",
  "kind": "InstanceDomain",
  "allocationLimit": 50000,
  "dynamicCountState": {
    "type": "ArenaSymbol",
    "symbolId": "sys:active_lanes"
  },
  "outputs": {
    "index": { "type": "Intrinsic", "expression": "gid.x" },
    "rank": { "type": "Intrinsic", "expression": "(f32(gid.x) / (f32(active_lanes) - 1.0))" }
  }
}
```

### 4.3 Scheduled Pass Roster

`InstanceDomain` **does not generate its own compute pass**. Its metadata infects the rest of the schedule:

| Pass | ID | Action |
|------|----|--------|
| 0 | `compute_main` | Evaluates the `count` slider, writes result to `active_lanes`. Dispatched with `ceil(maxCapacity / 64)` workgroups. Threads check `if (gid.x >= active_lanes) { return; }` to mask inactive instances. |
| N | `sys_draw_prep` | Reads `active_lanes`, writes `instance_count` into the `DrawIndirectArgs` struct. |

### 4.4 ABI Payload (JS → WASM)

```json
{
  "manifest": {
    "arenaRequirements": {
      "globalCapacity": 50000,
      "scalars": ["sys:active_lanes"]
    }
  },
  "computePasses": [
    {
      "passId": "compute_main",
      "dispatch": [782, 1, 1],
      "astPayload": { "/* Contains the inlined rank and index math */" : true }
    },
    {
      "passId": "sys_draw_prep",
      "dispatch": [1, 1, 1],
      "astPayload": { "/* Reads active_lanes, writes DrawIndirectArgs */" : true }
    }
  ]
}
```

Rust doesn't know what a "Domain" is. It only sees total memory requirements and a dynamic scalar driving indirect arguments.

---

## 5. Reference: EjectFluidSpray (Pillar 2 — Modifier)

A Modifier that bridges a `SolverResource` (fluid textures) and a `ParticlePool` (SoA arena memory). It reads from one, writes to the other, and outputs a modified proxy handle.

**Critical boundary note:** The JS compiler acts purely as a semantic orchestrator. It knows *what* fields are required (position, velocity, age) and *how* they interact (the AST logic), but it defers the physical memory layout entirely to the Rust MMU.

### 5.1 Lowering

```typescript
function lowerEjectFluidSpray(node: SprayBlock, inputProxies: BlockInputs): LoweredBlock {
    const particleProxy = inputProxies.target as ParticlePoolProxy;
    const fluidProxy = inputProxies.fluidData as SolverResourceProxy;
    const thresholdExpr = resolveVarying(node.inputs.ejectThreshold);

    // Pure AST generation
    const astPayload = buildEjectSprayAST(particleProxy.capacity, thresholdExpr.symbolicId);

    return {
        outputProxy: particleProxy,  // Passes the modified pool downstream
        arenaRequests: [
            // Declare symbolic state requirements — JS does NOT calculate bytes
            { proxyId: particleProxy.id, field: 'pos_x', type: 'f32' },
            { proxyId: particleProxy.id, field: 'pos_y', type: 'f32' },
            { proxyId: particleProxy.id, field: 'vel_x', type: 'f32' },
            { proxyId: particleProxy.id, field: 'vel_y', type: 'f32' },
            { proxyId: particleProxy.id, field: 'age',   type: 'f32' },
        ],
        textureRequests: [],  // Fluid solver already requested textures, we just read them
        computePasses: [{
            passId: `${node.id}_eject_spray`,
            dispatch: [Math.ceil(particleProxy.capacity / 64), 1, 1],
            astPayload,
            textureDependencies: [fluidProxy.textures.velocity]
        }],
        renderIntents: [],
    };
}
```

**No validation in lowering:** The frontend compiler has already verified that `inputs.target` is a `ParticlePool` and `inputs.fluidData` is a `SolverResource`. The lowering function just lowers.

### 5.2 Resulting IR

```json
{
  "nodeId": "modifier_spray_01",
  "kind": "Modifier",
  "modifierType": "EjectFluidSpray",
  "inputs": {
    "target": "proxy_particle_pool_01",
    "fluidData": "proxy_texture_dye_01"
  },
  "sourceBindings": {
    "ejectThreshold": { "type": "ArenaSymbol", "symbolId": "param:spray_01_thresh" }
  },
  "requiredFields": [
    "pool_01:pos_x", "pool_01:pos_y",
    "pool_01:vel_x", "pool_01:vel_y",
    "pool_01:age"
  ],
  "output": {
    "proxyId": "proxy_particle_pool_01_modified",
    "semanticType": "ParticlePool"
  }
}
```

### 5.3 Scheduled Pass Roster

Because this block depends on the fluid solver finishing, the scheduler guarantees topological sorting:

| Pass | ID | Action |
|------|----|--------|
| 0 | `compute_main` | Evaluate `ejectThreshold` parameter (e.g., if driven by an LFO), write to arena |
| 1–29 | `EulerianFluidSolver` passes | Splat, Curl, Divergence, Pressure, Advect — fluid grid fully updated |
| 30 | `modifier_spray_01_eject_spray` | 50,000 threads. Dead particles sample fluid velocity texture at random UV; if velocity > threshold, respawn. Alive particles apply ballistic physics. |
| 31 | `sys_draw_prep` | Calculate indirect arguments |
| Render | Draw | Render the droplets using updated SoA arena data |

### 5.4 ABI Payload (JS → WASM)

```json
{
  "manifest": {
    "arenaRequirements": {
      "globalCapacity": 50000,
      "scalars": ["param:spray_01_thresh", "sys:active_lanes"],
      "fields": [
        "pool_01:pos_x", "pool_01:pos_y",
        "pool_01:vel_x", "pool_01:vel_y",
        "pool_01:age"
      ]
    },
    "transientTextures": [
      { "id": "tex_fluid_vel", "width": 256, "height": 256, "format": "rgba16float" }
    ]
  },
  "computePasses": [
    {
      "passId": "eject_fluid_spray",
      "dispatch": [782, 1, 1],
      "astPayload": {
        "/* NagaModuleIR_TS — contains SymbolicLoad('pool_01:pos_x') etc. */" : true
      },
      "textureBindings": [
        { "group": 0, "binding": 1, "resourceId": "tex_fluid_vel" }
      ]
    }
  ]
}
```

### 5.5 Rust MMU Resolution

When Rust receives this payload, the `GpuMemoryArena` does the heavy lifting:

1. **Calculate stride** — reads `globalCapacity` of 50,000, computes necessary padding for 256-bit alignment
2. **Assign offsets** — loops through `fields` array. `"pool_01:pos_x"` gets offset `0`. `"pool_01:pos_y"` gets offset `50,000 * 4 bytes`, etc.
3. **Allocate** — sums exact byte total, calls `device.create_buffer`
4. **Patch the AST** — walks the `astPayload`. Every `SymbolicLoad("pool_01:pos_x")` becomes physical Naga IR math: `base_offset + (lane_stride * gid.x)`
5. **Compile** — hands patched AST to Naga, caches the pipeline

By keeping byte calculation in Rust: no precision errors in JS, WebGPU alignment rules strictly followed by native graphics API, JS compiler stays hardware-agnostic.

### 5.6 WGSL Kernel (Conceptual)

The compute kernel that Rust compiles from the AST. Shown in WGSL for readability — the actual source is a Naga AST, not a string:

```wgsl
@compute @workgroup_size(64, 1, 1)
fn compute_fluid_spray(@builtin(global_invocation_id) gid: vec3<u32>) {
    let lane = gid.x;
    if (lane >= 50000u) { return; }

    // Read current particle state from SoA Arena
    var pos = vec2<f32>(arena_in[pos_x + lane], arena_in[pos_y + lane]);
    var vel = vec2<f32>(arena_in[vel_x + lane], arena_in[vel_y + lane]);
    var age = arena_in[age_offset + lane];

    if (age <= 0.0) {
        // --- SPAWNING PHASE (Particle is Dead) ---

        // 1. Generate pseudo-random UV based on lane ID and time
        let rand_uv = hash22(vec2<f32>(f32(lane), global.time_seconds));

        // 2. Sample the fluid grid at that random location
        let fluid_vel = textureSampleLevel(tex_fluid_velocity, linear_sampler, rand_uv, 0.0).xy;
        let fluid_speed = length(fluid_vel);

        // 3. If the fluid is violent enough, wake the particle up
        if (fluid_speed > threshold_param) {
            pos = rand_uv;                              // Snap to fluid surface
            vel = fluid_vel * 1.5 + random_scatter();   // Eject outward
            age = 1.0;                                  // Set lifespan to 100%
        }

    } else {
        // --- BALLISTIC PHASE (Particle is Alive) ---

        vel.y -= 9.8 * global.delta_time_seconds;       // Gravity
        pos += vel * global.delta_time_seconds;          // Integrate position
        age -= global.delta_time_seconds * 0.5;          // Decrease lifespan
    }

    // Write state back to SoA Arena
    arena_out[pos_x + lane] = pos.x;
    arena_out[pos_y + lane] = pos.y;
    arena_out[vel_x + lane] = vel.x;
    arena_out[vel_y + lane] = vel.y;
    arena_out[age_offset + lane] = age;
}
```

**Why zero atomics:** Particles randomly check the fluid grid independently. No `atomicAdd` needed for active particle counters. The GPU executes 50,000 threads in perfectly parallel isolation.

---

## 6. Reference: SprayDroplet + DrawInstances (Pillars 3 & 4 — Material + Intent)

Because this is the final boundary where compute data becomes pixels, we evaluate the Material and Intent together. The Material dictates *how* the data looks; the Intent instructs the Rust backend to actually *draw* it.

### 6.1 Lowering: SprayDroplet Material (Pillar 3)

The material generates a pure AST representing the fragment shader and vertex displacement (motion blur), returning a `MaterialProxy`. It does not compute — it runs in the Render Pass.

```typescript
function lowerSprayDropletMaterial(node: MaterialBlock, inputProxies: BlockInputs): LoweredBlock {
    const baseColor = node.inputs.baseColor;

    // Build the symbolic AST for the Uber Shader
    // Maps required SoA fields ('age', 'vel_x') to visual outputs (opacity, scale)
    const materialAst = buildDropletMaterialAST({
        colorInput: baseColor,
        // Symbolic requests: "Give me the age and velocity of whatever source I'm attached to"
        ageSymbol: "semantic:age",
        velXSymbol: "semantic:vel_x",
        velYSymbol: "semantic:vel_y"
    });

    return {
        outputProxy: { kind: 'MaterialProxy', id: `${node.id}_mat`, ast: materialAst },
        arenaRequests: [],    // Materials don't request structural memory, they evaluate it
        textureRequests: [],
        computePasses: [],    // Materials don't compute; they run in the Render Pass
        renderIntents: [],
    };
}
```

### 6.2 Lowering: DrawInstances Intent (Pillar 4)

The Intent block takes the Noun (`ResourceProxy`) and the Adjective (`MaterialProxy`) and emits the Verb (`RenderIntent`).

```typescript
function lowerDrawInstances(node: IntentBlock, inputProxies: BlockInputs): LoweredBlock {
    const source = inputProxies.source as ResourceProxyId;
    const material = inputProxies.material as MaterialProxyId;

    return {
        outputProxy: null,    // Terminal node; nothing downstream
        arenaRequests: [],
        textureRequests: [],
        computePasses: [],
        renderIntents: [{
            intentId: `${node.id}_draw`,
            sourceProxy: source,
            materialProxy: material,
            blendMode: 'additive',   // Presentation state only
            depthWrite: false,
        }],
    };
}
```

**Why the separation is absolute:** The `SprayDroplet` material doesn't know it's drawing fluid spray — it just knows it's drawing instances that have `age` and `velocity`. The `DrawInstances` block doesn't know what the material is — it just pairs a source and a material for the Rust backend.

### 6.3 Resulting IR

**Material IR:**

```json
{
  "nodeId": "mat_spray_01",
  "kind": "Material",
  "materialType": "SprayDroplet",
  "inputs": {
    "baseColor": { "type": "Constant", "value": [0.8, 0.9, 1.0] }
  },
  "requiredSemantics": ["age", "vel_x", "vel_y"],
  "output": {
    "proxyId": "proxy_mat_spray_01"
  }
}
```

**Intent IR:**

```json
{
  "nodeId": "intent_draw_01",
  "kind": "RenderIntent",
  "source": "proxy_particle_pool_01_modified",
  "material": "proxy_mat_spray_01",
  "renderState": {
    "blendMode": "additive",
    "depthWrite": false
  }
}
```

### 6.4 Scheduled Pass Roster (Complete Pipeline)

The grand finale — the full frame schedule for fluid + spray + rendering:

| Pass | ID | Action |
|------|----|--------|
| 0 | `compute_main` | Evaluate all user math parameters to Arena |
| 1–29 | `EulerianFluid_*` | Simulate fluid to Textures |
| 30 | `EjectFluidSpray` | Read fluid textures, update Particle Pool in Arena |
| 31 | `sys_draw_prep` | Read `active_lanes`, write `vertex_count` and `instance_count` to `DrawIndirectArgs` |
| Render | `intent_draw_01` | Bind Uber Shader pipeline, bind Arena SoA buffers, execute `draw_indirect` |

By the time the Render Pass runs, all data is perfectly baked. The render pass does zero computation other than projection and shading.

### 6.5 ABI Payload (JS → WASM) — Render Passes

```json
{
  "renderPasses": [
    {
      "passId": "intent_draw_01",
      "topologyType": "InstancedQuad",
      "pipelineState": {
        "blend": "additive",
        "depthWrite": false
      },
      "astPayload": {
        "/* Combined Material + Source NagaModuleIR_TS */": true,
        "/* Contains SymbolicLoad('pool_01:age') etc. */": true
      }
    }
  ]
}
```

### 6.6 Rust MMU Resolution for Render Passes

When the Rust backend receives the `renderPasses` array:

1. **AST Linking** — pipes the JS-provided `astPayload` into the Uber Shader template
2. **Physical Memory Patching** — looks up `"pool_01:age"` in its resolved physical memory map, patches the AST to read from that SoA offset using `instance_index`
3. **Pipeline Compilation** — creates the `wgpu::RenderPipeline` and caches it
4. **Execution** — during per-frame `tick()`, loops through `renderPasses`, binds the global Arena buffer to Group 0, sets the pipeline, calls `draw_indirect`

### 6.7 Material AST Builder (Conceptual)

Shows how the material builds its symbolic AST — the Rust side resolves symbols to physical offsets:

```typescript
function buildDropletMaterialAST(config: {
    colorInput: ExprIR,
    ageSymbol: string,
    velXSymbol: string
}): ShaderBlockIR {
    const statements: StatementIR[] = [];

    const age: ExprIR = { type: 'SymbolicLoad', symbolId: config.ageSymbol };
    const velX: ExprIR = { type: 'SymbolicLoad', symbolId: config.velXSymbol };

    // Fragment: fade out based on age
    const opacity: ExprIR = {
        type: 'BinaryOp', op: 'Mul',
        left: age,
        right: { type: 'LiteralF32', value: 1.0 }
    };

    // Output to Uber Shader hooks
    statements.push({ type: 'SymbolicStore', symbolId: 'uber_hook:out_color_alpha', value: opacity });
    statements.push({ type: 'SymbolicStore', symbolId: 'uber_hook:out_color_rgb', value: config.colorInput });

    // Vertex: stretch quad based on velocity (motion blur)
    // ... logic to write to 'uber_hook:vertex_offset'

    return { statements };
}
```

---

## 7. Reference: Grid of Squares (Simple Patch — All 4 Pillars)

A minimal patch that validates the architecture end-to-end: 100 squares in a 10x10 grid, each with unique rotation and color. Layout comes from raw math, not a specialized `GridLayout` block.

### 7.1 Block Graph

```
Time ──────────────────────────┐
                               │
InstanceDomain(count=100) ─┬───┼──────────────────────────────────────┐
                           │   │                                      │
    ┌──────────────────────┘   │                                      │
    │                          │                                      │
    ├─ .index ─┬─ Modulo(10) ─── Multiply(0.1) ──── posX ──┐        │
    │          │                                             │        │
    │          └─ Floor(Div(10)) ─ Multiply(0.1) ── posY ─┐ │        │
    │                                                      │ │        │
    ├─ .index ─── Multiply(0.5) ── Add(Time*2.0) ─ rot ─┐ │ │        │
    │                                                    │ │ │        │
    │               RectangleTopology(0.08, 0.08)        │ │ │        │
    │                         │                          │ │ │        │
    │                  TransformInstances ◄───────────────┘─┘─┘       │
    │                         │                                       │
    │                         │ ResourceProxyId                       │
    │                         │                                       │
    └─ .rank ─── Add(Time*0.2) ─── ColorHSL(h, 0.8, 0.6)            │
                                          │                           │
                                   UnlitMaterial                      │
                                          │                           │
                                          │ MaterialProxyId           │
                                          │                           │
                                   DrawInstances ◄────────────────────┘
```

### 7.2 Block-by-Block Breakdown

**Global Context & Domain:**
- `Time` — outputs a `Scalar` (Uniform) representing seconds
- `InstanceDomain(count=100)` — locks SoA capacity to 100, outputs `index` (0–99) and `rank` (0.0–1.0) as `Field` intrinsics

**Layout Math (No GridLayout block):**
- `grid_x = Modulo(Domain.index, 10)` — column from 1D index
- `grid_y = Floor(Divide(Domain.index, 10))` — row from 1D index
- `pos_x = Multiply(grid_x, 0.1)` — spacing
- `pos_y = Multiply(grid_y, 0.1)` — spacing

Because `index` is a `Field`, these math blocks implicitly generate per-thread compute kernel code.

**Pillar 1 — Generator:**
- `RectangleTopology(width=0.08, height=0.08)` — outputs `ResourceProxyId` for a 4-vertex indexed quad. No position or rotation yet.

**Pillar 2 — Modifier:**
- `TransformInstances(target=rect, posX, posY, rotation=final_rot)` — allocates `pos_x`, `pos_y`, `rot` SoA fields. Emits a compute pass that evaluates the entire layout and rotation math tree.
- Rotation: `final_rot = Add(Multiply(Time, 2.0), Multiply(Domain.index, 0.5))` — each instance rotates at the same speed but starts at a different angle

**Pillar 3 — Material:**
- `hue = Add(Domain.rank, Multiply(Time, 0.2))` — sweeps color through the rainbow across the grid, animating over time
- `ColorHSL(h=hue, s=0.8, l=0.6)` → `UnlitMaterial(baseColor=...)` — outputs `MaterialProxyId`

**Pillar 4 — Intent:**
- `DrawInstances(source=transformed_rect, material=unlit)` — the thin execution command

### 7.3 ABI Payload (JS → WASM)

```json
{
  "manifest": {
    "arenaRequirements": {
      "globalCapacity": 100,
      "scalars": ["sys:time"],
      "fields": ["rect_01:pos_x", "rect_01:pos_y", "rect_01:rot"]
    }
  },
  "computePasses": [
    {
      "passId": "eval_transform_math",
      "dispatch": [2, 1, 1],
      "astPayload": {
        "statements": [
          {
            "type": "SymbolicStore",
            "symbolId": "rect_01:pos_x",
            "value": {
              "type": "BinaryOp", "op": "Mul",
              "left": {
                "type": "BinaryOp", "op": "Mod",
                "left": { "type": "Intrinsic", "name": "gid.x" },
                "right": { "type": "LiteralF32", "value": 10 }
              },
              "right": { "type": "LiteralF32", "value": 0.1 }
            }
          }
        ]
      }
    }
  ],
  "renderPasses": [
    {
      "passId": "draw_grid",
      "topologyType": "RectangleQuad",
      "astPayload": { "/* Material AST: HSL math based on rank and time */" : true }
    }
  ]
}
```

### 7.4 Architecture Validation

| Goal | Met? | How |
|------|------|-----|
| Layout from math? | Yes | `Modulo` and `Floor` generate the grid. Swap for `Sine`/`Cosine` to get a circle — `TransformInstances` doesn't care. |
| Rotation unique per instance? | Yes | `Domain.index * 0.5` gives each instance a different starting angle. |
| Color unique per instance? | Yes | `Domain.rank` maps each instance to a different hue across the rainbow. |
| No God Objects? | Yes | `RectangleTopology` knows nothing about grids. `TransformInstances` knows nothing about color. `DrawInstances` knows nothing about math. |
| JS/Rust boundary? | Yes | JS emits `SymbolicStore` for `"rect_01:pos_x"`. Rust MMU resolves to physical byte offsets. |

---

## 8. The `positionX` Flow (How Spatial Data Reaches the Renderer)

A common question: "Where is `positionX`? How does it get from math to pixels?"

In the 4-Pillar model, spatial transformations are **Pillar 2: Modifiers**. You do not wire spatial math directly into a Render block.

**The exact flow:**

```
InstanceDomain.rank → Math.Multiply(10.0) → TransformInstances.positionX
                                                       │
                                                       ▼
                                              ResourceProxyId
                                                       │
                                                       ▼
                                              RenderIntent.source
```

1. **Source (Pillar 1):** `PointTopology` — outputs a `ResourceProxyId` representing a blank slate of geometry
2. **Modifier (Pillar 2):** `TransformInstances` — has `geometryIn` port (receives the proxy) and `Field` input ports for `positionX`, `positionY`, `scale`, etc.
3. **Math:** `InstanceDomain.rank` → `Multiply(10.0)` → `TransformInstances.positionX`
4. **Output:** `TransformInstances` outputs a *new* `ResourceProxyId`
5. **Intent (Pillar 4):** Wire that new `ResourceProxyId` into `RenderIntent.source`

**How it compiles:** The compiler sees `TransformInstances.positionX` and allocates an SoA slot for it in the manifest. It takes the math (`rank * 10.0`) and compiles it into the `compute_main` pass. The `RenderIntent` tells the Rust backend: "When you execute the Draw pass, look at the SoA slot assigned for `positionX`."
