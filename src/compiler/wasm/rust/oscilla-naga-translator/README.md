# oscilla-naga-shim (Rust/WASM)

Rust/WASM validation + emission boundary for compiler Naga IR.

Build artifacts are generated into `src/compiler/wasm/pkg/` via:

```bash
pnpm run build:naga-shim
```

The TypeScript bridge (`src/compiler/wasm/oscilla_naga_shim.ts`) has no TypeScript
WGSL fallback path; runtime compile requires this Rust/WASM artifact.

To validate generated artifacts before release:

```bash
pnpm run verify:naga-shim
```
