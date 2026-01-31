# Sprint: kernel-registry — Typed Kernel Registry with Handle Resolution
Generated: 2026-01-31-160000 (Updated after review)
Confidence: HIGH: 1, MEDIUM: 3, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Replace string-dispatched kernel switch statements with a typed KernelRegistry that resolves KernelId→KernelHandle at program load. Kernels become first-class intrinsics with discriminated ABI types. Missing kernels fail at load, not runtime. Evaluation uses integer-indexed arrays, not Map lookups.

## Scope
**Deliverables:**
1. KernelIntrinsic discriminated union (5 categories with specific function signatures)
2. KernelRegistry with handle resolution (KernelId → integer KernelHandle)
3. Store KernelHandle in ValueExpr (or side table), not string KernelId
4. Evaluator dispatch via `kernels[handle]` array, not string switch/Map

## Work Items

### WI-1: Define KernelIntrinsic discriminated union [MEDIUM]

**Location**: New file `src/runtime/kernels/KernelIntrinsic.ts`

**Type definition**:
```typescript
type KernelId = string & { readonly __brand: 'KernelId' };
type KernelHandle = number & { readonly __brand: 'KernelHandle' };

// Discriminated union by kernel category
type KernelIntrinsic =
  | KernelScalar
  | KernelField
  | KernelZipSig
  | KernelReduce
  | KernelPathDerivative;

interface KernelScalar {
  readonly kind: 'scalar';
  readonly id: KernelId;
  readonly fn: ScalarKernelFn;
  readonly argCount: number | 'variadic';
  readonly purity: 'pure' | 'rng';
  readonly guaranteesFiniteForFiniteInputs: boolean;
  readonly range?: { min: number; max: number };
}

interface KernelField {
  readonly kind: 'field';
  readonly id: KernelId;
  readonly fn: FieldKernelFn;
  readonly inputCount: number;  // How many field inputs
  readonly purity: 'pure' | 'rng';
}

interface KernelZipSig {
  readonly kind: 'zipSig';
  readonly id: KernelId;
  readonly fn: ZipSigKernelFn;
  readonly signalArgCount: number;  // How many signal args beyond the field input
  readonly purity: 'pure' | 'rng';
}

interface KernelReduce {
  readonly kind: 'reduce';
  readonly id: KernelId;
  readonly fn: ReduceKernelFn;
  readonly op: 'min' | 'max' | 'sum' | 'avg';
  readonly purity: 'pure';
}

interface KernelPathDerivative {
  readonly kind: 'pathDerivative';
  readonly id: KernelId;
  readonly fn: PathDerivativeKernelFn;
  readonly op: 'tangent' | 'arcLength';
  readonly purity: 'pure';
}

// Function signature types
type ScalarKernelFn = (values: number[]) => number;
type FieldKernelFn = (out: TypedArray, inputs: TypedArray[], N: number) => void;
type ZipSigKernelFn = (out: TypedArray, fieldInput: TypedArray, sigValues: number[], N: number) => void;
type ReduceKernelFn = (input: TypedArray, N: number) => number;
type PathDerivativeKernelFn = (/* TBD: path/shape args */) => TypedArray;
```

**Design decisions**:
- **5 categories**: Each has a different function signature. This prevents runtime dispatch errors.
- **Metadata on kernel**: `guaranteesFiniteForFiniteInputs`, `range`, `purity` are kernel properties, not global assumptions.
- **Branded types**: KernelId and KernelHandle prevent mixing string/number accidentally.

**Acceptance Criteria:**
- [ ] `KernelIntrinsic` discriminated union exists with 5 kinds
- [ ] Each kind has a specific function type (not `any` or overly generic)
- [ ] Exported from `src/runtime/kernels/`
- [ ] TypeScript exhaustiveness checking works (`never` checks in switch)

**Technical Notes:**
- Don't add fields speculatively. If a category doesn't need a field (e.g., reduce doesn't need `argCount`), don't add it.
- The `guaranteesFiniteForFiniteInputs` and `range` fields support property testing (Sprint 4).

### WI-2: Implement KernelRegistry with handle resolution [MEDIUM]

**Location**: `src/runtime/kernels/KernelRegistry.ts`

**API**:
```typescript
class KernelRegistry {
  private nextHandle: number = 0;
  private kernelsByHandle: KernelIntrinsic[] = [];
  private handlesByIdString: Map<string, KernelHandle> = new Map();

  register(kernel: KernelIntrinsic): KernelHandle {
    const handle = this.nextHandle++ as KernelHandle;
    this.kernelsByHandle[handle] = kernel;
    this.handlesByIdString.set(kernel.id, handle);
    return handle;
  }

  resolve(id: KernelId): KernelHandle {
    const handle = this.handlesByIdString.get(id);
    if (handle === undefined) {
      throw new KernelNotFound(id);
    }
    return handle;
  }

  get(handle: KernelHandle): KernelIntrinsic {
    return this.kernelsByHandle[handle];
  }

  has(id: KernelId): boolean {
    return this.handlesByIdString.has(id);
  }

  listAll(): readonly KernelIntrinsic[] {
    return this.kernelsByHandle;
  }
}

class KernelNotFound extends Error {
  constructor(public readonly kernelId: KernelId) {
    super(`Kernel not found: ${kernelId}`);
  }
}
```

**Usage pattern**:
```typescript
// At program load (compile/lowering time):
const handle = registry.resolve(kernelId);  // throws if missing
// Store handle in ValueExpr or side table

// At evaluation time (hot loop):
const kernel = registry.get(handle);
if (kernel.kind === 'scalar') {
  return kernel.fn(values);
} else if (kernel.kind === 'field') {
  kernel.fn(out, inputs, N);
}
```

**Acceptance Criteria:**
- [ ] `KernelRegistry` class exists with register/resolve/get/has/listAll
- [ ] `resolve()` throws `KernelNotFound` for unregistered kernels
- [ ] `get()` is O(1) array access (no Map lookup)
- [ ] Unit tests in `src/runtime/kernels/__tests__/KernelRegistry.test.ts`

**Technical Notes:**
- The registry API is used TWICE:
  1. At **program load** (or lowering): `resolve(id) → handle` (may fail)
  2. At **evaluation**: `get(handle) → kernel` (always succeeds, handle is pre-validated)
- This ensures "missing kernel" errors happen before the first frame.

### WI-3: Store KernelHandle in ValueExpr (or side table) [MEDIUM]

**Current**: ValueExpr kernel nodes store `kernelName: string`

**New**: Store `kernelHandle: KernelHandle` instead

**Options**:
- **Option A**: Replace `kernelName` with `kernelHandle` directly in the ValueExpr type
  - Pro: Simple, single source of truth
  - Con: ValueExpr becomes coupled to runtime registry (complicates serialization)
- **Option B**: Keep `kernelName`, add a side table `kernelHandles: Map<ValueExprId, KernelHandle>` in the program
  - Pro: ValueExpr remains serializable
  - Con: Two lookups (ValueExprId → handle, then handle → kernel)
- **Option C**: Add both fields, use handle at runtime, keep name for debugging/serialization
  - Pro: Best of both (debuggability + performance)
  - Con: Redundant storage

**Recommendation**: Option C. Storage is cheap (~8 bytes per kernel expr), and having the name available for diagnostics is valuable.

**Implementation**:
- Modify `ValueExprKernel` type to add `kernelHandle?: KernelHandle`
- During lowering (or a post-lowering pass), resolve all `kernelName` → `kernelHandle` via registry
- If any kernel is missing, fail compilation before the first frame
- Evaluator uses `kernelHandle` (ignores `kernelName` at runtime)

**Acceptance Criteria:**
- [ ] ValueExpr kernel nodes have `kernelHandle` field
- [ ] Lowering/compilation resolves all kernels to handles
- [ ] Missing kernel → compilation fails (before first frame)
- [ ] Evaluator uses `kernelHandle`, not `kernelName`

**Technical Notes:**
- This change affects `lowerToValueExprs.ts` or a new post-lowering pass.
- The handle resolution pass is the perfect place for the "kernel reference audit" (WI-2 from Sprint 2.5).

### WI-4: Migrate evaluator dispatch to use handles [MEDIUM]

**Current**: `applySignalKernel(name, values)` → switch on `name`

**New**: `registry.get(handle)` → dispatch on `kernel.kind`

**Refactor**:
```typescript
// Before (string switch):
function applySignalKernel(name: string, values: number[]): number {
  switch (name) {
    case 'oscSin': return Math.sin(wrapPhase(values[0]) * TAU);
    case 'triangle': return /* ... */;
    // ... 40 more cases
  }
}

// After (handle dispatch):
function evaluateScalarKernel(handle: KernelHandle, values: number[], registry: KernelRegistry): number {
  const kernel = registry.get(handle);
  if (kernel.kind !== 'scalar') {
    throw new Error(`Expected scalar kernel, got ${kernel.kind}`);
  }
  return kernel.fn(values);
}
```

**Apply to**:
- `ValueExprSignalEvaluator.ts` — use handle for scalar kernels
- `ValueExprMaterializer.ts` — use handle for field/zipSig/reduce kernels

**Acceptance Criteria:**
- [ ] `applySignalKernel` replaced with handle-based dispatch
- [ ] `applyFieldKernel` / `applyFieldKernelZipSig` replaced with handle-based dispatch
- [ ] All existing kernel tests pass via new dispatch
- [ ] No string-based kernel lookup in hot loop

**Technical Notes:**
- Opcodes (add, mul, sin, cos) stay in `OpcodeInterpreter.ts` as-is. They are NOT kernels — they're the primitive instruction set.
- The registry is passed to the evaluator (or stored in program/state). Evaluator does NOT call `registry.resolve()` — only `registry.get()`.

## Dependencies
- Sprint 1 (kill-legacy-surfaces) should be done first to avoid modifying dead code
- No external dependencies

## Risks
- **WI-3 coupling**: If ValueExpr stores handles, serialization becomes tricky. Mitigation: Use Option C (store both name and handle).
- **Migration coordination**: WI-3 and WI-4 must be coordinated (can't use handles in evaluator until they're in ValueExpr). Mitigation: Do WI-3 first, add handles but keep fallback to name, then WI-4 switches to handle-only.
- **Field kernel ABI complexity**: zip/zipSig/reduce all have different signatures. Discriminated union solves this but adds type complexity. Mitigation: Make the type system enforce it (TypeScript exhaustiveness checks).
