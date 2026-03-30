use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use wasm_bindgen::prelude::*;

mod lowering;

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
#[serde(untagged)]
enum NagaArraySizeIR {
    Dynamic(String),
    Fixed(u32),
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
#[serde(rename_all = "snake_case")]
enum MemoryPacking {
    Soa,
    Aos,
}

fn default_resource_kind() -> String {
    "buffer".to_string()
}

#[derive(Debug, Clone, Deserialize)]
struct MemoryResourceIR {
    id: String,
    #[serde(rename = "type")]
    resource_type: JsonValue,
    cardinality: u32,
    packing: MemoryPacking,
    #[serde(default, rename = "updateClass")]
    update_class: String,
    #[serde(default = "default_resource_kind", rename = "resourceKind")]
    resource_kind: String,
}

#[derive(Debug, Clone, Deserialize)]
struct MemoryManifestIR {
    resources: Vec<MemoryResourceIR>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ResourceStorageLocation {
    Arena,
    State,
    GlobalControlUbo,
    Texture2D,
}

#[derive(Debug, Clone)]
struct ResolvedResource {
    base_offset_bytes: u32,
    lane_stride_bytes: u32,
    component_stride_bytes: u32,
    storage_location: ResourceStorageLocation,
    ubo_vec4_index: u32,
    ubo_component: u32,
}

impl ResolvedResource {
    fn read_buffer_name(&self) -> &'static str {
        match self.storage_location {
            ResourceStorageLocation::Arena => "arena_in",
            ResourceStorageLocation::State => "state_in",
            ResourceStorageLocation::GlobalControlUbo => "global_controls",
            ResourceStorageLocation::Texture2D => {
                panic!("Texture2D resources use texture bindings, not buffer names")
            }
        }
    }

    fn write_buffer_name(&self) -> &'static str {
        match self.storage_location {
            ResourceStorageLocation::Arena => "arena_out",
            ResourceStorageLocation::State => "state_out",
            ResourceStorageLocation::GlobalControlUbo => {
                panic!("Cannot write to GlobalControlUbo from compute shader")
            }
            ResourceStorageLocation::Texture2D => {
                panic!("Texture2D resources use texture bindings, not buffer names")
            }
        }
    }
}

#[derive(Debug, Clone, Default)]
struct SymbolResolver {
    map: HashMap<String, ResolvedResource>,
}

impl SymbolResolver {
    fn resolve(&self, id: &str) -> Option<&ResolvedResource> {
        self.map.get(id)
    }

    fn compute_ubo_address(offset_floats: u32) -> (u32, u32) {
        (offset_floats / 4, offset_floats % 4)
    }

    fn frame_header_field_offset(resource_id: &str) -> Option<u32> {
        match resource_id {
            "time_seconds" => Some(18),
            "delta_time_seconds" => Some(19),
            "resolution_x" => Some(16),
            "resolution_y" => Some(17),
            _ => None,
        }
    }

    fn component_count_from_resource_type(resource_type: &JsonValue) -> u32 {
        // [LAW:one-source-of-truth] Payload component width is derived from the
        // canonical manifest payload kind and never duplicated at callsites.
        let kind = resource_type
            .get("payload")
            .and_then(|payload| payload.get("kind"))
            .and_then(JsonValue::as_str)
            .or_else(|| resource_type.get("kind").and_then(JsonValue::as_str))
            .or_else(|| resource_type.as_str())
            .unwrap_or("float");
        match kind {
            "float" | "f32" | "u32" | "i32" | "int" | "bool" | "shape" | "cameraProjection" => 1,
            "vec2" => 2,
            "vec3" => 3,
            "vec4" | "color" => 4,
            "mat4" => 16,
            _ => 1,
        }
    }

    fn build_from_manifest(manifest: Option<&MemoryManifestIR>) -> Self {
        let Some(manifest) = manifest else {
            return Self::default();
        };

        let mut map = HashMap::new();
        let mut current_offset_bytes: u32 = 0;

        for resource in &manifest.resources {
            if resource.resource_kind == "texture2d" {
                map.insert(
                    resource.id.clone(),
                    ResolvedResource {
                        base_offset_bytes: 0,
                        lane_stride_bytes: 0,
                        component_stride_bytes: 0,
                        storage_location: ResourceStorageLocation::Texture2D,
                        ubo_vec4_index: 0,
                        ubo_component: 0,
                    },
                );
                continue;
            }

            let is_ubo = resource.update_class == "FrameTime" && resource.cardinality == 1;
            if is_ubo {
                let offset_floats = Self::frame_header_field_offset(&resource.id).unwrap_or(0);
                let (vec4_index, component) = Self::compute_ubo_address(offset_floats);
                map.insert(
                    resource.id.clone(),
                    ResolvedResource {
                        base_offset_bytes: 0,
                        lane_stride_bytes: 0,
                        component_stride_bytes: 0,
                        storage_location: ResourceStorageLocation::GlobalControlUbo,
                        ubo_vec4_index: vec4_index,
                        ubo_component: component,
                    },
                );
                continue;
            }

            let component_size_bytes = 4u32;
            let component_count = Self::component_count_from_resource_type(&resource.resource_type);
            let alignment = (component_count * component_size_bytes).clamp(4, 16);
            current_offset_bytes = ((current_offset_bytes + alignment - 1) / alignment) * alignment;

            let (lane_stride_bytes, component_stride_bytes) = match resource.packing {
                MemoryPacking::Soa => (
                    component_size_bytes,
                    resource.cardinality * component_size_bytes,
                ),
                MemoryPacking::Aos => {
                    (component_count * component_size_bytes, component_size_bytes)
                }
            };

            let storage_location = if resource.id.starts_with("state:") {
                ResourceStorageLocation::State
            } else {
                ResourceStorageLocation::Arena
            };

            let total_bytes = resource
                .cardinality
                .saturating_mul(component_count)
                .saturating_mul(component_size_bytes);
            map.insert(
                resource.id.clone(),
                ResolvedResource {
                    base_offset_bytes: current_offset_bytes,
                    lane_stride_bytes,
                    component_stride_bytes,
                    storage_location,
                    ubo_vec4_index: 0,
                    ubo_component: 0,
                },
            );
            current_offset_bytes = current_offset_bytes.saturating_add(total_bytes);
        }

        Self { map }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[allow(non_camel_case_types)]
enum NagaExpressionIR_TS {
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
    LoadSymbolic {
        #[serde(rename = "resourceId")]
        resource_id: String,
        lane: usize,
        component: usize,
    },
    LoadUniform {
        #[serde(rename = "resourceId")]
        resource_id: String,
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

#[derive(Debug, Clone)]
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
    LiteralU32 {
        value: u32,
    },
    BufferLoad {
        buffer: String,
        index: usize,
    },
    LoadUniform {
        resource_id: String,
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
    StoreSymbolic {
        #[serde(rename = "resourceId")]
        resource_id: String,
        lane: usize,
        component: usize,
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

#[derive(Debug, Clone)]
struct NagaFunctionIR {
    name: String,
    arguments: Vec<NagaFunctionArgumentIR>,
    expressions: Vec<NagaExpressionIR>,
    statements: Vec<NagaStatementIR>,
    body: Vec<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(non_camel_case_types)]
struct NagaFunctionIR_TS {
    name: String,
    arguments: Vec<NagaFunctionArgumentIR>,
    expressions: Vec<NagaExpressionIR_TS>,
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

#[derive(Debug, Clone)]
struct NagaModuleIR {
    types: Vec<NagaTypeIR>,
    constants: Vec<NagaConstantIR>,
    global_variables: Vec<NagaGlobalVariableIR>,
    functions: Vec<NagaFunctionIR>,
    entry_points: Vec<NagaEntryPointIR>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(non_camel_case_types)]
struct NagaModuleIR_TS {
    types: Vec<NagaTypeIR>,
    constants: Vec<NagaConstantIR>,
    #[serde(rename = "global_variables")]
    global_variables: Vec<NagaGlobalVariableIR>,
    functions: Vec<NagaFunctionIR_TS>,
    #[serde(rename = "entry_points")]
    entry_points: Vec<NagaEntryPointIR>,
    #[serde(default, rename = "memory_manifest")]
    memory_manifest: Option<MemoryManifestIR>,
}

struct ExpressionEmitter<'a> {
    function_ir: &'a NagaFunctionIR,
    module_ir: &'a NagaModuleIR,
    resolver: &'a SymbolResolver,
    cache: HashMap<usize, String>,
    stack: HashSet<usize>,
}

fn make_error(
    message: impl Into<String>,
    location: impl Into<String>,
    path: impl Into<String>,
) -> FormattedError {
    FormattedError {
        message: message.into(),
        location: location.into(),
        path: path.into(),
    }
}

fn is_valid_wgsl_identifier(identifier: &str) -> bool {
    let mut chars = identifier.chars();
    match chars.next() {
        Some(first) if first == '_' || first.is_ascii_alphabetic() => {}
        _ => return false,
    }
    chars.all(|ch| ch == '_' || ch.is_ascii_alphanumeric())
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
        NagaTypeIR::Vector {
            size,
            scalar,
            width,
        } => {
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
            NagaArraySizeIR::Fixed(len) => {
                Ok(format!("array<{}, {}>", emit_type_ref(*base, types)?, len))
            }
        },
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

fn require_lowered_handle(
    lowered_by_ts_index: &[usize],
    ts_expr: usize,
    current_ts_expr: usize,
    label: &str,
) -> Result<usize, String> {
    if ts_expr >= current_ts_expr {
        return Err(format!(
            "{} expression [{}] must be lowered before expression [{}]",
            label, ts_expr, current_ts_expr
        ));
    }
    lowered_by_ts_index
        .get(ts_expr)
        .copied()
        .ok_or_else(|| format!("{} expression handle not found: {}", label, ts_expr))
}

fn push_literal_u32(expressions: &mut Vec<NagaExpressionIR>, value: u32) -> usize {
    let idx = expressions.len();
    expressions.push(NagaExpressionIR::LiteralU32 { value });
    idx
}

// [LAW:single-enforcer] Symbolic resource IDs are lowered to physical address
// math in one MMU boundary before WGSL emission.
fn translate_and_lower_expressions(
    function_name: &str,
    ts_expressions: &[NagaExpressionIR_TS],
    symbol_resolver: &SymbolResolver,
) -> Result<(Vec<NagaExpressionIR>, Vec<usize>), String> {
    let mut lowered_expressions: Vec<NagaExpressionIR> = Vec::new();
    let mut lowered_by_ts_index: Vec<usize> = vec![0; ts_expressions.len()];

    for (ts_index, expr_ts) in ts_expressions.iter().enumerate() {
        let lowered_index = match expr_ts {
            NagaExpressionIR_TS::Argument { argument } => {
                let idx = lowered_expressions.len();
                lowered_expressions.push(NagaExpressionIR::Argument {
                    argument: *argument,
                });
                idx
            }
            NagaExpressionIR_TS::Constant { constant } => {
                let idx = lowered_expressions.len();
                lowered_expressions.push(NagaExpressionIR::Constant {
                    constant: *constant,
                });
                idx
            }
            NagaExpressionIR_TS::AccessIndex { base, index } => {
                let base_idx = require_lowered_handle(
                    &lowered_by_ts_index,
                    *base,
                    ts_index,
                    "access_index base",
                )?;
                let idx = lowered_expressions.len();
                lowered_expressions.push(NagaExpressionIR::AccessIndex {
                    base: base_idx,
                    index: *index,
                });
                idx
            }
            NagaExpressionIR_TS::Binary { op, left, right } => {
                let left_idx =
                    require_lowered_handle(&lowered_by_ts_index, *left, ts_index, "binary left")?;
                let right_idx =
                    require_lowered_handle(&lowered_by_ts_index, *right, ts_index, "binary right")?;
                let idx = lowered_expressions.len();
                lowered_expressions.push(NagaExpressionIR::Binary {
                    op: *op,
                    left: left_idx,
                    right: right_idx,
                });
                idx
            }
            NagaExpressionIR_TS::BufferLoad { buffer, index } => {
                let index_idx = require_lowered_handle(
                    &lowered_by_ts_index,
                    *index,
                    ts_index,
                    "buffer_load index",
                )?;
                let idx = lowered_expressions.len();
                lowered_expressions.push(NagaExpressionIR::BufferLoad {
                    buffer: buffer.clone(),
                    index: index_idx,
                });
                idx
            }
            NagaExpressionIR_TS::LoadSymbolic {
                resource_id,
                lane,
                component,
            } => {
                let resolved = symbol_resolver
                    .resolve(resource_id)
                    .ok_or_else(|| format!("Symbolic resource not found: {}", resource_id))?;
                match resolved.storage_location {
                    ResourceStorageLocation::GlobalControlUbo => {
                        // [LAW:one-source-of-truth] UBO vec4/component mapping
                        // is owned by the MMU resolver and lowered once here.
                        let vec_index =
                            push_literal_u32(&mut lowered_expressions, resolved.ubo_vec4_index);
                        let uniform_load = lowered_expressions.len();
                        lowered_expressions.push(NagaExpressionIR::LoadUniform {
                            resource_id: "uniforms".to_string(),
                            index: vec_index,
                        });
                        let component_load = lowered_expressions.len();
                        lowered_expressions.push(NagaExpressionIR::AccessIndex {
                            base: uniform_load,
                            index: resolved.ubo_component as usize,
                        });
                        component_load
                    }
                    ResourceStorageLocation::Texture2D => {
                        return Err(format!(
                            "Symbolic resource '{}' resolves to Texture2D and cannot be lowered as scalar buffer load",
                            resource_id
                        ));
                    }
                    _ => {
                        let lane_idx = require_lowered_handle(
                            &lowered_by_ts_index,
                            *lane,
                            ts_index,
                            "load_symbolic lane",
                        )?;
                        let component_idx = require_lowered_handle(
                            &lowered_by_ts_index,
                            *component,
                            ts_index,
                            "load_symbolic component",
                        )?;

                        // [LAW:dataflow-not-control-flow] Address lowering is
                        // one fixed expression pipeline; resource values drive math.
                        let base_words = resolved.base_offset_bytes / 4;
                        let lane_stride_words = resolved.lane_stride_bytes / 4;
                        let component_stride_words = resolved.component_stride_bytes / 4;
                        let base_const = push_literal_u32(&mut lowered_expressions, base_words);
                        let lane_stride_const =
                            push_literal_u32(&mut lowered_expressions, lane_stride_words);
                        let component_stride_const =
                            push_literal_u32(&mut lowered_expressions, component_stride_words);

                        let lane_offset_idx = lowered_expressions.len();
                        lowered_expressions.push(NagaExpressionIR::Binary {
                            op: NagaBinaryOpIR::Mul,
                            left: lane_idx,
                            right: lane_stride_const,
                        });

                        let component_offset_idx = lowered_expressions.len();
                        lowered_expressions.push(NagaExpressionIR::Binary {
                            op: NagaBinaryOpIR::Mul,
                            left: component_idx,
                            right: component_stride_const,
                        });

                        let lane_address_idx = lowered_expressions.len();
                        lowered_expressions.push(NagaExpressionIR::Binary {
                            op: NagaBinaryOpIR::Add,
                            left: base_const,
                            right: lane_offset_idx,
                        });

                        let final_index_idx = lowered_expressions.len();
                        lowered_expressions.push(NagaExpressionIR::Binary {
                            op: NagaBinaryOpIR::Add,
                            left: lane_address_idx,
                            right: component_offset_idx,
                        });

                        let buffer_load_idx = lowered_expressions.len();
                        lowered_expressions.push(NagaExpressionIR::BufferLoad {
                            buffer: resolved.read_buffer_name().to_string(),
                            index: final_index_idx,
                        });
                        buffer_load_idx
                    }
                }
            }
            NagaExpressionIR_TS::LoadUniform { resource_id, index } => {
                if resource_id.is_empty() {
                    return Err(format!(
                        "load_uniform resourceId must be non-empty in function '{}'",
                        function_name
                    ));
                }
                let index_idx = require_lowered_handle(
                    &lowered_by_ts_index,
                    *index,
                    ts_index,
                    "load_uniform index",
                )?;
                let idx = lowered_expressions.len();
                lowered_expressions.push(NagaExpressionIR::LoadUniform {
                    resource_id: resource_id.clone(),
                    index: index_idx,
                });
                idx
            }
            NagaExpressionIR_TS::As { to, expr } => {
                let expr_idx =
                    require_lowered_handle(&lowered_by_ts_index, *expr, ts_index, "as expr")?;
                let idx = lowered_expressions.len();
                lowered_expressions.push(NagaExpressionIR::As {
                    to: *to,
                    expr: expr_idx,
                });
                idx
            }
            NagaExpressionIR_TS::Call { function, args } => {
                let mut lowered_args = Vec::with_capacity(args.len());
                for arg in args {
                    lowered_args.push(require_lowered_handle(
                        &lowered_by_ts_index,
                        *arg,
                        ts_index,
                        "call arg",
                    )?);
                }
                let idx = lowered_expressions.len();
                lowered_expressions.push(NagaExpressionIR::Call {
                    function: function.clone(),
                    args: lowered_args,
                });
                idx
            }
        };
        lowered_by_ts_index[ts_index] = lowered_index;
    }

    Ok((lowered_expressions, lowered_by_ts_index))
}

fn remap_statement_expression_handles(
    statement: &NagaStatementIR,
    lowered_by_ts_index: &[usize],
) -> Result<NagaStatementIR, String> {
    let remap = |handle: usize, label: &str| {
        lowered_by_ts_index
            .get(handle)
            .copied()
            .ok_or_else(|| format!("{} expression handle not found: {}", label, handle))
    };

    match statement {
        NagaStatementIR::Store {
            buffer,
            index,
            value,
            comment,
        } => Ok(NagaStatementIR::Store {
            buffer: buffer.clone(),
            index: remap(*index, "store index")?,
            value: remap(*value, "store value")?,
            comment: comment.clone(),
        }),
        NagaStatementIR::StoreSymbolic {
            resource_id,
            lane,
            component,
            value,
            comment,
        } => Ok(NagaStatementIR::StoreSymbolic {
            resource_id: resource_id.clone(),
            lane: remap(*lane, "store_symbolic lane")?,
            component: remap(*component, "store_symbolic component")?,
            value: remap(*value, "store_symbolic value")?,
            comment: comment.clone(),
        }),
        NagaStatementIR::If {
            condition,
            accept,
            reject,
        } => Ok(NagaStatementIR::If {
            condition: remap(*condition, "if condition")?,
            accept: accept.clone(),
            reject: reject.clone(),
        }),
        NagaStatementIR::Comment { text } => Ok(NagaStatementIR::Comment { text: text.clone() }),
        NagaStatementIR::Loop { body } => Ok(NagaStatementIR::Loop { body: body.clone() }),
        NagaStatementIR::Break => Ok(NagaStatementIR::Break),
        NagaStatementIR::Continue => Ok(NagaStatementIR::Continue),
        NagaStatementIR::Return => Ok(NagaStatementIR::Return),
    }
}

fn lower_naga_module_ir(
    module_ts: &NagaModuleIR_TS,
    symbol_resolver: &SymbolResolver,
) -> Result<NagaModuleIR, String> {
    let mut lowered_functions = Vec::with_capacity(module_ts.functions.len());
    for function_ts in &module_ts.functions {
        let (lowered_expressions, lowered_by_ts_index) = translate_and_lower_expressions(
            &function_ts.name,
            &function_ts.expressions,
            symbol_resolver,
        )?;

        let mut lowered_statements = Vec::with_capacity(function_ts.statements.len());
        for statement in &function_ts.statements {
            lowered_statements.push(remap_statement_expression_handles(
                statement,
                &lowered_by_ts_index,
            )?);
        }

        let mut lowered_body = Vec::with_capacity(function_ts.body.len());
        for statement_handle in &function_ts.body {
            if *statement_handle >= lowered_statements.len() {
                return Err(format!(
                    "Function '{}' body statement handle out of bounds: {}",
                    function_ts.name, statement_handle
                ));
            }
            lowered_body.push(*statement_handle);
        }

        lowered_functions.push(NagaFunctionIR {
            name: function_ts.name.clone(),
            arguments: function_ts.arguments.clone(),
            expressions: lowered_expressions,
            statements: lowered_statements,
            body: lowered_body,
        });
    }

    Ok(NagaModuleIR {
        types: module_ts.types.clone(),
        constants: module_ts.constants.clone(),
        global_variables: module_ts.global_variables.clone(),
        functions: lowered_functions,
        entry_points: module_ts.entry_points.clone(),
    })
}

impl<'a> ExpressionEmitter<'a> {
    fn new(
        function_ir: &'a NagaFunctionIR,
        module_ir: &'a NagaModuleIR,
        resolver: &'a SymbolResolver,
    ) -> Self {
        Self {
            function_ir,
            module_ir,
            resolver,
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
                        format!(
                            "Function [{}] -> Argument [{argument}]",
                            self.function_ir.name
                        ),
                    )
                })?;
                arg.name.clone()
            }
            NagaExpressionIR::Constant { constant } => {
                let constant_ir = self.module_ir.constants.get(*constant).ok_or_else(|| {
                    make_error(
                        "Constant handle not found",
                        format!("Expression [{expr_id}]"),
                        format!(
                            "Function [{}] -> Constant [{constant}]",
                            self.function_ir.name
                        ),
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
            NagaExpressionIR::LiteralU32 { value } => format!("{value}u"),
            NagaExpressionIR::BufferLoad { buffer, index } => {
                let index_expr = self.emit(*index)?;
                format!("{buffer}[{index_expr}]")
            }
            NagaExpressionIR::LoadUniform { resource_id, index } => {
                let index_expr = self.emit(*index)?;
                let uniform_name = if resource_id.is_empty() {
                    "uniforms"
                } else {
                    resource_id.as_str()
                };
                format!("{uniform_name}[{index_expr}]")
            }
            NagaExpressionIR::As { to, expr } => {
                let source = self.emit(*expr)?;
                match to {
                    NagaScalarKindIR::Bool => format!("({source} != 0u)"),
                    _ => format!("bitcast<{}>({source})", scalar_to_wgsl(*to)),
                }
            }
            NagaExpressionIR::Call { function, args } => {
                // [LAW:single-enforcer] Validate IR-driven call targets once at
                // the shim emission boundary before any WGSL string formatting.
                if !is_valid_wgsl_identifier(function) {
                    return Err(make_error(
                        "Invalid call target identifier",
                        format!("Expression [{expr_id}]"),
                        format!("Function [{}]", self.function_ir.name),
                    ));
                }
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
            NagaStatementIR::StoreSymbolic {
                resource_id,
                lane,
                component,
                value,
                comment,
            } => {
                let lane_expr = emitter.emit(*lane)?;
                let component_expr = emitter.emit(*component)?;
                let value_expr = emitter.emit(*value)?;
                let resolved = emitter.resolver.resolve(resource_id).ok_or_else(|| {
                    make_error(
                        format!("Unresolved symbolic resource: {}", resource_id),
                        format!("Statement [{statement_handle}]"),
                        format!("Function [{}]", function_ir.name),
                    )
                })?;
                if matches!(
                    resolved.storage_location,
                    ResourceStorageLocation::Texture2D
                ) {
                    return Err(make_error(
                        format!(
                            "Symbolic resource '{}' resolves to Texture2D and cannot be lowered as scalar buffer store",
                            resource_id
                        ),
                        format!("Statement [{statement_handle}]"),
                        format!("Function [{}]", function_ir.name),
                    ));
                }
                if matches!(
                    resolved.storage_location,
                    ResourceStorageLocation::GlobalControlUbo
                ) {
                    return Err(make_error(
                        format!(
                            "Symbolic resource '{}' resolves to GlobalControlUbo and is read-only",
                            resource_id
                        ),
                        format!("Statement [{statement_handle}]"),
                        format!("Function [{}]", function_ir.name),
                    ));
                }
                let buffer_name = resolved.write_buffer_name();
                let base_words = resolved.base_offset_bytes / 4;
                let lane_stride_words = resolved.lane_stride_bytes / 4;
                let component_stride_words = resolved.component_stride_bytes / 4;
                let mut line = format!(
                    "{indent}{buffer_name}[{base_words}u + (({lane_expr}) * {lane_stride_words}u) + (({component_expr}) * {component_stride_words}u)] = {value_expr};"
                );
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

fn emit_module_to_wgsl(
    module_ir: &NagaModuleIR,
    resolver: &SymbolResolver,
    max_active_lanes: Option<u32>,
) -> Result<String, FormattedError> {
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
                format!(
                    "Entry point function '{}' not found",
                    compute_entry.function
                ),
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
        compute_entry.workgroup_size[0],
        compute_entry.workgroup_size[1],
        compute_entry.workgroup_size[2]
    ));
    lines.push(format!(
        "fn {}({}) {{",
        function_ir.name,
        arg_parts.join(", ")
    ));

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

    let mut emitter = ExpressionEmitter::new(function_ir, module_ir, resolver);
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

fn compile_internal(
    module_ir_ts: NagaModuleIR_TS,
    max_active_lanes: Option<u32>,
) -> Result<String, Vec<FormattedError>> {
    let resolver = SymbolResolver::build_from_manifest(module_ir_ts.memory_manifest.as_ref());
    let module_ir = lower_naga_module_ir(&module_ir_ts, &resolver).map_err(|message| {
        vec![make_error(
            message,
            "Module",
            "Lowering symbolic expressions",
        )]
    })?;
    let emitted_wgsl = emit_module_to_wgsl(&module_ir, &resolver, max_active_lanes)
        .map_err(|error| vec![error])?;

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
    .map_err(|error| {
        vec![make_error(
            format!("Emission Failure: {error}"),
            "Module",
            "WGSL emit",
        )]
    })?;

    Ok(canonical_wgsl)
}

#[wasm_bindgen]
pub fn compile_ir(module_ir: JsValue, max_active_lanes: Option<u32>) -> JsValue {
    console_error_panic_hook::set_once();

    let module: NagaModuleIR_TS = match serde_wasm_bindgen::from_value(module_ir) {
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
            return serde_wasm_bindgen::to_value(&result)
                .expect("failed to serialize compile result");
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

#[cfg(test)]
mod tests {
    use super::{
        compile_internal, translate_and_lower_expressions, NagaBinaryOpIR, NagaExpressionIR,
        NagaExpressionIR_TS, NagaModuleIR_TS, ResolvedResource, ResourceStorageLocation,
        SymbolResolver,
    };

    fn symbolic_module_json() -> &'static str {
        r#"{
          "memory_manifest": {
            "resources": [
              {
                "id": "arena:slot:1",
                "type": { "payload": { "kind": "vec2" } },
                "cardinality": 8,
                "packing": "soa",
                "updateClass": "FrameTime",
                "resourceKind": "buffer"
              }
            ]
          },
          "types": [
            { "kind": "scalar", "scalar": "u32", "width": 4 },
            { "kind": "array", "base": 0, "size": "dynamic" }
          ],
          "constants": [
            { "type": 0, "value": 0 },
            { "type": 0, "value": 1 }
          ],
          "global_variables": [
            {
              "name": "arena_in",
              "storageClass": "storage",
              "access": "read",
              "binding": { "group": 0, "binding": 0 },
              "type": 1
            },
            {
              "name": "arena_out",
              "storageClass": "storage",
              "access": "read_write",
              "binding": { "group": 0, "binding": 1 },
              "type": 1
            }
          ],
          "functions": [
            {
              "name": "main",
              "arguments": [],
              "expressions": [
                { "kind": "constant", "constant": 0 },
                { "kind": "constant", "constant": 1 },
                { "kind": "load_symbolic", "resourceId": "arena:slot:1", "lane": 0, "component": 1 }
              ],
              "statements": [
                { "kind": "store_symbolic", "resourceId": "arena:slot:1", "lane": 0, "component": 1, "value": 2 }
              ],
              "body": [0]
            }
          ],
          "entry_points": [
            { "stage": "compute", "function": "main", "workgroupSize": [1, 1, 1] }
          ]
        }"#
    }

    #[test]
    fn deserializes_symbolic_variants() {
        let parsed: Result<NagaModuleIR_TS, _> = serde_json::from_str(symbolic_module_json());
        assert!(parsed.is_ok(), "expected symbolic module IR to deserialize");
    }

    #[test]
    fn compile_internal_accepts_symbolic_variants() {
        let module: NagaModuleIR_TS =
            serde_json::from_str(symbolic_module_json()).expect("module deserialization succeeds");
        let compiled = compile_internal(module, Some(16));
        assert!(compiled.is_ok(), "expected symbolic module IR to compile");
    }

    #[test]
    fn translate_and_lower_expressions_load_symbolic_lowers_to_address_math() {
        let mut resolver = SymbolResolver::default();
        resolver.map.insert(
            "arena:slot:1".to_string(),
            ResolvedResource {
                base_offset_bytes: 64,     // 16 words
                lane_stride_bytes: 8,      // 2 words
                component_stride_bytes: 4, // 1 word
                storage_location: ResourceStorageLocation::Arena,
                ubo_vec4_index: 0,
                ubo_component: 0,
            },
        );

        let ts_expressions = vec![
            NagaExpressionIR_TS::Argument { argument: 0 }, // lane
            NagaExpressionIR_TS::Argument { argument: 1 }, // component
            NagaExpressionIR_TS::LoadSymbolic {
                resource_id: "arena:slot:1".to_string(),
                lane: 0,
                component: 1,
            },
        ];

        let (lowered, lowered_map) =
            translate_and_lower_expressions("main", &ts_expressions, &resolver)
                .expect("lowering succeeds");

        let final_expr = lowered
            .get(lowered_map[2])
            .expect("mapped symbolic load expression exists");
        let final_index = match final_expr {
            NagaExpressionIR::BufferLoad { buffer, index } => {
                assert_eq!(buffer, "arena_in");
                *index
            }
            other => panic!("expected BufferLoad, got {:?}", other),
        };

        let (lane_addr_idx, component_mul_idx) = match lowered
            .get(final_index)
            .expect("final index expression exists")
        {
            NagaExpressionIR::Binary {
                op: NagaBinaryOpIR::Add,
                left,
                right,
            } => (*left, *right),
            other => panic!("expected final Add expression, got {:?}", other),
        };

        let (base_words_idx, lane_mul_idx) = match lowered
            .get(lane_addr_idx)
            .expect("lane address expression exists")
        {
            NagaExpressionIR::Binary {
                op: NagaBinaryOpIR::Add,
                left,
                right,
            } => (*left, *right),
            other => panic!("expected base + lane_offset Add, got {:?}", other),
        };

        assert!(matches!(
            lowered.get(base_words_idx),
            Some(NagaExpressionIR::LiteralU32 { value: 16 })
        ));

        let (lane_source_idx, lane_stride_idx) = match lowered
            .get(lane_mul_idx)
            .expect("lane mul expression exists")
        {
            NagaExpressionIR::Binary {
                op: NagaBinaryOpIR::Mul,
                left,
                right,
            } => (*left, *right),
            other => panic!("expected lane Mul expression, got {:?}", other),
        };
        assert_eq!(lane_source_idx, lowered_map[0]);
        assert!(matches!(
            lowered.get(lane_stride_idx),
            Some(NagaExpressionIR::LiteralU32 { value: 2 })
        ));

        let (component_source_idx, component_stride_idx) = match lowered
            .get(component_mul_idx)
            .expect("component mul expression exists")
        {
            NagaExpressionIR::Binary {
                op: NagaBinaryOpIR::Mul,
                left,
                right,
            } => (*left, *right),
            other => panic!("expected component Mul expression, got {:?}", other),
        };
        assert_eq!(component_source_idx, lowered_map[1]);
        assert!(matches!(
            lowered.get(component_stride_idx),
            Some(NagaExpressionIR::LiteralU32 { value: 1 })
        ));
    }
}
