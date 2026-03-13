use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// =============================================================================
// Output Types
// =============================================================================

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

// =============================================================================
// IR Types — Family A format (matches TS naga-types.ts)
//
// [LAW:one-source-of-truth] These Rust structs mirror the TS NagaModule exactly.
// Discriminant fields use "type" with PascalCase values, matching the TS enums.
// =============================================================================

#[derive(Debug, Clone, Copy, Deserialize)]
enum NagaScalarKindIR {
    Sint,
    Uint,
    Float,
    Bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum NagaArraySizeIR {
    Dynamic(String),
    Fixed(u32),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind")]
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
    Matrix {
        columns: u8,
        rows: u8,
        width: u8,
    },
    Array {
        base: usize,
        size: NagaArraySizeIR,
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
    builtin: Option<String>,
    location: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum NagaConstantValueIR {
    Bool(bool),
    Number(f64),
    Array(Vec<f64>),
}

#[derive(Debug, Clone, Deserialize)]
struct NagaConstantIR {
    #[serde(rename = "type")]
    type_index: usize,
    value: NagaConstantValueIR,
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
enum NagaBinaryOpIR {
    Add,
    Subtract,
    Multiply,
    Divide,
    Modulo,
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
    Equal,
    NotEqual,
}

#[derive(Debug, Clone, Copy, Deserialize)]
enum NagaMathFunctionIR {
    Mix,
    Sin,
    Cos,
    Normalize,
    Min,
    Max,
    Abs,
    Atan2,
    Ceil,
    Clamp,
    Exp,
    Floor,
    Fract,
    Log,
    Pow,
    Round,
    Sign,
    Sqrt,
    Tan,
    Trunc,
}

// [LAW:one-source-of-truth] Expression discriminant is "type" (PascalCase).
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
enum NagaExpressionIR {
    Constant {
        constant: usize,
    },
    Binary {
        op: NagaBinaryOpIR,
        left: usize,
        right: usize,
    },
    Math {
        fun: NagaMathFunctionIR,
        arg: usize,
        arg1: Option<usize>,
        arg2: Option<usize>,
    },
    Select {
        condition: usize,
        accept: usize,
        reject: usize,
    },
    GlobalVariable {
        variable: usize,
    },
    Compose {
        ty: usize,
        components: Vec<usize>,
    },
    ArrayLength {
        expr: usize,
    },
    Access {
        base: usize,
        index: usize,
    },
    AccessIndex {
        base: usize,
        index: usize,
    },
    Load {
        pointer: usize,
    },
    As {
        expr: usize,
        kind: NagaScalarKindIR,
        convert: bool,
    },
    FunctionArgument {
        index: usize,
    },
    Call {
        function: usize,
        arguments: Vec<usize>,
    },
    AtomicResult {
        #[allow(dead_code)]
        kind: String,
        pointer: usize,
        value: usize,
    },
}

// [LAW:one-source-of-truth] Statement discriminant is "type" (PascalCase).
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
enum NagaStatementIR {
    Store {
        pointer: usize,
        value: usize,
    },
    StoreState {
        #[serde(rename = "stateKey")]
        state_key: String,
        value: usize,
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
    Return {
        value: Option<usize>,
    },
}

#[derive(Debug, Clone, Deserialize)]
struct NagaFunctionIR {
    name: String,
    arguments: Vec<NagaFunctionArgumentIR>,
    #[serde(rename = "returnType")]
    #[allow(dead_code)]
    return_type: Option<usize>,
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

// =============================================================================
// Helpers
// =============================================================================

fn make_error(message: impl Into<String>, location: impl Into<String>, path: impl Into<String>) -> FormattedError {
    FormattedError {
        message: message.into(),
        location: location.into(),
        path: path.into(),
    }
}

fn scalar_to_wgsl(scalar: NagaScalarKindIR) -> &'static str {
    match scalar {
        NagaScalarKindIR::Float => "f32",
        NagaScalarKindIR::Uint => "u32",
        NagaScalarKindIR::Sint => "i32",
        NagaScalarKindIR::Bool => "bool",
    }
}

fn format_scalar_literal(value: f64, scalar: NagaScalarKindIR) -> String {
    match scalar {
        NagaScalarKindIR::Uint => {
            let int_value = value.trunc() as i64;
            format!("{}u", int_value.max(0))
        }
        NagaScalarKindIR::Sint => {
            let int_value = value.trunc() as i64;
            format!("{}i", int_value)
        }
        NagaScalarKindIR::Bool => {
            if value == 0.0 {
                "false".to_owned()
            } else {
                "true".to_owned()
            }
        }
        NagaScalarKindIR::Float => {
            if value.fract() == 0.0 {
                format!("{value:.1}")
            } else {
                value.to_string()
            }
        }
    }
}

fn format_constant_value(value: &NagaConstantValueIR, scalar: NagaScalarKindIR) -> String {
    match value {
        NagaConstantValueIR::Bool(b) => if *b { "true" } else { "false" }.to_owned(),
        NagaConstantValueIR::Number(n) => format_scalar_literal(*n, scalar),
        NagaConstantValueIR::Array(values) => {
            // Array constant — comma-separated components
            values
                .iter()
                .map(|v| format_scalar_literal(*v, scalar))
                .collect::<Vec<_>>()
                .join(", ")
        }
    }
}

fn binary_op_token(op: NagaBinaryOpIR) -> &'static str {
    match op {
        NagaBinaryOpIR::Add => "+",
        NagaBinaryOpIR::Subtract => "-",
        NagaBinaryOpIR::Multiply => "*",
        NagaBinaryOpIR::Divide => "/",
        NagaBinaryOpIR::Modulo => "%",
        NagaBinaryOpIR::Less => "<",
        NagaBinaryOpIR::LessEqual => "<=",
        NagaBinaryOpIR::Greater => ">",
        NagaBinaryOpIR::GreaterEqual => ">=",
        NagaBinaryOpIR::Equal => "==",
        NagaBinaryOpIR::NotEqual => "!=",
    }
}

fn math_function_name(fun: NagaMathFunctionIR) -> &'static str {
    match fun {
        NagaMathFunctionIR::Mix => "mix",
        NagaMathFunctionIR::Sin => "sin",
        NagaMathFunctionIR::Cos => "cos",
        NagaMathFunctionIR::Normalize => "normalize",
        NagaMathFunctionIR::Min => "min",
        NagaMathFunctionIR::Max => "max",
        NagaMathFunctionIR::Abs => "abs",
        NagaMathFunctionIR::Atan2 => "atan2",
        NagaMathFunctionIR::Ceil => "ceil",
        NagaMathFunctionIR::Clamp => "clamp",
        NagaMathFunctionIR::Exp => "exp",
        NagaMathFunctionIR::Floor => "floor",
        NagaMathFunctionIR::Fract => "fract",
        NagaMathFunctionIR::Log => "log",
        NagaMathFunctionIR::Pow => "pow",
        NagaMathFunctionIR::Round => "round",
        NagaMathFunctionIR::Sign => "sign",
        NagaMathFunctionIR::Sqrt => "sqrt",
        NagaMathFunctionIR::Tan => "tan",
        NagaMathFunctionIR::Trunc => "trunc",
    }
}

// =============================================================================
// Type Emission
// =============================================================================

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
        NagaTypeIR::Matrix { columns, rows, width } => {
            if *width != 4 {
                return Err(make_error(
                    format!("Unsupported matrix width: {width}"),
                    "Module",
                    format!("Type[{type_index}]"),
                ));
            }
            Ok(format!("mat{}x{}<f32>", columns, rows))
        }
        NagaTypeIR::Array { base, size } => match size {
            NagaArraySizeIR::Dynamic(tag) => {
                if tag != "dynamic" {
                    return Err(make_error(
                        format!("Unsupported array size kind: {tag}"),
                        "Module",
                        format!("Type[{type_index}]"),
                    ));
                }
                Ok(format!("array<{}>", emit_type_ref(*base, types)?))
            }
            NagaArraySizeIR::Fixed(len) => Ok(format!("array<{}, {}>", emit_type_ref(*base, types)?, len)),
        },
        NagaTypeIR::Struct { name, .. } => Ok(name.clone()),
    }
}

fn emit_struct_field_prefix(field: &NagaStructFieldIR) -> String {
    if let Some(builtin) = &field.builtin {
        format!("@builtin({builtin}) ")
    } else if let Some(loc) = field.location {
        format!("@location({loc}) ")
    } else {
        String::new()
    }
}

fn emit_structs(types: &[NagaTypeIR]) -> Result<Vec<String>, FormattedError> {
    let mut lines: Vec<String> = Vec::new();
    for ty in types.iter() {
        if let NagaTypeIR::Struct { name, fields } = ty {
            lines.push(format!("struct {name} {{"));
            for field in fields {
                let prefix = emit_struct_field_prefix(field);
                lines.push(format!(
                    "  {}{}: {},",
                    prefix,
                    field.name,
                    emit_type_ref(field.type_index, types)?
                ));
            }
            lines.push("};".to_owned());
            lines.push(String::new());
        }
    }
    Ok(lines)
}

// =============================================================================
// Expression Emitter
// =============================================================================

struct ExpressionEmitter<'a> {
    function_ir: &'a NagaFunctionIR,
    module_ir: &'a NagaModuleIR,
    cache: HashMap<usize, String>,
    stack: HashSet<usize>,
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
            NagaExpressionIR::FunctionArgument { index } => {
                let arg = self.function_ir.arguments.get(*index).ok_or_else(|| {
                    make_error(
                        "Argument handle not found",
                        format!("Expression [{expr_id}]"),
                        format!("Function [{}] -> Argument [{index}]", self.function_ir.name),
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
                let ty = self.module_ir.types.get(constant_ir.type_index);
                let scalar = match ty {
                    Some(NagaTypeIR::Scalar { scalar, .. }) => *scalar,
                    Some(NagaTypeIR::Vector { scalar, size, .. }) => {
                        // Vector constant: vec3<f32>(x, y, z)
                        let type_name = format!("vec{size}<{}>", scalar_to_wgsl(*scalar));
                        let values = format_constant_value(&constant_ir.value, *scalar);
                        self.stack.remove(&expr_id);
                        let result = format!("{type_name}({values})");
                        self.cache.insert(expr_id, result.clone());
                        return Ok(result);
                    }
                    Some(NagaTypeIR::Matrix { columns, rows, .. }) => {
                        let type_name = format!("mat{}x{}<f32>", columns, rows);
                        let values = format_constant_value(&constant_ir.value, NagaScalarKindIR::Float);
                        self.stack.remove(&expr_id);
                        let result = format!("{type_name}({values})");
                        self.cache.insert(expr_id, result.clone());
                        return Ok(result);
                    }
                    _ => {
                        return Err(make_error(
                            "Constant type is missing or unsupported",
                            format!("Expression [{expr_id}]"),
                            format!(
                                "Function [{}] -> Constant [{constant}] -> Type [{}]",
                                self.function_ir.name, constant_ir.type_index
                            ),
                        ));
                    }
                };
                format_constant_value(&constant_ir.value, scalar)
            }
            NagaExpressionIR::GlobalVariable { variable } => {
                let global = self.module_ir.global_variables.get(*variable).ok_or_else(|| {
                    make_error(
                        "GlobalVariable handle not found",
                        format!("Expression [{expr_id}]"),
                        format!("Function [{}] -> GlobalVariable [{variable}]", self.function_ir.name),
                    )
                })?;
                global.name.clone()
            }
            NagaExpressionIR::Access { base, index } => {
                let base_expr = self.emit(*base)?;
                let index_expr = self.emit(*index)?;
                format!("{base_expr}[{index_expr}]")
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
                            format!("AccessIndex out of range: {index}"),
                            format!("Expression [{expr_id}]"),
                            format!("Function [{}]", self.function_ir.name),
                        ));
                    }
                };
                format!("{base_expr}.{component}")
            }
            NagaExpressionIR::Load { pointer } => {
                // Load from a pointer expression — the pointer already represents the access path
                self.emit(*pointer)?
            }
            NagaExpressionIR::Binary { op, left, right } => {
                let left_expr = self.emit(*left)?;
                let right_expr = self.emit(*right)?;
                format!("({left_expr} {} {right_expr})", binary_op_token(*op))
            }
            NagaExpressionIR::Math { fun, arg, arg1, arg2 } => {
                let name = math_function_name(*fun);
                let a = self.emit(*arg)?;
                match (arg1, arg2) {
                    (Some(b_id), Some(c_id)) => {
                        let b = self.emit(*b_id)?;
                        let c = self.emit(*c_id)?;
                        format!("{name}({a}, {b}, {c})")
                    }
                    (Some(b_id), None) => {
                        let b = self.emit(*b_id)?;
                        format!("{name}({a}, {b})")
                    }
                    _ => {
                        format!("{name}({a})")
                    }
                }
            }
            NagaExpressionIR::Select { condition, accept, reject } => {
                let cond = self.emit(*condition)?;
                let accept_expr = self.emit(*accept)?;
                let reject_expr = self.emit(*reject)?;
                format!("select({reject_expr}, {accept_expr}, {cond})")
            }
            NagaExpressionIR::Compose { ty, components } => {
                let type_ref = emit_type_ref(*ty, &self.module_ir.types)?;
                let mut parts: Vec<String> = Vec::with_capacity(components.len());
                for comp in components {
                    parts.push(self.emit(*comp)?);
                }
                format!("{type_ref}({})", parts.join(", "))
            }
            NagaExpressionIR::ArrayLength { expr } => {
                let inner = self.emit(*expr)?;
                format!("arrayLength(&{inner})")
            }
            NagaExpressionIR::As { expr, kind, convert } => {
                let source = self.emit(*expr)?;
                if *convert {
                    // Conversion cast
                    format!("{}({source})", scalar_to_wgsl(*kind))
                } else {
                    // Bitcast
                    match kind {
                        NagaScalarKindIR::Bool => format!("({source} != 0u)"),
                        _ => format!("bitcast<{}>({source})", scalar_to_wgsl(*kind)),
                    }
                }
            }
            NagaExpressionIR::Call { function, arguments } => {
                let fn_ir = self.module_ir.functions.get(*function).ok_or_else(|| {
                    make_error(
                        "Call function handle not found",
                        format!("Expression [{expr_id}]"),
                        format!("Function [{}] -> Call [{function}]", self.function_ir.name),
                    )
                })?;
                let mut emitted_args: Vec<String> = Vec::with_capacity(arguments.len());
                for arg in arguments {
                    emitted_args.push(self.emit(*arg)?);
                }
                format!("{}({})", fn_ir.name, emitted_args.join(", "))
            }
            NagaExpressionIR::AtomicResult { kind: _, pointer, value } => {
                let ptr_expr = self.emit(*pointer)?;
                let val_expr = self.emit(*value)?;
                format!("atomicAdd(&{ptr_expr}, {val_expr})")
            }
        };

        self.stack.remove(&expr_id);
        self.cache.insert(expr_id, emitted.clone());
        Ok(emitted)
    }
}

// =============================================================================
// Statement Emission
// =============================================================================

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
            NagaStatementIR::Store { pointer, value } => {
                let ptr_expr = emitter.emit(*pointer)?;
                let val_expr = emitter.emit(*value)?;
                lines.push(format!("{indent}{ptr_expr} = {val_expr};"));
            }
            NagaStatementIR::StoreState { state_key, value } => {
                // StoreState is a semantic marker — emit as a Store with comment
                let val_expr = emitter.emit(*value)?;
                lines.push(format!("{indent}// state: {state_key}"));
                lines.push(format!("{indent}_ = {val_expr};"));
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
                if !reject.is_empty() {
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
                }
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
            NagaStatementIR::Return { value } => {
                if let Some(val_id) = value {
                    let val_expr = emitter.emit(*val_id)?;
                    lines.push(format!("{indent}return {val_expr};"));
                } else {
                    lines.push(format!("{indent}return;"));
                }
            }
        }

        statement_stack.remove(statement_handle);
    }

    Ok(lines)
}

// =============================================================================
// Module → WGSL
// =============================================================================

fn emit_function(
    function_ir: &NagaFunctionIR,
    module_ir: &NagaModuleIR,
    entry_point: Option<&NagaEntryPointIR>,
    lines: &mut Vec<String>,
    max_active_lanes: Option<u32>,
) -> Result<(), FormattedError> {
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

    // Return type annotation
    let return_annotation = if let Some(ret_type) = function_ir.return_type {
        format!(" -> {}", emit_type_ref(ret_type, &module_ir.types)?)
    } else {
        String::new()
    };

    if let Some(entry) = entry_point {
        match entry.stage.as_str() {
            "compute" => {
                if let Some(max_lanes) = max_active_lanes {
                    let lane_bound = max_lanes.max(1);
                    lines.push(format!("const MAX_ACTIVE_LANES: u32 = {lane_bound}u;"));
                }
                lines.push(format!(
                    "@compute @workgroup_size({}, {}, {})",
                    entry.workgroup_size[0], entry.workgroup_size[1], entry.workgroup_size[2]
                ));
            }
            "vertex" => {
                lines.push("@vertex".to_owned());
            }
            "fragment" => {
                lines.push("@fragment".to_owned());
            }
            _ => {
                return Err(make_error(
                    format!("Unsupported entry point stage: {}", entry.stage),
                    "EntryPoint",
                    "Module",
                ));
            }
        }
    }

    lines.push(format!("fn {}({}){} {{", function_ir.name, arg_parts.join(", "), return_annotation));

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
    Ok(())
}

fn emit_module_to_wgsl(module_ir: &NagaModuleIR, max_active_lanes: Option<u32>) -> Result<String, FormattedError> {
    if module_ir.entry_points.is_empty() {
        return Err(make_error("No entry points in module", "EntryPoint", "Module"));
    }

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

    // Emit non-entry-point helper functions first
    let entry_fn_names: HashSet<&str> = module_ir.entry_points.iter().map(|e| e.function.as_str()).collect();
    for function_ir in &module_ir.functions {
        if !entry_fn_names.contains(function_ir.name.as_str()) {
            emit_function(function_ir, module_ir, None, &mut lines, max_active_lanes)?;
            lines.push(String::new());
        }
    }

    // Emit entry point functions
    for entry in &module_ir.entry_points {
        let function_ir = module_ir
            .functions
            .iter()
            .find(|f| f.name == entry.function)
            .ok_or_else(|| {
                make_error(
                    format!("Entry point function '{}' not found", entry.function),
                    "EntryPoint",
                    "Module",
                )
            })?;
        emit_function(function_ir, module_ir, Some(entry), &mut lines, max_active_lanes)?;
        lines.push(String::new());
    }

    Ok(lines.join("\n"))
}

// =============================================================================
// Compile Pipeline
// =============================================================================

fn compile_internal(module_ir: NagaModuleIR, max_active_lanes: Option<u32>) -> Result<String, Vec<FormattedError>> {
    let emitted_wgsl = emit_module_to_wgsl(&module_ir, max_active_lanes).map_err(|error| vec![error])?;

    let module = naga::front::wgsl::parse_str(&emitted_wgsl).map_err(|error| {
        vec![make_error(
            format!("WGSL Parse Failure: {error}\n---\n{emitted_wgsl}"),
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
