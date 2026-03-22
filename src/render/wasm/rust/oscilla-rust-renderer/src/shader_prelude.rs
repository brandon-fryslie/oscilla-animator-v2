// [LAW:one-source-of-truth] Canonical shared WGSL prelude parsed once via naga.
// Provides Handle<Function> for get_hardened_bezier_data so compute pipeline
// builders can emit Expression::Call without duplicating Bezier math.

use naga::valid::{Capabilities, ValidationFlags, Validator};
use naga::{Handle, Function, Module};

/// WGSL source for the shared prelude (embedded from shader_prelude.wgsl).
const PRELUDE_WGSL: &str = include_str!("shader_prelude.wgsl");

/// Parsed and validated prelude module with function handle lookup.
pub struct ShaderPrelude {
    module: Module,
    hardened_bezier_handle: Handle<Function>,
}

impl ShaderPrelude {
    /// Parse the shared WGSL prelude and validate it.
    ///
    /// Panics if the prelude WGSL is malformed (build-time invariant).
    pub fn new() -> Self {
        let module = naga::front::wgsl::parse_str(PRELUDE_WGSL)
            .expect("[LAW:no-silent-fallbacks] shader prelude WGSL must parse cleanly");

        let mut validator = Validator::new(ValidationFlags::all(), Capabilities::empty());
        validator
            .validate(&module)
            .expect("[LAW:no-silent-fallbacks] shader prelude must validate");

        // Look up the canonical function by name.
        let hardened_bezier_handle = module
            .functions
            .iter()
            .find(|(_, f)| f.name.as_deref() == Some("get_hardened_bezier_data"))
            .map(|(h, _)| h)
            .expect("[LAW:one-source-of-truth] get_hardened_bezier_data must exist in prelude");

        Self {
            module,
            hardened_bezier_handle,
        }
    }

    /// The parsed naga Module containing shared prelude functions.
    pub fn module(&self) -> &Module {
        &self.module
    }

    /// Handle to the `get_hardened_bezier_data` function in the prelude module.
    ///
    /// Compute pipeline builders use this to emit `Expression::Call` referencing
    /// the shared hardened Bezier evaluation instead of duplicating the logic.
    pub fn hardened_bezier_fn(&self) -> Handle<Function> {
        self.hardened_bezier_handle
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prelude_parses_and_validates() {
        let prelude = ShaderPrelude::new();
        // Confirm the function was found
        let func = &prelude.module().functions[prelude.hardened_bezier_fn()];
        assert_eq!(func.name.as_deref(), Some("get_hardened_bezier_data"));
        // Function should take 5 arguments: p0, p1, p2, p3, t
        assert_eq!(func.arguments.len(), 5);
    }
}
