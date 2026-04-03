//! WGSL function registration: parse registered WGSL source into Naga modules,
//! transplant referenced functions into shader modules during translation.
//!
//! [LAW:one-source-of-truth] Function definitions live in TypeScript (boundary contract).
//! This module only parses and transplants — it does not define any functions.

use std::collections::HashMap;

use crate::contract::WgslFunction;

/// A parsed WGSL function ready for transplant into shader modules.
pub struct ParsedFunction {
    /// The Naga module containing the function and its helpers
    pub module: naga::Module,
    /// Validated module info
    pub info: naga::valid::ModuleInfo,
    /// Name of the entrypoint function within the module
    pub entrypoint: String,
}

/// Parse all registered WGSL functions into Naga modules.
/// Called once at pipeline install time.
pub fn parse_registered_functions(
    functions: &[WgslFunction],
) -> Result<HashMap<String, ParsedFunction>, String> {
    let mut parsed = HashMap::new();

    for func in functions {
        let module = naga::front::wgsl::parse_str(&func.wgsl).map_err(|e| {
            format!(
                "Failed to parse WGSL for function '{}': {:?}",
                func.name, e
            )
        })?;

        let info = naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        )
        .validate(&module)
        .map_err(|e| {
            format!(
                "WGSL validation failed for function '{}': {:?}",
                func.name, e
            )
        })?;

        // Verify the entrypoint function exists in the parsed module
        let found = module
            .functions
            .iter()
            .any(|(_, f)| f.name.as_deref() == Some(&func.entrypoint));
        if !found {
            return Err(format!(
                "Function '{}': entrypoint '{}' not found in WGSL source",
                func.name, func.entrypoint
            ));
        }

        parsed.insert(
            func.name.clone(),
            ParsedFunction {
                module,
                info,
                entrypoint: func.entrypoint.clone(),
            },
        );
    }

    Ok(parsed)
}

/// Ensure a registered function is transplanted into the target module.
/// Returns the Handle<Function> for the transplanted entrypoint.
///
/// TODO: Implement Naga arena handle remapping (follow-up plan).
/// Currently returns an error indicating transplant is not yet implemented.
pub fn ensure_transplanted(
    _dst: &mut naga::Module,
    _parsed: &HashMap<String, ParsedFunction>,
    name: &str,
) -> Result<naga::Handle<naga::Function>, String> {
    Err(format!(
        "WGSL function '{}' is registered but transplant is not yet implemented. \
         This will be resolved in the Naga arena transplant follow-up.",
        name
    ))
}
