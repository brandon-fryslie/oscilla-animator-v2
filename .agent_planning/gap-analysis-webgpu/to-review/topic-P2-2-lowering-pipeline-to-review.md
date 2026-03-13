# P2-2: Naga Compiler Lowering Pipeline - TO-REVIEW Items

## Item 1: Helper Functions (Library IR) for Complex Blocks
**Spec says**: "For complex blocks (like SimplexNoise), we don't inline the logic. We check ctx.functions for 'snoise'. If missing, append a pre-defined helper function in structured IR form (not WGSL source text concatenation)."
**Implementation**: `ScheduleNagaLowering.ts` inlines all logic directly. Built-in math functions are emitted as `NagaExpressionIR { kind: 'call', function: '<builtin>', args }` where function names are WGSL builtins (`sin`, `cos`, `clamp`, `min`, `max`, `abs`, etc.). No user-defined helper functions or function registry exists.
**Gap**: No complex block lowering (SimplexNoise, etc.) exists on the GPU path yet. The spec's function registry pattern isn't needed until complex blocks are added. However, when noise/complex blocks are needed on GPU, the current architecture would need extension.
**Classification**: TO-REVIEW

## Item 2: Dead Code Elimination Pass
**Spec says**: "We can run a trivial 'Dead Code' pass on the expressions array before emission (remove IDs that are never referenced by a Statement)."
**Implementation**: No dead code elimination pass exists on the Naga IR. The lowering in `ScheduleNagaLowering.ts` produces expressions that are always referenced. The `IRBuilderImpl.ts` and `BlockIRBuilder.ts` have dead-code related logic at the higher IR level, but not at the Naga emission level.
**Gap**: Not blocking but spec-mentioned optimization is missing. Since lowering is deterministic and generates only what it needs, dead expressions are unlikely in practice.
**Classification**: TO-REVIEW

## Item 3: Handle Casting (u32 via bitcast in f32 arena)
**Spec says**: "When reading a Handle, we must generate Expr::As { kind: 'Uint', expr: LoadExpr, width: 4 }. This emits a bitcast<u32>(val) in WGSL."
**Implementation**: Bitcasting is implemented at `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts:687-692`. The `emitTypedCopy` function handles `storage === 'u32'` by emitting `{ kind: 'as', to: 'u32', expr: loaded }` for reads and `{ kind: 'as', to: 'f32', expr: typedRead }` for writes. The Rust shim emits `bitcast<u32>()` / `bitcast<f32>()` at `lib.rs:436`.
**Gap**: Fully implemented but uses a different naming convention (`'as'` vs `Expr::As`). Implementation matches spec intent perfectly.
**Classification**: TO-REVIEW — confirmed working, just different naming.

## Item 4: SoA vec3 Handling (3 separate expressions)
**Spec says**: For vec3 types in SoA layout, "We actually have 3 separate Expressions for A (x,y,z) and 3 for B. Generate 3 separate Add expressions."
**Implementation**: `emitTypedCopy` at `ScheduleNagaLowering.ts:637-705` iterates `componentCount = Math.min(sourcePlan.stride, targetPlan.stride)` and emits per-component read/write operations. The address calculation uses `componentStride` and `componentIndex` in `emitAddressIndex` at line 500-542.
**Gap**: Implemented correctly. SoA component-wise access is handled by the stride/offset address calculation system rather than vec3-specific logic.
**Classification**: TO-REVIEW — confirmed working via SoA address plan system.
