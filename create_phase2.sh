export EPOCH=$(date +%s)

id2=$(pnpm exec lnks new --topic phase-2 --type epic --title "PHASE 2 EPIC: The Compute Kernel & Fluid Boundary" --description "With Rust acting as the MMU and capable of allocating Texture2Ds, we can reimplement Eulerian Fluid Dynamics correctly.

Key Objectives:
1. Define the \`DispatchKernel\` instruction.
2. Move raw WGSL logic into static Rust shaders.
3. Completely purge TS-side WGSL string generation." | grep -o 'lit-[^ ]*' | head -1)

id2_1=$(pnpm exec lnks new --topic phase-2-dispatch --type feature --title "Define DispatchKernel TS instruction and Rust execution" --description "Goal:
- Allow TS to trigger static WGSL kernels natively.

Scope:
- Add \`{ op: 'DispatchKernel', kernelId: string, arguments: Record<string, string> }\` to \`NagaEmitterInstruction\`.
- \`arguments\` maps kernel expected inputs to Symbolic Memory IDs.
- Rust maps \`kernelId\` to a pre-compiled \`wgpu::ComputePipeline\`, binds the physical resources using the Symbolic ID lookup, and executes.

Acceptance:
- A basic mock kernel executes successfully via the new instruction." | grep -o 'lit-[^ ]*' | head -1)

id2_2=$(pnpm exec lnks new --topic phase-2-fluid-port --type feature --title "Port Fluid Dynamics to Native Kernels" --description "Goal:
- Re-introduce Fluid simulations on the new architecture using Texture2D.

Scope:
- Write static \`fluid.wgsl\` containing Splat, Curl, Advect, Jacobi iterations.
- Allow the TS \`MemoryManifest\` to request \`grid_2d\` topologies, which Rust fulfills with \`Texture2D\`.
- Implement TS blocks (\`FluidSim\`) that emit the \`DispatchKernel\` calls for these stages.

Acceptance:
- Eulerian fluid patches run cleanly at 120fps using Texture2D lookups (\`textureLoad\`/\`textureStore\`) instead of flat 1D arrays." | grep -o 'lit-[^ ]*' | head -1)

pnpm exec lnks parent set $id2_1 $id2
pnpm exec lnks parent set $id2_2 $id2

echo "Phase 2 created"
