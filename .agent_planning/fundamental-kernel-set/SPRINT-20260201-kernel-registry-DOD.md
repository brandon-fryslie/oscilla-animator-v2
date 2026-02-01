# Definition of Done: Kernel Registry + Fundamental Kernel Set
Generated: 2026-02-01
Reviewed by: ChatGPT TypeSystemRefactor conversation

## Sprint Goal
Build a typed KernelRegistry that resolves kernel IDs to handles at program load (not per-call), register the minimal fundamental kernel set, validate all references before first frame, and eliminate string-based kernel dispatch from the runtime hot loop.

## User Decisions (Resolved)
- Oscillators and layouts are **blocks** (lower to opcode sequences), NOT runtime kernels
- noise3 IS a kernel (simplex noise, irreducible)
- hash stays as an opcode
- hsvToRgb is the only "large" named kernel kept per audit
- extract/construct are ValueExpr intrinsics, NOT registry kernels

## Verification Checklist

### Phase A: KernelRegistry Infrastructure (hot-loop-safe)

**A1 — Types**
- [ ] Branded `KernelId` (string) and `KernelHandle` (integer index)
- [ ] Two registry ABI categories only:
  - `ScalarKernel`: `fn(args: number[]): number` — used in signal eval and per-lane in field eval
  - `LaneKernel`: `fn(out: Float32Array, outBase: number, args: number[]): void` — writes outStride scalars per lane (for stride-changing ops like HSV→RGBA)
- [ ] No "field/zipSig/reduce/pathDerivative" kernel kinds — wiring shape stays in existing ValueExpr node kinds

**A2 — Registry layout**
- [ ] `KernelRegistry` stores: `scalarKernels: ScalarKernel[]`, `laneKernels: LaneKernel[]`, `meta: KernelMeta[]` aligned by handle
- [ ] `KernelMeta`: argCount, inStrides/outStride, purity, guaranteesFiniteForFiniteInputs, range?
- [ ] Registration returns a handle: `registerScalar(id, fn, meta) -> handle`, `registerLane(id, fn, meta) -> handle`
- [ ] Lookup via Map is at program load only; runtime uses `kernels[handle]`

**A3 — Resolved kernel references**
- [ ] Post-lowering "resolve kernels" pass rewrites `PureFn{kind:'kernel', name}` into `PureFn{kind:'kernel', handle, abi:'scalar'|'lane'}`
- [ ] After this pass, zero string kernel names reachable by evaluators
- [ ] Registry + resolved handles packaged inside compiled program object (no handle/registry mismatch possible)

### Phase B: Program-Load Validation (fail before first frame)

**B1 — Totality**
- [ ] Missing kernel → `KernelNotImplemented` error with: kernelId, valueExprId, expectedAbi
- [ ] Happens during program construction/load, NOT during frame execution

**B2 — Contract validation**
- [ ] Arity: argCount matches number of inputs at every use-site
- [ ] Stride contract: for lane kernels, outStride === payloadStride(output.payload)
- [ ] Purity flag recorded (used for tests/metadata)

### Phase C: Fundamental Kernel Registration

**C1 — Register exactly these runtime kernels**
- [ ] `noise3(vec3 p, scalar seed) -> scalar` as ScalarKernel (simplex noise implementation)
- [ ] `hsvToRgb(h, s, v) -> rgba` as LaneKernel (outStride=4)
- [ ] Nothing else "named" registered this sprint

**C2 — Structural ops are ValueExpr intrinsics, not kernels**
- [ ] `extract(componentIndex)` and `construct(payloadKind, ...components)` as ValueExpr intrinsics
- [ ] Delete/replace makeVec2/makeVec3/extractX/extractY/vec2ToVec3/fieldSetZ in favor of intrinsics
- [ ] These must not survive into runtime dispatch as named kernels

### Phase D: Migration (remove string switching)

**D1 — Delete string-dispatch switches**
- [ ] FieldKernels.ts no longer has a switch reachable from runtime execution
- [ ] SignalKernelLibrary.ts does not do string kernel switching in hot path

**D2 — Runtime uses handle-based dispatch**
- [ ] Signal evaluator: `scalarKernels[handle](args)`
- [ ] Materializer: scalar kernels → loop lanes, call per lane; lane kernels → loop lanes, call per lane with outBase

**D3 — Tests**
- [ ] No regressions (`npm run test` passes, `npm run build` passes)
- [ ] Missing kernel fails at load time (not during first frame)
- [ ] Wrong arity fails at load time
- [ ] Program referencing noise3 and hsvToRgb executes with expected invariants
- [ ] Tripwire test: no runtime evaluator imports FieldKernels.ts switches or uses kernel names after resolve

### Phase E: Property Tests (metadata-driven)

**E1 — ScalarKernel properties**
- [ ] Determinism: same args → same output
- [ ] Finiteness: bounded args → finite output

**E2 — LaneKernel properties (hsvToRgb)**
- [ ] Output channels finite
- [ ] Output channel range in [0,1]
- [ ] Alpha policy explicit and tested

### Sprint-Level
- [ ] Adding a new kernel = register fn + property test auto-covers it
- [ ] Removing a kernel = KernelNotImplemented (no silent fallback)
- [ ] Performance: handle-based dispatch (array index) replaces string dispatch
- [ ] No per-lane allocation in hot loops (reuse scratch arrays)
