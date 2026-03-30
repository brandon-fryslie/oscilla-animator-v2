// oscilla-naga-translator: Naga AST builder DSL
//
// This crate provides a type-safe DSL for constructing naga::Module objects
// (ModuleBuilder, FnBuilder, FnBodyBuilder). The AST translator in
// oscilla-rust-renderer will use this DSL to convert ExprIR/StatementIR
// from the JS compiler into GPU shader modules.
//
// NOTE: Currently builds against naga 0.19. The renderer uses naga 24.0.
// The rebuild workstream must align these versions before integration.

pub mod lowering;

pub use lowering::dsl::{Expr, FnBodyBuilder, FnBuilder, ModuleBuilder};

use wasm_bindgen::prelude::*;

/// Minimal WASM init (panic hook only). The compile_ir export has been removed —
/// all translation will happen inside oscilla-rust-renderer, not this crate.
#[wasm_bindgen]
pub fn init() {
    console_error_panic_hook::set_once();
}
