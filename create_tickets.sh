export EPOCH=$(date +%s)

id3=$(pnpm exec lnks new --topic phase-3 --type epic --title "PHASE 3 EPIC: The 2.5D MatCap Upgrade" --description "This Epic introduces 2.5D rendering capabilities, enabling MatCap shading, true Z-buffer depth sorting, and Orthographic projection.

Key Objectives:
1. Transition from pure 2D screenspace to an Orthographic View-Projection Camera model.
2. Implement Render Queue routing: Opaque (Z-buffer) vs Transparent (CPU Radix sort, Back-to-Front).
3. Introduce MatCap material nodes that transform 2D/2.5D normals into View Space to sample spherical materials." | grep -o 'lit-[^ ]*' | head -1)

id3_1=$(pnpm exec lnks new --topic phase-3-ortho --type feature --title "Implement Orthographic View-Projection Matrix system" --description "Canonical feature ticket for introducing an Orthographic Camera model for 2.5D rendering.

Goal:
- Transition from pure 2D screenspace logic to an Orthographic View-Projection Matrix system.

Feature contract:
- Build the View Matrix (V) and Projection Matrix (P). For isometric 2.5D, standard camera angle is rotated 30 degrees on X, 45 degrees on Y.
- Orthographic projection: the 'w' component of output positions must strictly remain 1.0 (no perspective divide).
- The View-Projection matrix is calculated on the CPU and uploaded as a global Uniform Buffer Object (UBO).

Implementation requirements:
- Replace direct screen-space mapping in the Uber Shader with: \`gl_Position = global.view_proj_matrix * model_matrix * vec4<f32>(local_pos, 0.0, 1.0);\`
- Ensure sub-pixel jitter is avoided by snapping the camera's world position to the screen pixel size relative to world units.

Acceptance criteria:
- Quads map correctly into NDC coordinates via View-Proj matrix with \`w == 1.0\`.
- Moving the camera transforms all rendered entities cohesively." | grep -o 'lit-[^ ]*' | head -1)

id3_2=$(pnpm exec lnks new --topic phase-3-sort --type feature --title "Implement Opaque vs Transparent Render Queue routing and CPU Radix Sort" --description "Canonical feature ticket for Z-Sorting and Transparency in 2.5D mode.

Goal:
- Implement a dual-phase render queue: Opaque (Z-buffered) and Transparent (Z-sorted, back-to-front).

Feature contract:
- Opaque Queue: unordered draw calls where Depth Write is TRUE (\`glDepthMask(GL_TRUE)\`). Alpha acts as a binary cutout.
- Transparent Queue: strictly ordered (Back-to-Front) draw calls where Depth Write is strictly FALSE, but Depth Test remains TRUE.

Implementation requirements:
- Generate a 64-bit Sort Key on the CPU for transparent objects: \`uint64_t key = (depth << 32) | (material_id << 16) | instance_id;\`
- Implement a CPU Radix Sort loop to handle transparent routing efficiently.
- In the Rust Render Loop, ensure the pipeline switches correctly between Opaque PSOs and Transparent PSOs, ensuring state (\`depthWriteEnabled\`) is correctly toggled.

Acceptance criteria:
- Opaque objects successfully occlude transparent objects using the Z-buffer.
- Transparent objects correctly non-commutatively blend back-to-front, evaluated via visual/pixel inspection." | grep -o 'lit-[^ ]*' | head -1)

id3_3=$(pnpm exec lnks new --topic phase-3-matcap --type feature --title "Implement MatCap material node and Uber Shader normal transformation" --description "Canonical feature ticket for Material Capture (MatCap) shading.

Goal:
- Render extruded/beveled 2.5D shapes using MatCap spherical textures driven by surface normals.

Feature contract:
- Input: \`matcap\` texture and \`normal\` vector from the evaluated parametric shapes.
- Outputs: Lit fragments resolving the 2.5D visual aesthetic.

Implementation requirements:
- Ensure all normal vectors inside the shader are strictly normalized to length 1.0.
- Transform the world-space normal into View-Space using the Inverse-Transpose matrix: \`N_view = (M_inv)^T * N_world\`.
- Generate the UV map for the MatCap sampler: \`vec2<f32> matcap_uv = normal_view.xy * 0.5 + 0.5;\`
- Introduce a smoothing angle threshold (e.g. 45deg) for mesh generation so adjacent faces either share a smoothed normal or split into a sharp edge to prevent 'muddy' bevels.

Acceptance criteria:
- MatCap correctly shades shapes based on normal orientation.
- View-Space normals of \`(0,0,1)\` correctly sample the dead center \`(0.5, 0.5)\` of the MatCap texture." | grep -o 'lit-[^ ]*' | head -1)

pnpm exec lnks parent set $id3_1 $id3
pnpm exec lnks parent set $id3_2 $id3
pnpm exec lnks parent set $id3_3 $id3

id4=$(pnpm exec lnks new --topic phase-4 --type epic --title "PHASE 4 EPIC: Compute Dynamics (Fluid & Physics)" --description "This Epic tracks the evolution from Kinematics to Dynamics, enabling particle interactions, collisions, and fluid simulation.

Key Objectives:
1. Extend Naga compiler with atomic operations for race-condition safety.
2. Introduce Ping-Pong double-buffered state to avoid read-after-write hazards.
3. Implement Spatial Hashing grids to compute particle neighborhood logic efficiently." | grep -o 'lit-[^ ]*' | head -1)

id4_1=$(pnpm exec lnks new --topic phase-4-atomic --type feature --title "Extend NagaEmitterInstruction with Atomic operations (AtomicAdd, AtomicExchange)" --description "Canonical feature ticket for adding Atomic operation support to the Naga/WGSL compiler.

Goal:
- Provide atomic intrinsics in the visual node graph to allow safe counting and concurrency management in compute shaders.

Feature contract:
- Expand \`NagaEmitterInstruction\` with \`AtomicAdd\`, \`AtomicSub\`, \`AtomicExchange\`, and \`AtomicCompareExchange\`.
- Translates to \`atomicAdd()\` and related WGSL built-ins.

Implementation requirements:
- Ensure atomic targets are strictly bound to SSBO storage variables designated with \`read_write\` access.
- Validate that atomic nodes accept \`ExprHandle\`s representing atomic pointers.
- Extend \`NagaBuilder\` in Rust to correctly emit \`Statement::Atomic\` nodes into the Naga Arena.

Acceptance criteria:
- A graph that uses \`AtomicAdd\` successfully compiles without Naga validation errors.
- 10,000 threads can safely increment a shared counter in \`arena_out\`." | grep -o 'lit-[^ ]*' | head -1)

id4_2=$(pnpm exec lnks new --topic phase-4-pingpong --type feature --title "Implement Ping-Pong double-buffered State for planStatefulStorage" --description "Canonical feature ticket for resolving Read-After-Write hazards in dynamics simulation.

Goal:
- Ensure computational causal safety: Frame N must read from the finalized state of Frame N-1 while writing Frame N.

Implementation requirements:
- Update \`planStatefulStorage\` to allocate two identical memory buffers.
- Introduce ping-pong dispatch logic in the Rust Render/Compute loop, swapping Bind Group 0 (Read) and Bind Group 1 (Write) pointers per frame.
- Ensure the \`StateRead\` IR instruction implicitly targets the \`Read\` buffer, and \`StateWrite\` targets the \`Write\` buffer.

Acceptance criteria:
- Complex simulations with feedback loops evaluate stably without tearing.
- No single compute invocation reads a value written by another thread in the same frame." | grep -o 'lit-[^ ]*' | head -1)

id4_3=$(pnpm exec lnks new --topic phase-4-spatial --type feature --title "Implement Spatial Hashing compute blocks for local collision detection" --description "Canonical feature ticket for localized Dynamics and fluid simulation capabilities.

Goal:
- Implement Spatial Hashing to allow O(N) particle collision detection instead of O(N^2).

Implementation requirements:
- Use the newly available atomic operations to implement a compute block that builds a Linked List per Grid Cell.
- Pass 1: Clear grid counters.
- Pass 2: Each particle computes its 2D cell index, executes an \`AtomicAdd\` to increment the cell count, and an \`AtomicExchange\` to link itself into the cell's linked list.
- Pass 3: Evaluate physics by reading the neighboring cells from the hash grid.

Acceptance criteria:
- Particles successfully react to each other based on spatial proximity without locking the GPU execution unit." | grep -o 'lit-[^ ]*' | head -1)

pnpm exec lnks parent set $id4_1 $id4
pnpm exec lnks parent set $id4_2 $id4
pnpm exec lnks parent set $id4_3 $id4

id5=$(pnpm exec lnks new --topic phase-5 --type epic --title "PHASE 5 EPIC: Textures & Type 5 Shapes (MSDF Text)" --description "This Epic tracks the introduction of sampled texture capabilities, specifically focusing on Multi-Channel Signed Distance Fields (MSDF) for text rendering.

Key Objectives:
1. Expand Resource Library to support Texture Atlases.
2. Implement CPU-side text shaping and layout.
3. Handle sub-pixel anti-aliased MSDF decoding in the Uber Shader." | grep -o 'lit-[^ ]*' | head -1)

id5_1=$(pnpm exec lnks new --topic phase-5-atlas --type feature --title "Implement Texture Atlas Bindings and Resource Library expansion" --description "Canonical feature ticket for texture management in the compiler.

Goal:
- Expand the \`ResourceLibrary\` to safely handle, pack, and bind textures to the GPU.

Implementation requirements:
- Pack multiple source textures into a \`sampler2DArray\` (Texture Array) to avoid breaking draw batching across different materials.
- Introduce \`TextureDefinition\` into the Patch root.
- Ensure \`Compile Resource Library\` phase correctly validates and uploads textures during pipeline creation.

Acceptance criteria:
- The GPU Uber Shader can sample an indexed texture without halting or encountering un-bound descriptor errors." | grep -o 'lit-[^ ]*' | head -1)

id5_2=$(pnpm exec lnks new --topic phase-5-shaping --type feature --title "Implement CPU Text Shaping (HarfBuzz/Metrics) for Glyph Layout" --description "Canonical feature ticket for CPU-side text layout.

Goal:
- Bridge high-level human language with low-level GPU MSDF quads.

Implementation requirements:
- Introduce a text shaping engine (e.g., HarfBuzz equivalent or basic metrics parser) to convert UTF-8 strings into positioned glyph offsets.
- Generate precisely \`4N\` vertices and \`6N\` indices per string.
- Map generated UV bounds strictly within the normalized \`[0.0, 1.0]\` range of the assigned font atlas.
- Manage memory via a String Pool, caching the dynamic \`Vertex Buffer\` quad list and only regenerating it when the string or layout changes.

Acceptance criteria:
- Valid bounding box calculations and strict UTF-8 fallback behavior (replacement characters).
- CJK / RTL string processing maps correctly to sequential X-coordinate drops." | grep -o 'lit-[^ ]*' | head -1)

id5_3=$(pnpm exec lnks new --topic phase-5-msdf --type feature --title "Implement MSDF text rendering in the Uber Shader" --description "Canonical feature ticket for the Type 5 Shape: The Text/Glyph Hybrid.

Goal:
- Render crisp, scale-independent text using Multi-Channel Signed Distance Field textures.

Implementation requirements:
- Sample the \`Texture2DArray\` inside the fragment shader.
- Compute the median of the RGB MSDF channels to find the distance.
- Scale the distance by the \`dFdx\` / \`dFdy\` screen-space derivatives to maintain edge crispness at any zoom level without sampling artifacts.
- Support drop shadows and glow thresholds by re-evaluating the distance value with an expanded epsilon.

Acceptance criteria:
- Text renders crisply at 0.1x scale and 10x scale.
- Overlapping outlines on tight kerning (e.g., 'AV') correctly use painter's algorithm without Z-fighting (Depth-Write disabled)." | grep -o 'lit-[^ ]*' | head -1)

pnpm exec lnks parent set $id5_1 $id5
pnpm exec lnks parent set $id5_2 $id5
pnpm exec lnks parent set $id5_3 $id5

echo "Done"
