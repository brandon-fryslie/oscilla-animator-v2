# P2-3: Naga WASM Compiler Validation Layer - CRITICAL Items

## Item 1: Naga Shim Does NOT Use naga::Module Deserialization
**Spec says**: "We treat the input as a generic JsValue (JSON object). Naga's Serde impl handles the deep structure." The spec expects the TS-generated IR to deserialize directly into `naga::Module` via `serde_wasm_bindgen::from_value(json_data)`, which would then be validated by `naga::valid::Validator` and emitted via `naga::back::wgsl::Writer`.
**Implementation**: The Rust shim at `src/compiler/wasm/rust/oscilla-naga-shim/src/lib.rs:668-699` does NOT deserialize into `naga::Module`. Instead:
  1. It deserializes into custom `NagaModuleIR` (line 705) — a completely separate type hierarchy (`NagaTypeIR`, `NagaExpressionIR`, `NagaStatementIR`)
  2. It then EMITS WGSL as a string from this custom IR (line 669 `emit_module_to_wgsl`)
  3. It then PARSES the emitted WGSL back through `naga::front::wgsl::parse_str` (line 671)
  4. It then validates the parsed module via `naga::valid::Validator` (line 679-684)
  5. It then re-emits canonical WGSL via `naga::back::wgsl::write_string` (line 691-696)

This is a round-trip: `Custom IR -> WGSL string -> naga::Module -> validate -> canonical WGSL`. The spec envisioned `JSON -> naga::Module -> validate -> WGSL`. The current approach adds an extra serialization/parse round-trip.

**Gap**: The spec's approach of directly hydrating `naga::Module` via serde is not used. Instead, the shim manually emits WGSL source text from the custom IR, then parses it back into Naga for validation. This means:
  - The "zero syntax errors" guarantee from structured IR generation does NOT hold — the manual WGSL emitter at `lib.rs:327-461` can theoretically produce syntax errors.
  - The WGSL emission at `lib.rs:576-666` is essentially string concatenation (the very thing the spec says not to do).
  - However, the round-trip through `naga::front::wgsl::parse_str` + `naga::valid::Validator` catches any emission bugs, so the safety guarantee is still met.

**Classification**: CRITICAL — [LAW:no-string-math] violation within the Rust shim itself. The shim generates WGSL strings from structured data rather than building `naga::Module` directly. The validation safety net exists but the architecture contradicts the spec's core premise. This also adds ~2-5ms of unnecessary serialization overhead per compile.
