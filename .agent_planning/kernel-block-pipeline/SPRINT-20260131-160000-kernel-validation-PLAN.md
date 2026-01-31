# Sprint: kernel-validation — Kernel Validation at Program Load
Generated: 2026-01-31-160000 (NEW - added after review)
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION (after Sprint 2 prerequisites)

## Sprint Goal
Add a kernel reference audit pass that runs after lowering, before the first frame. Validate that all kernels referenced by ValueExpr nodes are registered, have correct arity, and satisfy invariants. Fail loudly at program load if any kernel is missing or invalid.

## Scope
**Deliverables:**
1. Kernel reference audit pass (post-lowering validation)
2. Arity validation (argCount matches usage)
3. Invariant validation (stride compatibility, etc.)
4. Clear error messages for missing/invalid kernels

## Work Items

### WI-1: Implement kernel reference audit pass [HIGH]

**Location**: New file `src/compiler/validate-kernels.ts` (or extend existing validation pass)

**API**:
```typescript
interface KernelValidationError {
  kind: 'missing' | 'arity' | 'stride' | 'invariant';
  kernelId: KernelId;
  valueExprId: ValueExprId;
  message: string;
}

function validateKernelReferences(
  program: CompiledProgramIR,
  registry: KernelRegistry
): KernelValidationError[] {
  const errors: KernelValidationError[] = [];

  // Walk all ValueExpr nodes
  for (const expr of program.valueExprs.nodes) {
    if (expr.op !== 'kernel') continue;

    const { kernelName } = expr;

    // Check 1: Kernel exists
    if (!registry.has(kernelName as KernelId)) {
      errors.push({
        kind: 'missing',
        kernelId: kernelName as KernelId,
        valueExprId: expr.id,
        message: `Kernel '${kernelName}' not found in registry`
      });
      continue;
    }

    // Resolve to get kernel metadata
    const handle = registry.resolve(kernelName as KernelId);
    const kernel = registry.get(handle);

    // Check 2: Arity matches
    if (kernel.kind === 'scalar' && kernel.argCount !== 'variadic') {
      const providedArgs = expr.kernelKind === 'map' ? 1 : 2;  // Simplified
      if (providedArgs !== kernel.argCount) {
        errors.push({
          kind: 'arity',
          kernelId: kernel.id,
          valueExprId: expr.id,
          message: `Kernel '${kernel.id}' expects ${kernel.argCount} args, got ${providedArgs}`
        });
      }
    }

    // Check 3: Stride compatibility (for field kernels)
    if (kernel.kind === 'field' || kernel.kind === 'zipSig') {
      // Validate input/output strides match
      // TBD: depends on how stride info is stored
    }

    // Check 4: Other invariants
    // E.g., reduce kernel only used with field-extent inputs
  }

  return errors;
}
```

**When to run**:
- After `lowerToValueExprs()` produces the ValueExpr table
- Before `executeFrame()` is called for the first time
- Integrated into `compile()` pipeline as a post-lowering validation step

**Acceptance Criteria:**
- [ ] `validateKernelReferences()` function exists
- [ ] Runs as part of compile pipeline (or explicitly called after compile)
- [ ] Returns array of validation errors
- [ ] Missing kernel produces error before first frame
- [ ] Arity mismatch produces error before first frame

**Technical Notes:**
- This pass can also resolve `kernelName → kernelHandle` and store handles in ValueExpr (Sprint 2 WI-3).
- If resolution fails, compilation fails. No program with unresolved kernels can execute.

### WI-2: Validate arity for all kernel categories [HIGH]

**Arity rules** (to enforce):
- **scalar**: If `argCount` is a number, input count must match exactly
- **scalar**: If `argCount` is `'variadic'`, input count must be >= 1
- **field**: `inputCount` field kernels must be provided
- **zipSig**: 1 field input + `signalArgCount` signal inputs
- **reduce**: Exactly 1 field input
- **pathDerivative**: TBD (depends on path model)

**Implementation**:
- Extract arg count from ValueExpr kernel node structure
- Compare against kernel metadata
- Report mismatch with clear message including:
  - Kernel ID
  - Expected arg count
  - Actual arg count
  - ValueExprId for source location

**Acceptance Criteria:**
- [ ] Arity validation for scalar kernels (number and variadic)
- [ ] Arity validation for field kernels (inputCount)
- [ ] Arity validation for zipSig kernels (field + signals)
- [ ] Arity validation for reduce kernels (single input)
- [ ] Test that deliberately violates arity produces error

**Technical Notes:**
- Arity info comes from two places: kernel metadata (`argCount`) and ValueExpr structure (inputs array).
- For field kernels with variadic inputs (e.g., `makeVec3` takes 3 fields), the `inputCount` field declares this.

### WI-3: Validate stride compatibility [MEDIUM - future work]

**Purpose**: Ensure that field kernels are called with stride-compatible inputs/outputs.

**Example invariant**: `makeVec3` expects 3 scalar fields (stride 1 each) and produces vec3 field (stride 3).

**Current status**: Stride info is NOT stored in ValueExpr or kernel metadata yet.

**Recommendation**: Defer this to a future sprint. Mark as placeholder. For now, runtime will catch stride mismatches (NaN/crashes), and we'll add static validation when stride info is available.

**Acceptance Criteria (deferred):**
- [ ] (Future) Stride metadata in ValueExpr or kernel
- [ ] (Future) Validation pass checks stride compatibility

**Technical Notes:**
- Stride is implicit in `CanonicalType.payload` (float=1, vec3=3, color=4).
- When stride is added to kernel metadata, this check becomes straightforward.

### WI-4: Clear error messages with source context [HIGH]

**Goal**: When validation fails, the error message should help the user fix it.

**Error message format**:
```
Kernel validation failed in compiled program:

[1] Missing kernel: 'newOscillator'
    Referenced by: ValueExpr #42 (signal kernel)
    Suggestion: Register 'newOscillator' in the kernel registry before compiling.

[2] Arity mismatch: 'easeInQuad'
    Referenced by: ValueExpr #87 (signal kernel)
    Expected: 1 arg (easing function)
    Provided: 2 args
    Suggestion: Check block lowering for easeInQuad usage.
```

**Implementation**:
- `KernelValidationError` type includes `valueExprId` and `message`
- Optional: include block/port info if traceable from ValueExpr back to source graph
- Collect all errors before throwing (don't fail on first error — report all issues)

**Acceptance Criteria:**
- [ ] Error messages include kernel ID and ValueExprId
- [ ] All validation errors reported at once (not first-failure-only)
- [ ] Error message suggests how to fix (register kernel, check arity, etc.)

**Technical Notes:**
- ValueExpr doesn't have source location info (no file/line). The best we can do is ValueExprId.
- If needed, could add optional `sourceBlockId` to ValueExpr for better diagnostics.

## Dependencies
- Sprint 2 (kernel-registry) must be done — registry must exist for validation
- Sprint 2 WI-3 (store handles) can be combined with this sprint

## Risks
- **Validation coverage**: We can only validate what we can introspect. If kernel metadata is incomplete, validation will miss some issues. Mitigation: Make metadata comprehensive from the start (Sprint 2 WI-1).
- **Error message quality**: If errors are cryptic, developers will struggle. Mitigation: WI-4 focuses on clear, actionable messages.
