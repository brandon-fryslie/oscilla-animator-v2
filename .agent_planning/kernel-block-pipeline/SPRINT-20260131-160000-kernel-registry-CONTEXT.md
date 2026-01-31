# Implementation Context: kernel-registry
Generated: 2026-01-31-160000

## Key Files

### Must Read
- `src/runtime/SignalKernelLibrary.ts` — Current signal kernel switch (~40 cases)
- `src/runtime/FieldKernels.ts` — Current field kernel switch (~30 cases)
- `src/runtime/OpcodeInterpreter.ts` — Opcode switch (KEEP SEPARATE)
- `src/runtime/kernels/KernelRegistryDual.ts` — Existing lowering dispatch helper
- `src/runtime/ValueExprSignalEvaluator.ts` — Where signal kernels are called
- `src/runtime/ValueExprMaterializer.ts` — Where field kernels are called

### Must Create
- `src/runtime/kernels/KernelIntrinsic.ts`
- `src/runtime/kernels/KernelRegistry.ts`
- `src/runtime/kernels/defaultRegistry.ts` (or `signalKernels.ts` + `fieldKernels.ts`)
- `src/runtime/kernels/__tests__/KernelRegistry.test.ts`

### Must Modify
- `src/runtime/SignalKernelLibrary.ts` — Replace switch with registry lookup
- `src/runtime/FieldKernels.ts` — Replace switch with registry lookup
- `src/runtime/ValueExprSignalEvaluator.ts` — Use registry (may just call through applyPureFn which calls registry)
- `src/runtime/ValueExprMaterializer.ts` — Use registry for field kernels

## Kernel Catalog (what gets registered)

### Signal Kernels (from SignalKernelLibrary)
| Kernel | Category | Args | Purity |
|--------|----------|------|--------|
| oscSin | oscillator | 1 | pure |
| oscCos | oscillator | 1 | pure |
| oscTan | oscillator | 1 | pure |
| triangle | oscillator | 1 | pure |
| square | oscillator | 1 | pure |
| sawtooth | oscillator | 1 | pure |
| easeInQuad | easing | 1 | pure |
| easeOutQuad | easing | 1 | pure |
| easeInOutQuad | easing | 1 | pure |
| easeInCubic | easing | 1 | pure |
| easeOutCubic | easing | 1 | pure |
| easeInOutCubic | easing | 1 | pure |
| easeInElastic | easing | 1 | pure |
| easeOutElastic | easing | 1 | pure |
| easeOutBounce | easing | 1 | pure |
| smoothstep | shaping | 1 | pure |
| step | shaping | 1 | pure |
| noise | shaping | 1 | rng |
| combine_sum | combine | variadic | pure |
| combine_average | combine | variadic | pure |
| combine_max | combine | variadic | pure |
| combine_min | combine | variadic | pure |
| combine_last | combine | 1+ | pure |

### Field Kernels (from FieldKernels — zip operations)
| Kernel | Category | Inputs | Purity |
|--------|----------|--------|--------|
| makeVec2 | layout | 2 fields | pure |
| makeVec3 | layout | 3 fields | pure |
| hsvToRgb | math | 3 fields | pure |
| fieldAdd | math | 2 fields | pure |
| fieldMultiply | math | 2 fields | pure |
| fieldPolarToCartesian | layout | 2 fields | pure |
| ... (see FieldKernels.ts for full list) |

### Field Kernels (zipSig operations)
| Kernel | Category | Inputs | Purity |
|--------|----------|--------|--------|
| circleLayout | layout | field + sigs | pure |
| polygonVertex | layout | field + sigs | pure |
| lineLayout | layout | field + sigs | pure |
| gridLayout | layout | field + sigs | pure |
| applyOpacity | math | field + sig | pure |
| ... (see FieldKernels.ts for full list) |

## Field Kernel Signature Challenge

Field kernels have 3 distinct signatures:
1. **Zip**: `(out: TypedArray, inputs: TypedArray[], N: number) => void`
2. **ZipSig**: `(out: TypedArray, fieldInput: TypedArray, sigValues: number[], N: number) => void`
3. **Broadcast**: Signal value → fill buffer (handled by materialize, not a named kernel)

Options for registry:
- **A**: Three separate registries (zipRegistry, zipSigRegistry, broadcastRegistry)
- **B**: One registry with discriminated fn type
- **C**: One registry, normalize all to common signature (pass unused args)

**Recommendation**: Option B. Store the function and its `fieldKernelKind: 'zip' | 'zipSig'` alongside it. The materializer already branches on kernelKind, so this is natural.

## Performance Considerations

Current hot path: `applySignalKernel(name, values)` → switch → implementation

Proposed: `registry.getScalar(name)(values)` → Map.get() → stored fn → implementation

**Map.get() cost**: ~10ns per lookup. At 60fps with ~100 kernel evals per frame = ~6000 lookups/sec = 60μs/sec. Negligible.

**Alternative**: Pre-resolve during compilation. Store `kernelFn` reference directly on the ValueExpr kernel node. Zero lookup at eval time. But this couples compiled IR to runtime functions (less clean for serialization). Defer unless benchmarks show issues.

## Opcode Decision

**Do NOT put opcodes in KernelRegistry.** Rationale:
- Opcodes are the "instruction set" — they're always available, never optional
- They're performance-critical (called per-element in field materialization)
- OpcodeInterpreter is already a single enforcer
- Kernels are higher-level named operations that may be added/removed

Keep `applyOpcode` as-is. The separation between "opcode" (primitive math) and "kernel" (named operation) is a feature, not debt.
