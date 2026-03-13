# Context: P2-1 - Module Caching Strategy

## Target State
Spec requires hashing the NagaModule JSON after lowering. If the hash matches a cached entry, skip WASM validation and driver pipeline compilation entirely. This makes undo/redo and bypass toggling instant.

## Current State
No caching exists. Every graph edit triggers:
1. Full IR lowering in `ScheduleNagaLowering.ts`
2. Naga WASM validation in `compile.worker.ts:70` -> `compileProgramWithNaga()`
3. Full GPU pass validation in `compiled-gpu-pass-validation.ts`

There is no hash computation on the NagaModule, no cache lookup, and no way to skip stages.

## Files Involved
- `src/services/compile.worker.ts` - Where cache lookup would occur
- `src/compiler/naga-compile.ts` - Where module hash could be computed pre-Naga
- `src/services/AsyncCompilerService.ts` - Could store cache reference

## Suggested Approach
1. After `lowerScheduleToNagaModule()` in `compile.ts`, compute a stable hash of the resulting `NagaModuleIR`.
2. Check a `Map<string, CompiledGpuArtifactBundle>` cache in the compile worker.
3. On cache hit, skip Naga WASM compilation and return cached WGSL bundle.
4. On cache miss, compile normally and store the result.
5. The cache lives in the worker's module scope (not transferred across worker boundary).

## Risks
- JSON.stringify stability: object key ordering must be deterministic (which it is for the lowering output since it's built deterministically).
- Cache size: need an eviction strategy (LRU with max entries).
- Worker restart clears cache (acceptable).
