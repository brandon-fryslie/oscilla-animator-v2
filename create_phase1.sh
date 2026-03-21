export EPOCH=$(date +%s)

id1=$(pnpm exec lnks new --topic phase-1 --type epic --title "PHASE 1 EPIC: The Memory & Control Boundary" --description "This Epic shifts memory ownership from TypeScript to Rust, introducing the Symbolic Memory Manifest and the Live Parameter fast-path.

By stripping memory layout out of TS, we prevent recompilation cascades and establish the foundation for native compute kernels (fluids) and zero-allocation domains.

Key Objectives:
1. Replace TS \`stride\` and \`offset\` calculations with a Symbolic \`MemoryManifest\`.
2. Move WebGPU SSBO and Texture allocation entirely into the Rust renderer.
3. Formalize port \`UpdateClass\` (CompileTime, InstallTime, FrameTime).
4. Build the Wasm fast-path for Live Parameters, allowing UI sliders to write directly to a Rust-managed Uniform Buffer." | grep -o 'lit-[^ ]*' | head -1)

id1_1=$(pnpm exec lnks new --topic phase-1-manifest --type feature --title "Implement Symbolic Memory Manifest in TS Compiler" --description "Goal:
- Stop calculating byte offsets in TS. Emit intent.

Scope:
- Remove \`ArenaAddressPlan\` logic.
- Update the compiled artifact to output a \`MemoryManifest\` (e.g. \`{ id: 'state:velocities', type: 'vec2', cardinality: 10000, packing: 'soa' }\`).
- Update \`NagaEmitterInstruction\` to accept symbolic string IDs instead of integer offsets.

Acceptance:
- The compiled IR contains zero absolute byte offsets." | grep -o 'lit-[^ ]*' | head -1)

id1_2=$(pnpm exec lnks new --topic phase-1-rust-mmu --type feature --title "Implement Rust Memory Management Unit (MMU)" --description "Goal:
- Rust takes the Symbolic Manifest and calculates physical offsets based on std140/std430.

Scope:
- Rust reads the manifest and allocates \`wgpu::Buffer\`s (and eventually \`wgpu::Texture\`s).
- Rust \`NagaBuilder\` maintains a lookup table resolving Symbolic IDs into the physical base offsets and strides needed for AST pointer generation.

Acceptance:
- Rust correctly computes padding and strides, and the generated WGSL shaders execute against the correct buffer locations." | grep -o 'lit-[^ ]*' | head -1)

id1_3=$(pnpm exec lnks new --topic phase-1-update-classes --type feature --title "Formalize UpdateClass port metadata" --description "Goal:
- Declare mutability constraints to the UI.

Scope:
- Add \`UpdateClass\` (\`CompileTime\`, \`InstallTime\`, \`FrameTime\`) to block port definitions.
- The UI uses this to determine if a slider scrub triggers a full compile or a fast-path update.

Acceptance:
- All blocks correctly label their configuration and input ports." | grep -o 'lit-[^ ]*' | head -1)

id1_4=$(pnpm exec lnks new --topic phase-1-fastpath --type feature --title "Implement Live Parameter Fast-Path (Global Control UBO)" --description "Goal:
- 120fps UI slider scrubs with zero TS compilation.

Scope:
- Rust allocates a Global Control Uniform Buffer.
- TS maps \`FrameTime\` ports to specific indices in this buffer and emits \`UniformRead\` IR.
- Add a Wasm bridge function: \`rustRenderer.updateControl(index, value)\`.
- Update React to call this on slider drag.

Acceptance:
- Moving a slider instantly updates the renderer without invoking the TS compiler." | grep -o 'lit-[^ ]*' | head -1)

pnpm exec lnks parent set $id1_1 $id1
pnpm exec lnks parent set $id1_2 $id1
pnpm exec lnks parent set $id1_3 $id1
pnpm exec lnks parent set $id1_4 $id1

echo "Phase 1 created"
