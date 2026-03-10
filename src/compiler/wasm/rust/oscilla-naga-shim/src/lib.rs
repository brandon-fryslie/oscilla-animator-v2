use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Serialize)]
pub struct FormattedError {
    pub message: String,
    pub location: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompilationResult {
    pub wgsl: String,
    pub is_valid: bool,
    pub errors: Vec<FormattedError>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
enum NagaScalarKindIR {
    F32,
    U32,
    Bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum NagaTypeIR {
    Scalar {
        scalar: NagaScalarKindIR,
        width: u8,
    },
    Vector {
        size: u8,
        scalar: NagaScalarKindIR,
        width: u8,
    },
    Array {
        base: usize,
        size: String,
    },
    Struct {
        name: String,
        fields: Vec<NagaStructFieldIR>,
    },
}

#[derive(Debug, Clone, Deserialize)]
struct NagaStructFieldIR {
    name: String,
    #[serde(rename = "type")]
    type_index: usize,
}

#[derive(Debug, Clone, Deserialize)]
struct NagaConstantIR {
    #[serde(rename = "type")]
    type_index: usize,
    value: f64,
}

#[derive(Debug, Clone, Deserialize)]
struct NagaBindingIR {
    group: u32,
    binding: u32,
}

#[derive(Debug, Clone, Deserialize)]
struct NagaGlobalVariableIR {
    name: String,
    #[serde(rename = "storageClass")]
    storage_class: String,
    access: String,
    binding: NagaBindingIR,
    #[serde(rename = "type")]
    type_index: usize,
}

#[derive(Debug, Clone, Deserialize)]
struct NagaFunctionArgumentIR {
    name: String,
    #[serde(rename = "type")]
    type_index: usize,
    builtin: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
enum NagaBinaryOpIR {
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Lt,
    Le,
    Gt,
    Ge,
    Eq,
    Ne,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum NagaExpressionIR {
    Argument {
        argument: usize,
    },
    Constant {
        constant: usize,
    },
    AccessIndex {
        base: usize,
        index: usize,
    },
    Binary {
        op: NagaBinaryOpIR,
        left: usize,
        right: usize,
    },
    BufferLoad {
        buffer: String,
        index: usize,
    },
    As {
        to: NagaScalarKindIR,
        expr: usize,
    },
    Call {
        function: String,
        args: Vec<usize>,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum NagaStatementIR {
    Store {
        buffer: String,
        index: usize,
        value: usize,
        comment: Option<String>,
    },
    Comment {
        text: String,
    },
    If {
        condition: usize,
        accept: Vec<usize>,
        reject: Vec<usize>,
    },
    Loop {
        body: Vec<usize>,
    },
    Break,
    Continue,
    Return,
}

#[derive(Debug, Clone, Deserialize)]
struct NagaFunctionIR {
    name: String,
    arguments: Vec<NagaFunctionArgumentIR>,
    expressions: Vec<NagaExpressionIR>,
    statements: Vec<NagaStatementIR>,
    body: Vec<usize>,
}

#[derive(Debug, Clone, Deserialize)]
struct NagaEntryPointIR {
    stage: String,
    function: String,
    #[serde(rename = "workgroupSize")]
    workgroup_size: [u32; 3],
}

#[derive(Debug, Clone, Deserialize)]
struct NagaModuleIR {
    types: Vec<NagaTypeIR>,
    constants: Vec<NagaConstantIR>,
    #[serde(rename = "global_variables")]
    global_variables: Vec<NagaGlobalVariableIR>,
    functions: Vec<NagaFunctionIR>,
    #[serde(rename = "entry_points")]
    entry_points: Vec<NagaEntryPointIR>,
}

struct ExpressionEmitter<'a> {
    function_ir: &'a NagaFunctionIR,
    module_ir: &'a NagaModuleIR,
    cache: HashMap<usize, String>,
    stack: HashSet<usize>,
}

fn make_error(message: impl Into<String>, location: impl Into<String>, path: impl Into<String>) -> FormattedError {
    FormattedError {
        message: message.into(),
        location: location.into(),
        path: path.into(),
    }
}

fn scalar_to_wgsl(scalar: NagaScalarKindIR) -> &'static str {
    match scalar {
        NagaScalarKindIR::F32 => "f32",
        NagaScalarKindIR::U32 => "u32",
        NagaScalarKindIR::Bool => "bool",
    }
}

fn format_scalar_literal(value: f64, scalar: NagaScalarKindIR) -> String {
    match scalar {
        NagaScalarKindIR::U32 => {
            let int_value = value.trunc() as i64;
            format!("{}u", int_value.max(0))
        }
        NagaScalarKindIR::Bool => {
            if value == 0.0 {
                "false".to_owned()
            } else {
                "true".to_owned()
            }
        }
        NagaScalarKindIR::F32 => {
            if value.fract() == 0.0 {
                format!("{value:.1}")
            } else {
                value.to_string()
            }
        }
    }
}

fn emit_type_ref(type_index: usize, types: &[NagaTypeIR]) -> Result<String, FormattedError> {
    let ty = types.get(type_index).ok_or_else(|| {
        make_error(
            format!("Type handle not found: {type_index}"),
            "Module",
            format!("Type[{type_index}]"),
        )
    })?;

    match ty {
        NagaTypeIR::Scalar { scalar, width } => {
            if *width != 4 {
                return Err(make_error(
                    format!("Unsupported scalar width: {width}"),
                    "Module",
                    format!("Type[{type_index}]"),
                ));
            }
            Ok(scalar_to_wgsl(*scalar).to_owned())
        }
        NagaTypeIR::Vector { size, scalar, width } => {
            if *width != 4 {
                return Err(make_error(
                    format!("Unsupported vector width: {width}"),
                    "Module",
                    format!("Type[{type_index}]"),
                ));
            }
            if !(2..=4).contains(size) {
                return Err(make_error(
                    format!("Unsupported vector size: {size}"),
                    "Module",
                    format!("Type[{type_index}]"),
                ));
            }
            Ok(format!("vec{size}<{}>", scalar_to_wgsl(*scalar)))
        }
        NagaTypeIR::Array { base, size } => {
            if size != "dynamic" {
                return Err(make_error(
                    format!("Unsupported array size kind: {size}"),
                    "Module",
                    format!("Type[{type_index}]"),
                ));
            }
            Ok(format!("array<{}>", emit_type_ref(*base, types)?))
        }
        NagaTypeIR::Struct { name, .. } => Ok(name.clone()),
    }
}

fn emit_structs(types: &[NagaTypeIR]) -> Result<Vec<String>, FormattedError> {
    let mut lines: Vec<String> = Vec::new();
    for (type_index, ty) in types.iter().enumerate() {
        if let NagaTypeIR::Struct { name, fields } = ty {
            lines.push(format!("struct {name} {{"));
            for field in fields {
                lines.push(format!(
                    "  {}: {},",
                    field.name,
                    emit_type_ref(field.type_index, types)?
                ));
            }
            lines.push("};".to_owned());
            lines.push(String::new());
        } else {
            let _ = type_index;
        }
    }
    Ok(lines)
}

impl<'a> ExpressionEmitter<'a> {
    fn new(function_ir: &'a NagaFunctionIR, module_ir: &'a NagaModuleIR) -> Self {
        Self {
            function_ir,
            module_ir,
            cache: HashMap::new(),
            stack: HashSet::new(),
        }
    }

    fn emit(&mut self, expr_id: usize) -> Result<String, FormattedError> {
        if let Some(value) = self.cache.get(&expr_id) {
            return Ok(value.clone());
        }
        if self.stack.contains(&expr_id) {
            return Err(make_error(
                "Expression cycle detected",
                format!("Expression [{expr_id}]"),
                format!("Function [{}]", self.function_ir.name),
            ));
        }

        let expr = self.function_ir.expressions.get(expr_id).ok_or_else(|| {
            make_error(
                "Expression handle not found",
                format!("Expression [{expr_id}]"),
                format!("Function [{}]", self.function_ir.name),
            )
        })?;

        self.stack.insert(expr_id);

        let emitted = match expr {
            NagaExpressionIR::Argument { argument } => {
                let arg = self.function_ir.arguments.get(*argument).ok_or_else(|| {
                    make_error(
                        "Argument handle not found",
                        format!("Expression [{expr_id}]"),
                        format!("Function [{}] -> Argument [{argument}]", self.function_ir.name),
                    )
                })?;
                arg.name.clone()
            }
            NagaExpressionIR::Constant { constant } => {
                let constant_ir = self.module_ir.constants.get(*constant).ok_or_else(|| {
                    make_error(
                        "Constant handle not found",
                        format!("Expression [{expr_id}]"),
                        format!("Function [{}] -> Constant [{constant}]", self.function_ir.name),
                    )
                })?;
                let scalar = match self.module_ir.types.get(constant_ir.type_index) {
                    Some(NagaTypeIR::Scalar { scalar, .. }) => *scalar,
                    _ => {
                        return Err(make_error(
                            "Constant scalar type is missing",
                            format!("Expression [{expr_id}]"),
                            format!(
                                "Function [{}] -> Constant [{constant}] -> Type [{}]",
                                self.function_ir.name, constant_ir.type_index
                            ),
                        ));
                    }
                };
                format_scalar_literal(constant_ir.value, scalar)
            }
            NagaExpressionIR::AccessIndex { base, index } => {
                let base_expr = self.emit(*base)?;
                let component = match index {
                    0 => "x",
                    1 => "y",
                    2 => "z",
                    3 => "w",
                    _ => {
                        return Err(make_error(
                            "access_index out of range",
                            format!("Expression [{expr_id}]"),
                            format!("Function [{}]", self.function_ir.name),
                        ));
                    }
                };
                format!("{base_expr}.{component}")
            }
            NagaExpressionIR::Binary { op, left, right } => {
                let left_expr = self.emit(*left)?;
                let right_expr = self.emit(*right)?;
                let op_token = match op {
                    NagaBinaryOpIR::Add => "+",
                    NagaBinaryOpIR::Sub => "-",
                    NagaBinaryOpIR::Mul => "*",
                    NagaBinaryOpIR::Div => "/",
                    NagaBinaryOpIR::Mod => "%",
                    NagaBinaryOpIR::Lt => "<",
                    NagaBinaryOpIR::Le => "<=",
                    NagaBinaryOpIR::Gt => ">",
                    NagaBinaryOpIR::Ge => ">=",
                    NagaBinaryOpIR::Eq => "==",
                    NagaBinaryOpIR::Ne => "!=",
                };
                format!("({left_expr} {op_token} {right_expr})")
            }
            NagaExpressionIR::BufferLoad { buffer, index } => {
                let index_expr = self.emit(*index)?;
                format!("{buffer}[{index_expr}]")
            }
            NagaExpressionIR::As { to, expr } => {
                let source = self.emit(*expr)?;
                match to {
                    NagaScalarKindIR::Bool => format!("({source} != 0u)"),
                    _ => format!("bitcast<{}>({source})", scalar_to_wgsl(*to)),
                }
            }
            NagaExpressionIR::Call { function, args } => {
                let mut emitted_args: Vec<String> = Vec::with_capacity(args.len());
                for arg in args {
                    emitted_args.push(self.emit(*arg)?);
                }
                format!("{function}({})", emitted_args.join(", "))
            }
        };

        self.stack.remove(&expr_id);
        self.cache.insert(expr_id, emitted.clone());
        Ok(emitted)
    }
}

fn emit_statement_block(
    function_ir: &NagaFunctionIR,
    module_ir: &NagaModuleIR,
    emitter: &mut ExpressionEmitter,
    statement_handles: &[usize],
    indent_level: usize,
    statement_stack: &mut HashSet<usize>,
) -> Result<Vec<String>, FormattedError> {
    let mut lines: Vec<String> = Vec::new();

    for statement_handle in statement_handles {
        if statement_stack.contains(statement_handle) {
            return Err(make_error(
                "Statement cycle detected",
                format!("Statement [{statement_handle}]"),
                format!("Function [{}]", function_ir.name),
            ));
        }

        let statement = function_ir
            .statements
            .get(*statement_handle)
            .ok_or_else(|| {
                make_error(
                    "Statement handle not found",
                    format!("Statement [{statement_handle}]"),
                    format!("Function [{}]", function_ir.name),
                )
            })?;

        statement_stack.insert(*statement_handle);
        let indent = "  ".repeat(indent_level);

        match statement {
            NagaStatementIR::Store {
                buffer,
                index,
                value,
                comment,
            } => {
                let index_expr = emitter.emit(*index)?;
                let value_expr = emitter.emit(*value)?;
                let mut line = format!("{indent}{buffer}[{index_expr}] = {value_expr};");
                if let Some(comment_value) = comment {
                    if !comment_value.is_empty() {
                        line.push_str(" // ");
                        line.push_str(comment_value);
                    }
                }
                lines.push(line);
            }
            NagaStatementIR::Comment { text } => {
                lines.push(format!("{indent}// {text}"));
            }
            NagaStatementIR::If {
                condition,
                accept,
                reject,
            } => {
                let condition_expr = emitter.emit(*condition)?;
                lines.push(format!("{indent}if ({condition_expr}) {{"));
                let accept_lines = emit_statement_block(
                    function_ir,
                    module_ir,
                    emitter,
                    accept,
                    indent_level + 1,
                    statement_stack,
                )?;
                lines.extend(accept_lines);
                lines.push(format!("{indent}}} else {{"));
                let reject_lines = emit_statement_block(
                    function_ir,
                    module_ir,
                    emitter,
                    reject,
                    indent_level + 1,
                    statement_stack,
                )?;
                lines.extend(reject_lines);
                lines.push(format!("{indent}}}"));
            }
            NagaStatementIR::Loop { body } => {
                lines.push(format!("{indent}loop {{"));
                let body_lines = emit_statement_block(
                    function_ir,
                    module_ir,
                    emitter,
                    body,
                    indent_level + 1,
                    statement_stack,
                )?;
                lines.extend(body_lines);
                lines.push(format!("{indent}}}"));
            }
            NagaStatementIR::Break => {
                lines.push(format!("{indent}break;"));
            }
            NagaStatementIR::Continue => {
                lines.push(format!("{indent}continue;"));
            }
            NagaStatementIR::Return => {
                lines.push(format!("{indent}return;"));
            }
        }

        let _ = module_ir;
        statement_stack.remove(statement_handle);
    }

    Ok(lines)
}

fn emit_module_to_wgsl(module_ir: &NagaModuleIR, max_active_lanes: Option<u32>) -> Result<String, FormattedError> {
    let compute_entry = module_ir
        .entry_points
        .iter()
        .find(|entry| entry.stage == "compute")
        .ok_or_else(|| make_error("Missing compute entry point", "EntryPoint", "Module"))?;

    let function_ir = module_ir
        .functions
        .iter()
        .find(|candidate| candidate.name == compute_entry.function)
        .ok_or_else(|| {
            make_error(
                format!("Entry point function '{}' not found", compute_entry.function),
                "EntryPoint",
                "Module",
            )
        })?;

    let mut lines: Vec<String> = Vec::new();
    lines.extend(emit_structs(&module_ir.types)?);

    for global in &module_ir.global_variables {
        let type_ref = emit_type_ref(global.type_index, &module_ir.types)?;
        if global.storage_class == "uniform" {
            lines.push(format!(
                "@group({}) @binding({}) var<uniform> {}: {};",
                global.binding.group, global.binding.binding, global.name, type_ref
            ));
        } else {
            lines.push(format!(
                "@group({}) @binding({}) var<storage, {}> {}: {};",
                global.binding.group, global.binding.binding, global.access, global.name, type_ref
            ));
        }
    }

    lines.push(String::new());

    let mut arg_parts: Vec<String> = Vec::new();
    for argument in &function_ir.arguments {
        let type_ref = emit_type_ref(argument.type_index, &module_ir.types)?;
        let arg = if let Some(builtin) = &argument.builtin {
            format!("@builtin({builtin}) {}: {}", argument.name, type_ref)
        } else {
            format!("{}: {}", argument.name, type_ref)
        };
        arg_parts.push(arg);
    }

    if let Some(max_lanes) = max_active_lanes {
        let lane_bound = max_lanes.max(1);
        lines.push(format!("const MAX_ACTIVE_LANES: u32 = {lane_bound}u;"));
    }

    lines.push(format!(
        "@compute @workgroup_size({}, {}, {})",
        compute_entry.workgroup_size[0], compute_entry.workgroup_size[1], compute_entry.workgroup_size[2]
    ));
    lines.push(format!("fn {}({}) {{", function_ir.name, arg_parts.join(", ")));

    if let Some(max_lanes) = max_active_lanes {
        let gid_arg = function_ir
            .arguments
            .iter()
            .find(|arg| arg.builtin.as_deref() == Some("global_invocation_id"));
        if let Some(gid) = gid_arg {
            lines.push(format!("  let lane = {}.x;", gid.name));
            lines.push("  if (lane >= MAX_ACTIVE_LANES) {".to_owned());
            lines.push("    return;".to_owned());
            lines.push("  }".to_owned());
        }
        let _ = max_lanes;
    }

    let mut emitter = ExpressionEmitter::new(function_ir, module_ir);
    let mut statement_stack: HashSet<usize> = HashSet::new();
    let body_lines = emit_statement_block(
        function_ir,
        module_ir,
        &mut emitter,
        &function_ir.body,
        1,
        &mut statement_stack,
    )?;
    lines.extend(body_lines);

    lines.push("}".to_owned());

    Ok(lines.join("\n"))
}

fn compile_internal(module_ir: NagaModuleIR, max_active_lanes: Option<u32>) -> Result<String, Vec<FormattedError>> {
    let emitted_wgsl = emit_module_to_wgsl(&module_ir, max_active_lanes).map_err(|error| vec![error])?;

    let module = naga::front::wgsl::parse_str(&emitted_wgsl).map_err(|error| {
        vec![make_error(
            format!("WGSL Parse Failure: {error}"),
            "Module",
            "WGSL parse",
        )]
    })?;

    let mut validator = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    );
    let module_info = validator.validate(&module).map_err(|error| {
        vec![make_error(
            format!("Validation Failure: {error}"),
            "Module",
            "Naga validator",
        )]
    })?;

    let canonical_wgsl = naga::back::wgsl::write_string(
        &module,
        &module_info,
        naga::back::wgsl::WriterFlags::empty(),
    )
    .map_err(|error| vec![make_error(format!("Emission Failure: {error}"), "Module", "WGSL emit")])?;

    Ok(canonical_wgsl)
}

#[wasm_bindgen]
pub fn compile_ir(module_ir: JsValue, max_active_lanes: Option<u32>) -> JsValue {
    console_error_panic_hook::set_once();

    let module: NagaModuleIR = match serde_wasm_bindgen::from_value(module_ir) {
        Ok(module) => module,
        Err(error) => {
            let result = CompilationResult {
                wgsl: String::new(),
                is_valid: false,
                errors: vec![make_error(
                    format!("Deserialization Failure: {error}"),
                    "Module",
                    "serde_wasm_bindgen",
                )],
            };
            return serde_wasm_bindgen::to_value(&result).expect("failed to serialize compile result");
        }
    };

    let result = match compile_internal(module, max_active_lanes) {
        Ok(wgsl) => CompilationResult {
            wgsl,
            is_valid: true,
            errors: vec![],
        },
        Err(errors) => CompilationResult {
            wgsl: String::new(),
            is_valid: false,
            errors,
        },
    };

    serde_wasm_bindgen::to_value(&result).expect("failed to serialize compile result")
}

#[wasm_bindgen]
pub fn init() {
    console_error_panic_hook::set_once();
}
