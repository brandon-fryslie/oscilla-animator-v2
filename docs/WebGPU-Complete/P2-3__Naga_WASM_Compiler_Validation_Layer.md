This is the comprehensive technical specification for **The Compiler Architecture: The Naga Validation Layer (WASM)**.

This document defines the interface and implementation of the **Custom Rust Shim** that acts as the bridge between your TypeScript compiler and the Naga Rust crate. Because standard npm packages (like naga-wasm) operate on *strings* (WGSL \$\to\$ GLSL), they are insufficient for our architecture. We are injecting raw **IR**, which requires a bespoke binary.

# The Naga Validation Layer (WASM)

**Objective:** Validate the TypeScript-generated IR against the strict rules of the WebGPU standard and emit optimized WGSL.

**Invariant:** Any module that passes this layer is guaranteed to be safe for the browser's GPU driver.

**Mechanism:** A custom-built Rust library, compiled to WebAssembly, using serde to hydrate JSON from the JS heap into native Rust structs.

## 1. The Rust Shim Architecture (src/lib.rs)

We must build a minimal Rust crate whose only job is to receive a JSON blob and return a WGSL string or a JSON error report.

### 1.1 Dependencies (Cargo.toml)

We enable the serialize feature in Naga to allow it to ingest our JSON.

Ini, TOML

\[package\]\
name = "oscilla-naga-shim"\
version = "0.1.0"\
edition = "2021"\
publish = false\
\
\[lib\]\
crate-type = \["cdylib"\]\
\
\[dependencies\]\
\# The Star of the Show\
naga = { version = "0.19", features = \["wgsl-out", "serialize", "validate"\] }\
\
\# The Bridge\
wasm-bindgen = "0.2"\
serde = { version = "1.0", features = \["derive"\] }\
serde_json = "1.0"\
console_error_panic_hook = "0.1"

### 1.2 The Interface (lib.rs)

This is the exact logical flow of the Rust code.

Rust

use wasm_bindgen::prelude::\*;\
use naga::{Module, valid::{Validator, ValidationFlags, Capabilities}};\
\
// 1. The Input DTO (Data Transfer Object)\
// We treat the input as a generic JsValue (JSON object)\
// Naga's Serde impl handles the deep structure.\
\
// 2. The Output DTOs\
\#\[derive(serde::Serialize)\]\
pub struct CompilationResult {\
pub wgsl: String,\
pub is_valid: bool,\
pub errors: Vec\<FormattedError\>,\
}\
\
\#\[derive(serde::Serialize)\]\
pub struct FormattedError {\
pub message: String,\
pub location: String, // "Expression \[42\]" or "Block \[10\]"\
pub path: String, // "Function \[main\] -\> Statement \[5\]"\
}\
\
\#\[wasm_bindgen\]\
pub fn compile_ir(json_data: JsValue) -\> JsValue {\
// A. Panic Hook (for easy debugging in Browser Console)\
console_error_panic_hook::set_once();\
\
// B. Deserialize (JS -\> Rust)\
// This turns your TypeScript "NagaModule" interface into a real naga::Module\
let module: Module = match serde_wasm_bindgen::from_value(json_data) {\
Ok(m) =\> m,\
Err(e) =\> return error_to_js(format!("Deserialization Failure: {}", e)),\
};\
\
// C. Validate\
let mut validator = Validator::new(ValidationFlags::all(), Capabilities::all());\
let module_info = match validator.validate(&module) {\
Ok(info) =\> info,\
Err(e) =\> return validation_error_to_js(e, &module),\
};\
\
// D. Emit WGSL\
let mut wgsl_out = String::new();\
let flags = naga::back::wgsl::WriterFlags::empty();\
let mut writer = naga::back::wgsl::Writer::new(&mut wgsl_out, flags);\
\
match writer.write(&module, &module_info) {\
Ok(\_) =\> {\
let res = CompilationResult {\
wgsl: wgsl_out,\
is_valid: true,\
errors: vec\![\],\
};\
serde_wasm_bindgen::to_value(&res).unwrap()\
},\
Err(e) =\> error_to_js(format!("Emission Failure: {}", e)),\
}\
}

## 2. The TypeScript Bridge (src/compiler/naga-bridge.ts)

This service manages the WASM instance and handles the data marshalling.

### 2.1 The Initialization (boot)

The boot() function must be called during app startup. It fetches the .wasm file.

TypeScript

import init, { compile_ir } from './wasm/oscilla_naga_shim';\
\
export class NagaService {\
private static isReady = false;\
\
static async boot() {\
if (this.isReady) return;\
await init(); // Fetches and instantiates the WASM\
this.isReady = true;\
}\
\
static compile(ir: NagaModule): CompilationResult {\
if (!this.isReady) throw new Error("Compiler not booted");\
\
// 1. Serialization happens implicitly here.\
// The 'ir' object is copied into WASM memory by bindgen.\
const result = compile_ir(ir);\
\
if (!result.is_valid) {\
throw new NagaValidationError(result.errors);\
}\
\
return result;\
}\
}

## 3. The Validation Strategy (Rust Error Mapping)

Naga's validation errors are precise but dense (e.g., Type mismatch: \[1\] is not \[2\]). We need to map these back to the user's graph.

### 3.1 The Rust Side (validation_error_to_js)

The Validator returns a WithSpan\<ValidationError\>.

- **Span:** A byte offset or ID.

- **Inner:** The logic error (e.g., Expression::Binary operands mismatch).

The Shim must traverse the error path to find the **Handle ID** (e.g., Expression Handle 45).

- *Action:* formatting the error string to include the Handle ID: "Expression \[45\] (Op: Add) invalid: Left operand type \[1\] (f32) does not match Right operand type \[2\] (vec3)".

### 3.2 The TypeScript Side (Source Mapping)

Your LoweringPipeline produced a SourceMap:

TypeScript

const sourceMap = {\
"Expr_45": "Node_102" // Expr 45 came from Block 102 (Math Add)\
};

When NagaService throws an error citing Expression \[45\]:

1.  Parse the error string to extract 45.

2.  Lookup 45 in sourceMap.

3.  Highlight Node_102 in the UI.

## 4. Performance Considerations

### 4.1 The Serialization Tax

Copying a large JSON object (e.g., 5000 nodes) from JS to WASM can take 2-4ms.

- **Optimization (Future):** If this becomes a bottleneck, we switch from serde_json to bincode. You would use a TS library to write binary structs into a Uint8Array and pass that zero-copy to WASM.

- **Phase 0/1 Decision:** Stick to JSON. It is debuggable and fast enough for \<1000 blocks.

### 4.2 The Module Size

The compiled WASM binary will be approximately **600KB - 1.2MB** (gzipped).

- **Mitigation:** Load it via \<link rel="preload"\> or start the fetch in a WebWorker immediately upon page load. Do not block the initial UI render on this.

## 5. Summary of Implementation Steps

1.  **Scaffold Rust:** Run cargo new --lib oscilla-naga-shim.

2.  **Configure Build:** Set up wasm-pack to target web.

3.  **Implement Shim:** Write the lib.rs code shown above.

4.  **Build:** Run wasm-pack build --target web --release.

5.  **Integrate:** Copy the pkg/ folder to your frontend public/wasm/ or src/wasm/ folder.

6.  **Update Compiler:** Change the AsyncCompilerService to call NagaService.compile(ir) instead of generating strings.

This layer is your safety net. It guarantees that no matter what logic errors exist in your TypeScript compiler, you will never crash the user's GPU driver, because Naga catches the bad math first.
