# Context: P2-3 - Naga Shim WGSL Round-Trip Architecture

## Target State
The spec requires:
1. TS compiler emits structured IR as JSON
2. Rust shim deserializes JSON directly into `naga::Module` via serde
3. `naga::valid::Validator` validates the module
4. `naga::back::wgsl::Writer` emits canonical WGSL
5. No intermediate string generation

This guarantees zero syntax errors by construction since we never generate text.

## Current State
The actual flow is:
1. TS compiler emits `NagaModuleIR` JSON (via `ScheduleNagaLowering.ts`)
2. Rust shim deserializes into custom `NagaModuleIR` struct (`lib.rs:186-195`)
3. `ExpressionEmitter` recursively builds WGSL strings from expressions (`lib.rs:327-461`)
4. `emit_statement_block` recursively builds WGSL statement strings (`lib.rs:463-574`)
5. `emit_module_to_wgsl` assembles complete WGSL source (`lib.rs:576-666`)
6. `naga::front::wgsl::parse_str` parses the generated WGSL back into `naga::Module`
7. `naga::valid::Validator` validates
8. `naga::back::wgsl::write_string` re-emits canonical WGSL

### Why this divergence exists
The TS IR (`NagaExpressionIR`, `NagaStatementIR`) does not match `naga::Module`'s serde shape. Key differences:
- `NagaExpressionIR` uses a custom set of expression kinds (`buffer_load`, `call`, `as`) that don't map 1:1 to `naga::Expression` variants
- `NagaStatementIR` uses named buffer references (`buffer: "arena_out"`) instead of Naga handle-based global variable references
- The TS IR is a higher-level abstraction that needs translation

### Performance implications
Extra round-trip: ~1-3ms for small shaders, potentially more for complex ones.
The `ExpressionEmitter` uses caching (`HashMap<usize, String>`) and cycle detection (`HashSet<usize>`) which adds some overhead.

## Files Involved
- `src/compiler/wasm/rust/oscilla-naga-shim/src/lib.rs` — Entire Rust shim
- `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts` — IR producer (types)
- `src/compiler/naga-bridge.ts` — TS bridge to WASM
- `src/compiler/naga-compile.ts` — Orchestration

## Suggested Approach
### Option A: Build `naga::Module` directly (spec-aligned)
1. Map `NagaTypeIR` -> `naga::Type` arena
2. Map `NagaConstantIR` -> `naga::Constant` arena
3. Map `NagaExpressionIR` -> `naga::Expression` arena (resolving named buffers to global variable handles)
4. Map `NagaStatementIR` -> `naga::Statement` blocks
5. Skip WGSL string emission + parse
6. Validate directly with `naga::valid::Validator`
7. Emit via `naga::back::wgsl::write_string`

### Option B: Keep current approach but document the deviation
The round-trip through parse + validate ensures safety. The performance cost is acceptable for graphs < 500 nodes. Document the deviation from spec.

## Risks
- Option A requires significant Rust changes and deep familiarity with Naga's internal arena structure
- Naga's serde format may differ between versions, requiring pinning
- Option B is safe but contradicts spec's "no string math" invariant
