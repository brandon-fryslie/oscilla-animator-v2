# Definition of Done: kernel-registry
Generated: 2026-01-31-160000

## Verification Checklist

### WI-1: KernelIntrinsic Type
- [ ] `src/runtime/kernels/KernelIntrinsic.ts` exists
- [ ] `KernelId` is a branded string type
- [ ] `KernelIntrinsic` interface has id, category, argCount, purity
- [ ] Exported from `src/runtime/kernels/index.ts`

### WI-2: KernelRegistry
- [ ] `src/runtime/kernels/KernelRegistry.ts` exists
- [ ] `get()` throws `KernelNotImplemented` for missing kernels
- [ ] `KernelNotImplemented` error includes `kernelId` for diagnostics
- [ ] Unit tests in `src/runtime/kernels/__tests__/KernelRegistry.test.ts`
- [ ] Tests cover: register, get, missing, has, listAll

### WI-3: Migration
- [ ] `applySignalKernel()` dispatches via registry (not switch)
- [ ] All ~40 signal kernels registered in default registry
- [ ] Field kernel registration (zip, zipSig, broadcast signatures)
- [ ] `npm run bench` shows < 5% regression
- [ ] All existing tests pass: `npm run test`
- [ ] `npm run build` passes

### Sprint-Level
- [ ] No kernel is dispatched via inline switch statement (except opcodes)
- [ ] Adding a new kernel requires only `registry.register()` + implementation fn
- [ ] Removing a kernel produces `KernelNotImplemented` at runtime (not silent)
