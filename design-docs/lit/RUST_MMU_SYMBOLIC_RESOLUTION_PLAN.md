# Engineering Spec: Fixing the Symbolic Memory Resolution Bug

**TICKET:** `oscilla-phase-1-rust-mmu-0m3.1`

## 1. The Problem: A Broken Architectural Contract

The engine is crashing with a `serde` deserialization error: `unknown variant 'load_symbolic'`.

This proves a critical failure in the Phase 1 architecture:
1.  **TypeScript Side (Correctly Implemented):** `ScheduleNagaLowering.ts` is correctly emitting a high-level, symbolic instruction, `load_symbolic`, as specified in the architecture plan. This instruction correctly contains a symbolic `resourceId` (e.g., "state:velocities") instead of a physical memory address.
2.  **Rust Side (Incomplete Implementation):** The Rust WASM module's `NagaExpressionIR` enum, which is supposed to represent the low-level, physical Naga AST, was incorrectly modified to include a `LoadSymbolic` variant. The running binary is out of sync and expects an older variant. More importantly, there is **no translation layer** to perform the central duty of the MMU: resolving the symbolic ID into a physical memory address calculation.

The goal is to implement this missing translation layer.

## 2. The Plan: Translate, Don't Deserialize

We will stop trying to deserialize a high-level symbolic instruction directly into the low-level Naga Expression Arena. Instead, we will:
1.  Define a new, separate Rust struct that exactly matches the high-level IR coming from TypeScript.
2.  Receive this high-level IR in Rust.
3.  Iterate through it. For each `load_symbolic` instruction, we will call the `SymbolResolver` to get the physical memory layout.
4.  **Dynamically generate** the series of low-level `NagaExpressionIR` nodes (Adds, Muls, AccessIndexes) that perform the physical address calculation: `base_offset + (lane * stride)`.
5.  Push these *new, low-level* expressions into Naga's arena.

This correctly isolates TypeScript from memory layout and makes the Rust MMU the sole authority for memory addresses.

## 3. Step-by-Step Implementation Guide

### STEP 1: Define the High-Level IR in Rust

The Rust code needs a new set of structs that exactly mirror the `NagaEmitterInstruction` and `NagaExpressionIR` types from `ScheduleNagaLowering.ts`.

**File to Edit:** `src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs`

**Action:** Add the following new `*_ts` (TypeScript) struct definitions at the top of the file. These will be used for deserialization from the JS side.

```rust
// ADD THESE STRUCTS
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NagaExpressionIR_TS {
    LoadSymbolic {
        resource_id: String,
        lane: usize,
        component: usize,
    },
    // Add other high-level variants from ScheduleNagaLowering.ts's NagaExpressionIR here
    // For now, we only need to handle LoadSymbolic to fix the bug.
    Argument { argument: usize },
    Constant { constant: usize },
    AccessIndex { base: usize, index: usize },
    Binary { op: NagaBinaryOpIR, left: usize, right: usize },
    LoadUniform { resource_id: String, index: usize },
    As { to: NagaScalarKindIR, expr: usize },
    Call { function: String, args: Vec<usize> },
}

#[derive(Debug, Clone, Deserialize)]
pub struct NagaFunctionIR_TS {
    pub name: String,
    pub arguments: Vec<NagaFunctionArgumentIR>,
    pub expressions: Vec<NagaExpressionIR_TS>, // This now uses the _TS enum
    pub statements: Vec<NagaStatementIR>, // Assuming statements are already 1:1
    pub body: Vec<usize>,
}
```

### STEP 2: Remove `LoadSymbolic` from the Low-Level IR

The low-level `NagaExpressionIR` enum should **only** represent physical Naga operations. `LoadSymbolic` does not belong here.

**File to Edit:** `src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs`

**Action:** Modify the existing `NagaExpressionIR` enum.

```rust
// This is the existing enum
#[derive(Debug, Clone, Deserialize)] 
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NagaExpressionIR {
    Argument { argument: usize },
    Constant { constant: usize },
    AccessIndex { base: usize, index: usize },
    Binary { op: NagaBinaryOpIR, left: usize, right: usize },
    
    // --- DELETE THIS LINE ---
    // LoadSymbolic { resource_id: String, lane: usize, component: usize },

    LoadUniform { resource_id: String, index: usize },
    As { to: NagaScalarKindIR, expr: usize },
    Call { function: String, args: Vec<usize> },
}
```

### STEP 3: Implement the Symbolic-to-Physical Translation Function

This is the core of the fix. We will create a function that takes the high-level IR and the `SymbolResolver` and produces the low-level IR.

**File to Edit:** `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` (or a more appropriate module)

**Action:** Add this new function.

```rust
// Add this function
use crate::memory::SymbolResolver;
use naga::{Expression, Handle};

fn translate_and_lower_expressions(
    naga_function: &mut naga::Function,
    ts_expressions: &[NagaExpressionIR_TS],
    symbol_resolver: &SymbolResolver,
) -> Result<Vec<Handle<Expression>>, anyhow::Error> {
    let mut ir_to_naga_handle_map: Vec<Option<Handle<Expression>>> = vec![None; ts_expressions.len()];

    for (i, expr_ts) in ts_expressions.iter().enumerate() {
        let naga_expr_handle = match expr_ts {
            NagaExpressionIR_TS::LoadSymbolic { resource_id, lane, component } => {
                let resolved = symbol_resolver.map.get(resource_id)
                    .ok_or_else(|| anyhow::anyhow!("Symbolic resource not found: {}", resource_id))?;

                // 1. Get pre-lowered handles for lane and component
                let lane_handle = ir_to_naga_handle_map[*lane].ok_or_else(|| anyhow::anyhow!("Topological sort failure on lane expr"))?;
                let component_handle = ir_to_naga_handle_map[*component].ok_or_else(|| anyhow::anyhow!("Topological sort failure on component expr"))?;

                // 2. Create constants for base_offset and strides
                let base_offset_const = naga_function.expressions.append(Expression::Constant(
                    // You need to resolve the constant type for u32 here
                ));
                let lane_stride_const = naga_function.expressions.append(Expression::Constant(/* ... */));
                let component_stride_const = naga_function.expressions.append(Expression::Constant(/* ... */));

                // 3. Generate Naga expressions for: (lane * lane_stride)
                let lane_offset = naga_function.expressions.append(Expression::Binary {
                    op: naga::BinaryOperator::Multiply,
                    left: lane_handle,
                    right: lane_stride_const,
                });

                // 4. Generate Naga expressions for: (component * component_stride)
                let component_offset = naga_function.expressions.append(Expression::Binary {
                    op: naga::BinaryOperator::Multiply,
                    left: component_handle,
                    right: component_stride_const,
                });
                
                // 5. Generate final address: base + lane_offset + component_offset
                let temp_addr = naga_function.expressions.append(Expression::Binary {
                    op: naga::BinaryOperator::Add,
                    left: base_offset_const,
                    right: lane_offset,
                });

                let final_addr = naga_function.expressions.append(Expression::Binary {
                    op: naga::BinaryOperator::Add,
                    left: temp_addr,
                    right: component_offset,
                });

                // This is a simplified example. The actual memory access might be via `AccessIndex`
                // on a buffer global. This is the logic that needs to be fully implemented.
                // For now, let's assume `final_addr` is the handle to the final memory location expression.
                final_addr
            }
            // ... handle other cases by simply translating them 1:1 ...
            _ => { /* ... */ }
        };
        ir_to_naga_handle_map[i] = Some(naga_expr_handle);
    }
    
    Ok(ir_to_naga_handle_map.into_iter().map(|h| h.unwrap()).collect())
}
```

*Note: The code snippet above is a conceptual guide. The exact Naga API calls for creating constants and binary expressions will need to be implemented correctly. This is where the agent's work lies.*

### STEP 4: Update the Main Pipeline to Use the Translation

**File to Edit:** `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` (where `rebuild_pipeline` is)

**Action:** Change the `rebuild_pipeline` function to deserialize the `*_TS` structs and call your new translation function.

```rust
// Find this function and modify it
pub fn rebuild_pipeline(
    &mut self,
    // ... other args ...
    compute_function_ir: JsValue,
) -> Result<(), JsValue> {

    // --- CHANGE THIS ---
    // Old: Directly deserialize into NagaFunctionIR
    // let function_ir: NagaFunctionIR = serde_wasm_bindgen::from_value(compute_function_ir)?;

    // New: Deserialize into the high-level _TS struct
    let function_ir_ts: NagaFunctionIR_TS = serde_wasm_bindgen::from_value(compute_function_ir)?;
    
    // ... create your naga::Module and naga::Function ...

    // --- CALL THE TRANSLATOR ---
    // This is the new, critical step
    let lowered_expression_handles = translate_and_lower_expressions(
        &mut naga_function,
        &function_ir_ts.expressions,
        &self.symbol_resolver, // Pass in the MMU's symbol map
    ).map_err(|e| e.to_string())?;

    // Now, continue the rest of the function, but instead of iterating `function_ir.expressions`,
    // you will use the `lowered_expression_handles` to build your statements and body.

    // ... rest of pipeline construction ...
}
```

## 4. Acceptance Criteria

1.  **[AC 1] Compilation Success:** The `pnpm run build:rust-renderer` command succeeds.
2.  **[AC 2] Deserialization Success:** The application no longer throws the `unknown variant 'load_symbolic'` error on startup.
3.  **[AC 3] Correct Rendering:** A simple demo patch (like `examples/simple.hcl` after migration) that uses `InstanceDomain` and `ScatterUV` successfully renders. This proves that the symbolic `resourceId` for the render target's `controlPoints` was correctly resolved to a physical buffer address by the new translation layer.
4.  **[AC 4] Unit Test:** A Rust unit test for `translate_and_lower_expressions` is created. It mocks a `SymbolResolver` with a known offset/stride and asserts that the generated `naga::Expression` handles for a `LoadSymbolic` input correctly form the `base + (lane * stride)` mathematical structure.

This detailed plan corrects the architectural flaw and ensures the Rust MMU performs its primary duty as the sole authority on memory layout.
