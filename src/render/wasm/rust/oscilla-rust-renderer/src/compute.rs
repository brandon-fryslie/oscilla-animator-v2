use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};
use naga::valid::{Capabilities, ValidationFlags, Validator};
use naga::Module;
use crate::memory::{GpuMemoryArena, SymbolResolver};

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NagaScalarKindIR {
    F32,
    U32,
    Bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum NagaArraySizeIR {
    Dynamic(String),
    Fixed(u32),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NagaTypeIR {
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
pub struct NagaStructFieldIR {
    pub name: String,
    #[serde(rename = "type")]
    pub type_index: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NagaConstantIR {
    #[serde(rename = "type")]
    pub type_index: usize,
    pub value: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NagaBindingIR {
    pub group: u32,
    pub binding: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NagaGlobalVariableIR {
    pub name: String,
    #[serde(rename = "storageClass")]
    pub storage_class: String,
    pub access: String,
    pub binding: NagaBindingIR,
    #[serde(rename = "type")]
    pub type_index: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NagaFunctionArgumentIR {
    pub name: String,
    #[serde(rename = "type")]
    pub type_index: usize,
    pub builtin: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NagaBinaryOpIR {
    Add, Sub, Mul, Div, Mod, Lt, Le, Gt, Ge, Eq, Ne,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NagaExpressionIR {
    Argument { argument: usize },
    Constant { constant: usize },
    AccessIndex { base: usize, index: usize },
    Binary { op: NagaBinaryOpIR, left: usize, right: usize },
    LoadSymbolic { resource_id: String, lane: usize, component: usize },
    LoadUniform { resource_id: String, index: usize },
    As { to: NagaScalarKindIR, expr: usize },
    Call { function: String, args: Vec<usize> },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NagaStatementIR {
    StoreSymbolic { resource_id: String, lane: usize, component: usize, value: usize, comment: Option<String> },
    Comment { text: String },
    If { condition: usize, accept: Vec<usize>, reject: Vec<usize> },
    Loop { body: Vec<usize> },
    Break,
    Continue,
    Return,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NagaFunctionIR {
    pub name: String,
    pub arguments: Vec<NagaFunctionArgumentIR>,
    pub expressions: Vec<NagaExpressionIR>,
    pub statements: Vec<NagaStatementIR>,
    pub body: Vec<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NagaEntryPointIR {
    pub stage: String,
    pub function: String,
    #[serde(rename = "workgroupSize")]
    pub workgroup_size: [u32; 3],
}

#[derive(Debug, Clone, Deserialize)]
pub struct NagaModuleIR {
    pub types: Vec<NagaTypeIR>,
    pub constants: Vec<NagaConstantIR>,
    #[serde(rename = "global_variables")]
    pub global_variables: Vec<NagaGlobalVariableIR>,
    pub functions: Vec<NagaFunctionIR>,
    #[serde(rename = "entry_points")]
    pub entry_points: Vec<NagaEntryPointIR>,
}

// ---------------------------------------------------------------------------
// NagaEmitterInstruction — Typed instructions from the TS compiler.
// [LAW:one-type-per-behavior] All dispatch variants live in one enum so match
// arms are exhaustive and new ops require explicit Rust handling.
// ---------------------------------------------------------------------------

/// Instruction emitted by the TS Naga lowering pipeline.
/// Deserialized from JSON sent across the JS↔Wasm boundary.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "op")]
pub enum NagaEmitterInstruction {
    /// Trigger a pre-compiled static WGSL kernel.
    /// `kernel_id` indexes into `KernelRegistry`; `arguments` maps parameter
    /// names to Symbolic IDs resolved by the MMU at dispatch time.
    DispatchKernel {
        #[serde(rename = "kernelId")]
        kernel_id: String,
        arguments: HashMap<String, String>,
    },
}

// ---------------------------------------------------------------------------
// KernelRegistry — Static kernel pipeline store.
// [LAW:one-source-of-truth] The registry is the single owner of pre-compiled
// kernel pipelines; no other path compiles or caches kernels.
// ---------------------------------------------------------------------------

/// A pre-compiled compute kernel ready for dispatch.
pub struct CompiledKernel {
    pub pipeline: wgpu::ComputePipeline,
    pub bind_group_layout: wgpu::BindGroupLayout,
    pub workgroup_size: [u32; 3],
}

/// Registry of pre-compiled static WGSL kernels keyed by kernel ID.
pub struct KernelRegistry {
    kernels: HashMap<String, CompiledKernel>,
}

impl KernelRegistry {
    pub fn new() -> Self {
        Self {
            kernels: HashMap::new(),
        }
    }

    /// Register a pre-compiled kernel under the given ID.
    pub fn register(&mut self, kernel_id: String, kernel: CompiledKernel) {
        self.kernels.insert(kernel_id, kernel);
    }

    /// Look up a kernel by ID. Returns None if unregistered.
    pub fn get(&self, kernel_id: &str) -> Option<&CompiledKernel> {
        self.kernels.get(kernel_id)
    }
}

impl NagaEmitterInstruction {
    /// Execute this instruction against the GPU.
    ///
    /// [LAW:single-enforcer] Instruction dispatch is the single boundary where
    /// Symbolic IDs are resolved to physical buffer offsets and kernels are
    /// dispatched — no other code path performs this translation.
    pub fn execute(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        registry: &KernelRegistry,
        resolver: &SymbolResolver,
        arena: &GpuMemoryArena,
        particle_count: u32,
    ) -> Result<(), String> {
        match self {
            NagaEmitterInstruction::DispatchKernel {
                kernel_id,
                arguments,
            } => {
                let kernel = registry.get(kernel_id).ok_or_else(|| {
                    format!("DispatchKernel: kernel '{}' not found in registry", kernel_id)
                })?;

                // [LAW:no-silent-fallbacks] Every symbolic argument must resolve;
                // unresolved IDs are hard errors, not silent skips.
                for (param_name, symbolic_id) in arguments {
                    let _resolved = resolver.resolve(symbolic_id).ok_or_else(|| {
                        format!(
                            "DispatchKernel({}): argument '{}' symbolic ID '{}' not found in MMU",
                            kernel_id, param_name, symbolic_id
                        )
                    })?;
                }

                // Bind group creation is deferred to when concrete resource
                // binding layouts are defined (Phase 2 fluid port ticket).
                // For now we dispatch using the kernel's own layout with the
                // arena's existing bind groups.
                let workgroup_count_x = ((particle_count
                    .saturating_add(kernel.workgroup_size[0].saturating_sub(1)))
                    / kernel.workgroup_size[0])
                    .max(1);

                let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                    label: Some("DispatchKernel"),
                    timestamp_writes: None,
                });
                pass.set_pipeline(&kernel.pipeline);
                // Bind group 0: arena read (current ping-pong bank)
                pass.set_bind_group(
                    0,
                    arena.get_compiler_simulation_bind_group_for_index(arena.ping_pong_index()),
                    &[],
                );
                pass.dispatch_workgroups(workgroup_count_x, 1, 1);

                Ok(())
            }
        }
    }
}

struct ExpressionEmitter<'a> {
    function_ir: &'a NagaFunctionIR,
    module_ir: &'a NagaModuleIR,
    resolver: &'a crate::memory::SymbolResolver,
    cache: HashMap<usize, String>,
    stack: HashSet<usize>,
}

impl<'a> ExpressionEmitter<'a> {
    fn new(function_ir: &'a NagaFunctionIR, module_ir: &'a NagaModuleIR, resolver: &'a crate::memory::SymbolResolver) -> Self {
        Self {
            function_ir,
            module_ir,
            resolver,
            cache: HashMap::new(),
            stack: HashSet::new(),
        }
    }

    fn emit(&mut self, expr_id: usize) -> Result<String, String> {
        if let Some(value) = self.cache.get(&expr_id) {
            return Ok(value.clone());
        }
        if self.stack.contains(&expr_id) {
            return Err(format!("Expression cycle detected at [{}]", expr_id));
        }

        let expr = self.function_ir.expressions.get(expr_id).ok_or_else(|| {
            format!("Expression handle not found: {}", expr_id)
        })?;

        self.stack.insert(expr_id);

        let emitted = match expr {
            NagaExpressionIR::Argument { argument } => {
                let arg = self.function_ir.arguments.get(*argument).ok_or_else(|| "Argument not found")?;
                arg.name.clone()
            }
            NagaExpressionIR::Constant { constant } => {
                let constant_ir = self.module_ir.constants.get(*constant).ok_or_else(|| "Constant not found")?;
                let scalar = match self.module_ir.types.get(constant_ir.type_index) {
                    Some(NagaTypeIR::Scalar { scalar, .. }) => scalar,
                    _ => return Err("Constant scalar type missing".to_string()),
                };
                format_scalar_literal(constant_ir.value, *scalar)
            }
            NagaExpressionIR::AccessIndex { base, index } => {
                let base_expr = self.emit(*base)?;
                let component = match index {
                    0 => "x", 1 => "y", 2 => "z", 3 => "w",
                    _ => return Err("access_index out of range".to_string()),
                };
                format!("{base_expr}.{component}")
            }
            NagaExpressionIR::Binary { op, left, right } => {
                let left_expr = self.emit(*left)?;
                let right_expr = self.emit(*right)?;
                let op_token = match op {
                    NagaBinaryOpIR::Add => "+", NagaBinaryOpIR::Sub => "-",
                    NagaBinaryOpIR::Mul => "*", NagaBinaryOpIR::Div => "/",
                    NagaBinaryOpIR::Mod => "%", NagaBinaryOpIR::Lt => "<",
                    NagaBinaryOpIR::Le => "<=", NagaBinaryOpIR::Gt => ">",
                    NagaBinaryOpIR::Ge => ">=", NagaBinaryOpIR::Eq => "==",
                    NagaBinaryOpIR::Ne => "!=",
                };
                format!("({left_expr} {op_token} {right_expr})")
            }
            NagaExpressionIR::LoadSymbolic { resource_id, lane, component } => {
                let resolved = self.resolver.resolve(resource_id).ok_or_else(|| format!("Unresolved symbol: {}", resource_id))?;

                // [LAW:single-enforcer] Storage location dispatch is driven by
                // the MMU's ResolvedResource, not by inspecting resource IDs.
                match resolved.storage_location {
                    crate::memory::ResourceStorageLocation::GlobalControlUbo => {
                        // [LAW:one-source-of-truth] UBO vec4 index and component
                        // are computed by the MMU; no vec4 modulo math here.
                        format!("global_controls[{}u].{}", resolved.ubo_vec4_index, resolved.ubo_component_name())
                    }
                    _ => {
                        let lane_expr = self.emit(*lane)?;
                        let component_expr = self.emit(*component)?;
                        // [LAW:one-source-of-truth] Physical SoA math is generated by the Rust MMU resolver.
                        let base_words = resolved.base_offset_bytes / 4;
                        let lane_stride_words = resolved.lane_stride_bytes / 4;
                        let component_stride_words = resolved.component_stride_bytes / 4;
                        let buffer_name = resolved.read_buffer_name();

                        format!("{}[{}u + ({} * {}u) + ({} * {}u)]",
                            buffer_name, base_words, lane_expr, lane_stride_words, component_expr, component_stride_words)
                    }
                }
            }
            NagaExpressionIR::LoadUniform { resource_id: _, index } => {
                let idx_expr = self.emit(*index)?;
                // [PHASE 1] For now, uniforms target the global control buffer (group 0, binding 4)
                format!("global_controls[{}]", idx_expr)
            }
            NagaExpressionIR::As { to, expr } => {
                let source = self.emit(*expr)?;
                match to {
                    NagaScalarKindIR::Bool => format!("({source} != 0u)"),
                    _ => format!("bitcast<{}>({source})", scalar_to_wgsl(*to)),
                }
            }
            NagaExpressionIR::Call { function, args } => {
                let mut emitted_args = Vec::new();
                for arg in args {
                    emitted_args.push(self.emit(*arg)?);
                }
                format!("{}({})", function, emitted_args.join(", "))
            }
        };

        self.stack.remove(&expr_id);
        self.cache.insert(expr_id, emitted.clone());
        Ok(emitted)
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
        NagaScalarKindIR::U32 => format!("{}u", value.trunc() as u32),
        NagaScalarKindIR::Bool => if value == 0.0 { "false".to_string() } else { "true".to_string() },
        NagaScalarKindIR::F32 => if value.fract() == 0.0 { format!("{value:.1}") } else { value.to_string() },
    }
}

fn emit_statement_block(
    function_ir: &NagaFunctionIR,
    module_ir: &NagaModuleIR,
    emitter: &mut ExpressionEmitter,
    statement_handles: &[usize],
    indent_level: usize,
    statement_stack: &mut HashSet<usize>,
) -> Result<Vec<String>, String> {
    let mut lines: Vec<String> = Vec::new();

    for statement_handle in statement_handles {
        if statement_stack.contains(statement_handle) {
            return Err(format!("Statement cycle detected at [{}]", statement_handle));
        }

        let statement = function_ir.statements.get(*statement_handle).ok_or_else(|| "Statement not found")?;
        statement_stack.insert(*statement_handle);
        let indent = "  ".repeat(indent_level);

        match statement {
            NagaStatementIR::StoreSymbolic { resource_id, lane, component, value, comment } => {
                let lane_expr = emitter.emit(*lane)?;
                let component_expr = emitter.emit(*component)?;
                let value_expr = emitter.emit(*value)?;
                let resolved = emitter.resolver.resolve(resource_id).ok_or_else(|| format!("Unresolved symbol: {}", resource_id))?;

                // [LAW:single-enforcer] Buffer name is determined by the MMU's
                // storage_location, not by inspecting resource ID prefixes.
                let base_words = resolved.base_offset_bytes / 4;
                let lane_stride_words = resolved.lane_stride_bytes / 4;
                let component_stride_words = resolved.component_stride_bytes / 4;
                let buffer_name = resolved.write_buffer_name();

                let mut line = format!("{indent}{}[{}u + ({} * {}u) + ({} * {}u)] = {};",
                    buffer_name, base_words, lane_expr, lane_stride_words, component_expr, component_stride_words, value_expr);
                if let Some(c) = comment {
                    line.push_str(" // ");
                    line.push_str(c);
                }
                lines.push(line);
            }
            NagaStatementIR::Comment { text } => {
                lines.push(format!("{indent}// {text}"));
            }
            NagaStatementIR::If { condition, accept, reject } => {
                let condition_expr = emitter.emit(*condition)?;
                lines.push(format!("{indent}if ({condition_expr}) {{"));
                lines.extend(emit_statement_block(function_ir, module_ir, emitter, accept, indent_level + 1, statement_stack)?);
                if !reject.is_empty() {
                    lines.push(format!("{indent}}} else {{"));
                    lines.extend(emit_statement_block(function_ir, module_ir, emitter, reject, indent_level + 1, statement_stack)?);
                }
                lines.push(format!("{indent}}}"));
            }
            NagaStatementIR::Loop { body } => {
                lines.push(format!("{indent}loop {{"));
                lines.extend(emit_statement_block(function_ir, module_ir, emitter, body, indent_level + 1, statement_stack)?);
                lines.push(format!("{indent}}}"));
            }
            NagaStatementIR::Break => lines.push(format!("{indent}break;")),
            NagaStatementIR::Continue => lines.push(format!("{indent}continue;")),
            NagaStatementIR::Return => lines.push(format!("{indent}return;")),
        }
        statement_stack.remove(statement_handle);
    }
    Ok(lines)
}

fn emit_module_to_wgsl(module_ir: &NagaModuleIR, resolver: &crate::memory::SymbolResolver, max_active_lanes: Option<u32>) -> Result<String, String> {
    // Basic WGSL scaffolding for the compute shader.
    let mut lines = Vec::new();
    
    // [LAW:one-source-of-truth] Bindings match ComputeDispatcher::create_compiler_simulation_layout
    lines.push("@group(0) @binding(0) var<storage, read> arena_in: array<u32>;".to_string());
    lines.push("@group(0) @binding(1) var<storage, read_write> arena_out: array<u32>;".to_string());
    lines.push("@group(0) @binding(2) var<storage, read> state_in: array<u32>;".to_string());
    lines.push("@group(0) @binding(3) var<storage, read_write> state_out: array<u32>;".to_string());
    lines.push("@group(0) @binding(4) var<uniform> global_controls: array<vec4<f32>, 16>;".to_string());
    lines.push(String::new());

    let compute_entry = module_ir.entry_points.iter().find(|e| e.stage == "compute").ok_or("Missing compute entry")?;
    let function_ir = module_ir.functions.iter().find(|f| f.name == compute_entry.function).ok_or("Entry function not found")?;

    let mut arg_parts = Vec::new();
    for argument in &function_ir.arguments {
        if let Some(builtin) = &argument.builtin {
            arg_parts.push(format!("@builtin({builtin}) {}: vec3<u32>", argument.name));
        }
    }

    if let Some(max_lanes) = max_active_lanes {
        lines.push(format!("const MAX_ACTIVE_LANES: u32 = {}u;", max_lanes));
    }

    lines.push(format!("@compute @workgroup_size({}, {}, {})", compute_entry.workgroup_size[0], compute_entry.workgroup_size[1], compute_entry.workgroup_size[2]));
    lines.push(format!("fn main({}) {{", arg_parts.join(", ")));
    
    if let Some(_max_lanes) = max_active_lanes {
        let gid_name = function_ir.arguments.iter().find(|a| a.builtin.as_deref() == Some("global_invocation_id")).map(|a| a.name.as_str()).unwrap_or("gid");
        lines.push(format!("  let lane = {}.x;", gid_name));
        lines.push("  if (lane >= MAX_ACTIVE_LANES) { return; }".to_string());
    }

    let mut emitter = ExpressionEmitter::new(function_ir, module_ir, resolver);
    let mut statement_stack = HashSet::new();
    lines.extend(emit_statement_block(function_ir, module_ir, &mut emitter, &function_ir.body, 1, &mut statement_stack)?);
    
    lines.push("}".to_string());
    Ok(lines.join("\n"))
}

// [RECOVER-06] Draw-prep compute derives indirect args from canonical GPU state.
// [LAW:one-source-of-truth] Topology bank (ShapeHeaderV1) is the canonical
// geometry source. Descriptors carry static metadata resolved at pack time.
const DEFAULT_DRAW_PREP_WGSL: &str = r#"
// [LAW:one-source-of-truth] TopologyType values must match shapes/types.ts TopologyType enum.
const TOPOLOGY_TYPE_NON_INDEXED: u32 = 0u;
const TOPOLOGY_TYPE_INDEXED: u32 = 1u;

const SINK_TABLE_HEADER_WORDS: u32 = 8u;
const SINK_TABLE_RECORD_WORDS: u32 = 8u;
const SINK_TABLE_DESCRIPTOR_WORDS: u32 = 26u;
const DEFAULT_INDEXED_STRIDE_WORDS: u32 = 5u;
const DEFAULT_NON_INDEXED_STRIDE_WORDS: u32 = 4u;

const TABLE_WORD_TOTAL_RECORD_COUNT: u32 = 1u;
const TABLE_WORD_INDEXED_COUNT: u32 = 2u;
const TABLE_WORD_INDEXED_REGION_BASE_WORDS: u32 = 4u;
const TABLE_WORD_NON_INDEXED_REGION_BASE_WORDS: u32 = 5u;
const TABLE_WORD_INDEXED_STRIDE_WORDS: u32 = 6u;
const TABLE_WORD_NON_INDEXED_STRIDE_WORDS: u32 = 7u;

// Descriptor word offsets for instance-count and shape metadata
const DESCRIPTOR_WORD_INSTANCE_COUNT_MODE: u32 = 23u;
const DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT: u32 = 24u;
const DESCRIPTOR_WORD_SHAPE_WORD_OFFSET: u32 = 25u;

const INSTANCE_COUNT_MODE_STATIC: u32 = 0u;

// ShapeHeaderV1 word offsets (must match RuntimeState.ts ShapeBankHeaderWord)
// [LAW:one-source-of-truth] Word 1 = TopologyMode, used as TopologyType discriminant.
const SHAPE_WORD_TOPOLOGY_TYPE: u32 = 1u;
const SHAPE_WORD_INDEX_COUNT: u32 = 4u;
const SHAPE_WORD_FIRST_INDEX: u32 = 5u;
const SHAPE_WORD_BASE_VERTEX: u32 = 6u;
const SHAPE_WORD_VERTEX_COUNT: u32 = 7u;
const SHAPE_WORD_FIRST_VERTEX: u32 = 8u;

@group(0) @binding(0) var<storage, read> sinkTableWords: array<u32>;
@group(0) @binding(1) var<storage, read> topologyBank: array<u32>;
@group(0) @binding(2) var<storage, read_write> indirectWords: array<atomic<u32>>;

fn readTopology(offset: u32) -> u32 {
  if (offset >= arrayLength(&topologyBank)) {
    return 0u;
  }
  return topologyBank[offset];
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (arrayLength(&sinkTableWords) < SINK_TABLE_HEADER_WORDS) {
    return;
  }

  let totalRecordCount = sinkTableWords[TABLE_WORD_TOTAL_RECORD_COUNT];
  let recordIndex = gid.x;
  if (recordIndex >= totalRecordCount) {
    return;
  }

  let recordBase = SINK_TABLE_HEADER_WORDS + recordIndex * SINK_TABLE_RECORD_WORDS;
  if (recordBase >= arrayLength(&sinkTableWords)) {
    return;
  }

  let indexedRecordCount = sinkTableWords[TABLE_WORD_INDEXED_COUNT];
  let indexedRegionBaseWords = sinkTableWords[TABLE_WORD_INDEXED_REGION_BASE_WORDS];
  let nonIndexedRegionBaseWords = sinkTableWords[TABLE_WORD_NON_INDEXED_REGION_BASE_WORDS];
  let indexedStrideWords = max(sinkTableWords[TABLE_WORD_INDEXED_STRIDE_WORDS], DEFAULT_INDEXED_STRIDE_WORDS);
  let nonIndexedStrideWords = max(sinkTableWords[TABLE_WORD_NON_INDEXED_STRIDE_WORDS], DEFAULT_NON_INDEXED_STRIDE_WORDS);

  // [RECOVER-06] Read descriptor for this record (moved before topology type
  // read so shapeWordOffset is available for the bifurcated dispatch).
  let descriptorsBase = SINK_TABLE_HEADER_WORDS + totalRecordCount * SINK_TABLE_RECORD_WORDS;
  let descriptorBase = descriptorsBase + recordIndex * SINK_TABLE_DESCRIPTOR_WORDS;

  // Derive instanceCount from descriptor
  let instanceCountMode = sinkTableWords[descriptorBase + DESCRIPTOR_WORD_INSTANCE_COUNT_MODE];
  let instanceCount = select(0u, sinkTableWords[descriptorBase + DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT], instanceCountMode == INSTANCE_COUNT_MODE_STATIC);

  // Derive firstInstance as prefix sum of instance counts for all earlier records
  var firstInstance = 0u;
  for (var i = 0u; i < recordIndex; i = i + 1u) {
    let prevDescBase = descriptorsBase + i * SINK_TABLE_DESCRIPTOR_WORDS;
    let prevMode = sinkTableWords[prevDescBase + DESCRIPTOR_WORD_INSTANCE_COUNT_MODE];
    firstInstance = firstInstance + select(0u, sinkTableWords[prevDescBase + DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT], prevMode == INSTANCE_COUNT_MODE_STATIC);
  }

  // [LAW:one-source-of-truth] Read topology type from the canonical topology
  // bank header (word 1 = TopologyMode). This is the bifurcated dispatch
  // discriminant — indexed vs non-indexed families.
  // See docs/AGENT_ENGINEERING_STANDARDS.md §3 (Absolute vs. Relative).
  let shapeWordOffset = sinkTableWords[descriptorBase + DESCRIPTOR_WORD_SHAPE_WORD_OFFSET];
  let topologyType = readTopology(shapeWordOffset + SHAPE_WORD_TOPOLOGY_TYPE);

  if (topologyType == TOPOLOGY_TYPE_INDEXED) {
    if (recordIndex >= indexedRecordCount) {
      return;
    }
    // Derive indexed draw args from ShapeHeaderV1
    let count = readTopology(shapeWordOffset + SHAPE_WORD_INDEX_COUNT);
    let relativeFirstIndex = readTopology(shapeWordOffset + SHAPE_WORD_FIRST_INDEX);
    let baseVertex = readTopology(shapeWordOffset + SHAPE_WORD_BASE_VERTEX);
    // [LAW:one-source-of-truth] FirstIndex in the header is a relative word
    // offset within the shape record. drawIndexedIndirect needs an absolute
    // index into the bound index buffer (== TopologyBank), so add the record
    // base. See docs/AGENT_ENGINEERING_STANDARDS.md §3 (Absolute vs. Relative).
    let absoluteFirstIndex = shapeWordOffset + relativeFirstIndex;

    let base = indexedRegionBaseWords + recordIndex * indexedStrideWords;
    if (base + 4u >= arrayLength(&indirectWords)) {
      return;
    }
    atomicStore(&indirectWords[base + 0u], count);
    atomicAdd(&indirectWords[base + 1u], instanceCount);
    atomicStore(&indirectWords[base + 2u], absoluteFirstIndex);
    atomicStore(&indirectWords[base + 3u], baseVertex);
    atomicStore(&indirectWords[base + 4u], firstInstance);
    return;
  }

  if (topologyType != TOPOLOGY_TYPE_NON_INDEXED || recordIndex < indexedRecordCount) {
    return;
  }
  // Derive non-indexed draw args from ShapeHeaderV1
  let count = readTopology(shapeWordOffset + SHAPE_WORD_VERTEX_COUNT);
  let relativeFirstVertex = readTopology(shapeWordOffset + SHAPE_WORD_FIRST_VERTEX);
  // [LAW:one-source-of-truth] FirstVertex in the header is a relative word
  // offset within the shape record. drawIndirect needs an absolute vertex
  // index into the bound topology buffer, so add the record base.
  // See docs/AGENT_ENGINEERING_STANDARDS.md §3 (Absolute vs. Relative).
  let absoluteFirstVertex = shapeWordOffset + relativeFirstVertex;

  let nonIndexedRecordIndex = recordIndex - indexedRecordCount;
  let base = nonIndexedRegionBaseWords + nonIndexedRecordIndex * nonIndexedStrideWords;
  if (base + 3u >= arrayLength(&indirectWords)) {
    return;
  }
  atomicStore(&indirectWords[base + 0u], count);
  atomicAdd(&indirectWords[base + 1u], instanceCount);
  atomicStore(&indirectWords[base + 2u], absoluteFirstVertex);
  atomicStore(&indirectWords[base + 3u], firstInstance);
}
"#;

pub struct ComputeDispatcher {
    simulation_pipelines: Vec<CompiledComputePassPipeline>,
    instance_assembly_pipeline: wgpu::ComputePipeline,
    draw_prep_pipeline: wgpu::ComputePipeline,
    compiler_simulation_layout: wgpu::BindGroupLayout,
    pub uniform_layout: wgpu::BindGroupLayout,
    pub state_layout: wgpu::BindGroupLayout,
    pub assembly_layout: wgpu::BindGroupLayout,
    pub draw_prep_layout: wgpu::BindGroupLayout,
    pub kernel_registry: KernelRegistry,
}

#[derive(Clone, Debug)]
pub struct CompilerComputePassSpec {
    pub pass_id: String,
    pub entry_point: String,
    pub wgsl: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WorkgroupSize {
    x: u32,
    y: u32,
    z: u32,
}

struct CompiledComputePassPipeline {
    _pass_id: String,
    pipeline: wgpu::ComputePipeline,
    workgroup_count: u32,
}

#[derive(Clone, Debug)]
struct ValidatedComputePassProgram {
    pass_id: String,
    entry_point: String,
    wgsl: String,
    workgroup_count: u32,
}

pub struct StagedSimulationPipelines {
    programs: Vec<ValidatedComputePassProgram>,
}

impl ComputeDispatcher {
    fn validate_workgroup_size(
        limits: &wgpu::Limits,
        pass_id: &str,
        workgroup_size: WorkgroupSize,
    ) -> Result<(), String> {
        if workgroup_size.x == 0 || workgroup_size.y == 0 || workgroup_size.z == 0 {
            return Err(format!(
                "pass \"{}\" workgroup_size dimensions must all be at least 1",
                pass_id
            ));
        }
        if workgroup_size.y != 1 || workgroup_size.z != 1 {
            return Err(format!(
                "pass \"{}\" workgroup_size must be 1D because runtime dispatch indexes only global_invocation_id.x",
                pass_id
            ));
        }
        if workgroup_size.x > limits.max_compute_workgroup_size_x {
            return Err(format!(
                "pass \"{}\" workgroup_size.x={} exceeds device limit {}",
                pass_id, workgroup_size.x, limits.max_compute_workgroup_size_x
            ));
        }
        if workgroup_size.y > limits.max_compute_workgroup_size_y {
            return Err(format!(
                "pass \"{}\" workgroup_size.y={} exceeds device limit {}",
                pass_id, workgroup_size.y, limits.max_compute_workgroup_size_y
            ));
        }
        if workgroup_size.z > limits.max_compute_workgroup_size_z {
            return Err(format!(
                "pass \"{}\" workgroup_size.z={} exceeds device limit {}",
                pass_id, workgroup_size.z, limits.max_compute_workgroup_size_z
            ));
        }
        let total_invocations = workgroup_size
            .x
            .saturating_mul(workgroup_size.y)
            .saturating_mul(workgroup_size.z);
        if total_invocations > limits.max_compute_invocations_per_workgroup {
            return Err(format!(
                "pass \"{}\" total workgroup invocations={} exceeds device limit {}",
                pass_id, total_invocations, limits.max_compute_invocations_per_workgroup
            ));
        }
        Ok(())
    }

    fn simulation_dispatch_count_for_workgroup_size(
        particle_count: u32,
        workgroup_size: WorkgroupSize,
    ) -> u32 {
        ((particle_count.saturating_add(workgroup_size.x.saturating_sub(1))) / workgroup_size.x)
            .max(1)
    }

    fn find_compute_entry_point(
        pass_id: &str,
        module: &Module,
        entry_point: &str,
    ) -> Result<WorkgroupSize, String> {
        let entry = module
            .entry_points
            .iter()
            .find(|candidate| candidate.name == entry_point)
            .ok_or_else(|| {
                format!(
                    "pass \"{}\" entry point \"{}\" was not found in WGSL module",
                    pass_id, entry_point
                )
            })?;
        if entry.stage != naga::ShaderStage::Compute {
            return Err(format!(
                "pass \"{}\" entry point \"{}\" must be a compute stage",
                pass_id, entry_point
            ));
        }
        if entry.workgroup_size_overrides.is_some() {
            return Err(format!(
                "pass \"{}\" entry point \"{}\" uses unsupported override-based workgroup sizing",
                pass_id, entry_point
            ));
        }
        Ok(WorkgroupSize {
            x: entry.workgroup_size[0],
            y: entry.workgroup_size[1],
            z: entry.workgroup_size[2],
        })
    }

    fn validate_compute_program_contract(
        limits: &wgpu::Limits,
        particle_count: u32,
        spec: &CompilerComputePassSpec,
    ) -> Result<ValidatedComputePassProgram, String> {
        // [LAW:single-enforcer] Candidate shader admission is derived from the
        // uploaded WGSL program and device limits at one Rust boundary.
        let module = naga::front::wgsl::parse_str(spec.wgsl.as_str()).map_err(|error| {
            format!(
                "pass \"{}\" WGSL parsing failed:\n{}",
                spec.pass_id,
                error.emit_to_string(spec.wgsl.as_str())
            )
        })?;
        Validator::new(ValidationFlags::all(), Capabilities::all())
            .validate(&module)
            .map_err(|error| {
                format!(
                    "pass \"{}\" WGSL validation failed: {}",
                    spec.pass_id, error
                )
            })?;
        let workgroup_size = Self::find_compute_entry_point(
            spec.pass_id.as_str(),
            &module,
            spec.entry_point.as_str(),
        )?;
        Self::validate_workgroup_size(limits, spec.pass_id.as_str(), workgroup_size)?;
        let workgroup_count =
            Self::simulation_dispatch_count_for_workgroup_size(particle_count, workgroup_size)
                .max(1);
        if workgroup_count > limits.max_compute_workgroups_per_dimension {
            return Err(format!(
                "pass \"{}\" dispatch count {} exceeds device limit {}",
                spec.pass_id, workgroup_count, limits.max_compute_workgroups_per_dimension
            ));
        }
        Ok(ValidatedComputePassProgram {
            pass_id: spec.pass_id.clone(),
            entry_point: spec.entry_point.clone(),
            wgsl: spec.wgsl.clone(),
            workgroup_count,
        })
    }

    pub fn new(
        device: &wgpu::Device,
        simulation_wgsl: &str,
        assembly_wgsl: &str,
        particle_count: u32,
        _shape_count: u32,
    ) -> Self {
        // [LAW:one-source-of-truth] This layout defines the uniform transport
        // binding for FrameHeader. The canonical source is the arena header
        // zone; this uniform binding mirrors that data for GPU binding compat.
        let uniform_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("FrameHeader.UniformTransport.Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::COMPUTE
                    | wgpu::ShaderStages::VERTEX
                    | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let state_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compute.State.Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    // [LAW:one-source-of-truth] Assembly consumes one canonical
                    // compiler-arena input binding as read-only storage.
                    ty: wgpu::BufferBindingType::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let assembly_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compute.Assembly.Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let draw_prep_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compute.DrawPrep.Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let compiler_simulation_layout = Self::create_compiler_simulation_layout(device);
        let default_program = Self::validate_compute_program_contract(
            &device.limits(),
            particle_count,
            &CompilerComputePassSpec {
                pass_id: "simulation".to_string(),
                entry_point: "compute_main".to_string(),
                wgsl: simulation_wgsl.to_string(),
            },
        )
        .expect("default simulation shader must satisfy canonical compute-program contract");
        let simulation_pipelines = Self::compile_runtime_simulation_pipelines(
            device,
            &compiler_simulation_layout,
            &[default_program],
        )
        .expect("default simulation pipeline must satisfy canonical workgroup/device limits");
        let assembly_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.Assembly.Shader"),
            source: wgpu::ShaderSource::Wgsl(assembly_wgsl.into()),
        });
        let draw_prep_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.DrawPrep.Shader"),
            source: wgpu::ShaderSource::Wgsl(DEFAULT_DRAW_PREP_WGSL.into()),
        });

        let assembly_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Compute.Assembly.PipelineLayout"),
                bind_group_layouts: &[&uniform_layout, &state_layout, &assembly_layout],
                push_constant_ranges: &[],
            });
        let instance_assembly_pipeline =
            device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: Some("Compute.Assembly.Pipeline"),
                layout: Some(&assembly_pipeline_layout),
                module: &assembly_module,
                entry_point: Some("main"),
                cache: None,
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            });

        let draw_prep_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Compute.DrawPrep.PipelineLayout"),
                bind_group_layouts: &[&draw_prep_layout],
                push_constant_ranges: &[],
            });
        let draw_prep_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute.DrawPrep.Pipeline"),
            layout: Some(&draw_prep_pipeline_layout),
            module: &draw_prep_module,
            entry_point: Some("main"),
            cache: None,
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        });

        Self {
            simulation_pipelines,
            instance_assembly_pipeline,
            draw_prep_pipeline,
            compiler_simulation_layout,
            uniform_layout,
            state_layout,
            assembly_layout,
            draw_prep_layout,
            kernel_registry: KernelRegistry::new(),
        }
    }

    fn create_compiler_simulation_pipeline(
        device: &wgpu::Device,
        simulation_wgsl: &str,
        entry_point: &str,
        compiler_simulation_layout: &wgpu::BindGroupLayout,
    ) -> wgpu::ComputePipeline {
        let simulation_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.CompilerSimulation.Shader"),
            source: wgpu::ShaderSource::Wgsl(simulation_wgsl.into()),
        });
        let simulation_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Compute.CompilerSimulation.PipelineLayout"),
                bind_group_layouts: &[compiler_simulation_layout],
                push_constant_ranges: &[],
            });
        device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute.CompilerSimulation.Pipeline"),
            layout: Some(&simulation_pipeline_layout),
            module: &simulation_module,
            entry_point: Some(entry_point),
            cache: None,
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        })
    }

    fn compile_runtime_simulation_pipelines(
        device: &wgpu::Device,
        compiler_simulation_layout: &wgpu::BindGroupLayout,
        programs: &[ValidatedComputePassProgram],
    ) -> Result<Vec<CompiledComputePassPipeline>, String> {
        if programs.is_empty() {
            return Err(
                "[LAW:no-silent-fallbacks] compile_runtime_simulation_pipelines requires at least one validated program".to_string(),
            );
        }
        let mut compiled = Vec::with_capacity(programs.len().max(1));
        for program in programs {
            let pipeline = Self::create_compiler_simulation_pipeline(
                device,
                program.wgsl.as_str(),
                program.entry_point.as_str(),
                compiler_simulation_layout,
            );
            compiled.push(CompiledComputePassPipeline {
                _pass_id: program.pass_id.clone(),
                pipeline,
                workgroup_count: program.workgroup_count,
            });
        }
        Ok(compiled)
    }

    fn create_compiler_simulation_layout(device: &wgpu::Device) -> wgpu::BindGroupLayout {
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compute.CompilerSimulation.Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        })
    }

    async fn validate_program_only_pipeline_compilation(
        device: &wgpu::Device,
        program: &ValidatedComputePassProgram,
    ) -> Result<(), String> {
        device.push_error_scope(wgpu::ErrorFilter::Validation);
        let simulation_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.CandidateShaderAdmission.Shader"),
            source: wgpu::ShaderSource::Wgsl(program.wgsl.as_str().into()),
        });
        let _pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute.CandidateShaderAdmission.Pipeline"),
            layout: None,
            module: &simulation_module,
            entry_point: Some(program.entry_point.as_str()),
            cache: None,
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        });
        if let Some(error) = device.pop_error_scope().await {
            return Err(format!(
                "pass \"{}\" generic pipeline compilation failed: {}",
                program.pass_id, error
            ));
        }
        Ok(())
    }

    pub async fn stage_gpu_pipelines_with_compiler_wgsl(
        &self,
        device: &wgpu::Device,
        pass_specs: &[CompilerComputePassSpec],
        particle_count: u32,
    ) -> Result<StagedSimulationPipelines, String> {
        if pass_specs.is_empty() {
            return Err(
                "[LAW:no-silent-fallbacks] stage_gpu_pipelines_with_compiler_wgsl requires at least one pass spec".to_string(),
            );
        }
        // [LAW:one-source-of-truth] Stage decisions come from WGSL program
        // contents plus device limits, not application-owned runtime planes.
        let limits = device.limits();
        let mut programs = Vec::with_capacity(pass_specs.len());
        for spec in pass_specs {
            let program = Self::validate_compute_program_contract(&limits, particle_count, spec)?;
            Self::validate_program_only_pipeline_compilation(device, &program).await?;
            programs.push(program);
        }
        Ok(StagedSimulationPipelines { programs })
    }

    pub async fn activate_staged_gpu_pipelines(
        &mut self,
        device: &wgpu::Device,
        staged: StagedSimulationPipelines,
    ) -> Result<(), String> {
        device.push_error_scope(wgpu::ErrorFilter::Validation);
        let pipelines = Self::compile_runtime_simulation_pipelines(
            device,
            &self.compiler_simulation_layout,
            staged.programs.as_slice(),
        )?;
        if let Some(error) = device.pop_error_scope().await {
            return Err(error.to_string());
        }
        self.simulation_pipelines = pipelines;
        Ok(())
    }

    pub fn rebuild_simulation_pipeline_with_manifest(
        &mut self,
        device: &wgpu::Device,
        resolver: &crate::memory::SymbolResolver,
        lowering: NagaModuleIR,
        max_active_lanes: u32,
    ) -> Result<(), String> {
        let wgsl = emit_module_to_wgsl(&lowering, resolver, Some(max_active_lanes))?;

        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compute.DynamicSimulation.Shader"),
            source: wgpu::ShaderSource::Wgsl(wgsl.into()),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Compute.DynamicSimulation.PipelineLayout"),
            bind_group_layouts: &[&self.compiler_simulation_layout],
            push_constant_ranges: &[],
        });

        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute.DynamicSimulation.Pipeline"),
            layout: Some(&pipeline_layout),
            module: &module,
            entry_point: Some("main"),
            cache: None,
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        });

        // For Phase 1, we replace the first simulation pipeline
        self.simulation_pipelines = vec![CompiledComputePassPipeline {
            _pass_id: "dynamic".to_string(),
            pipeline,
            workgroup_count: (max_active_lanes + 63) / 64,
        }];

        Ok(())
    }

    pub fn compiler_simulation_layout(&self) -> &wgpu::BindGroupLayout {
        &self.compiler_simulation_layout
    }

    pub fn simulation_workgroup_count(&self) -> u32 {
        self.simulation_pipelines
            .iter()
            .map(|pipeline| pipeline.workgroup_count)
            .fold(0u32, |acc, count| acc.saturating_add(count))
    }

    pub fn simulation_dispatch_count(&self) -> u32 {
        self.simulation_pipelines.len() as u32
    }

    pub fn encode_simulation_and_assembly(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        arena: &mut GpuMemoryArena,
        assembly_instance_count: u32,
    ) {
        let mut read_index = arena.ping_pong_index();
        for compiled_pass in &self.simulation_pipelines {
            let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Compute.Simulation.Pass"),
                timestamp_writes: None,
            });
            compute_pass.set_pipeline(&compiled_pass.pipeline);
            compute_pass.set_bind_group(
                0,
                arena.get_compiler_simulation_bind_group_for_index(read_index),
                &[],
            );
            compute_pass.dispatch_workgroups(compiled_pass.workgroup_count, 1, 1);
            read_index = (read_index + 1) & 1;
        }

        {
            let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Compute.InstanceAssembly.Pass"),
                timestamp_writes: None,
            });
            compute_pass.set_pipeline(&self.instance_assembly_pipeline);
            compute_pass.set_bind_group(0, &arena.uniform_bind_group, &[]);
            // [LAW:one-source-of-truth] Instance assembly reads the final
            // simulation output bank resolved by deterministic pass chaining.
            compute_pass.set_bind_group(
                1,
                arena.get_compiler_arena_bind_group_for_index(read_index),
                &[],
            );
            compute_pass.set_bind_group(2, &arena.assembly_write_bind_group, &[]);
            // [LAW:single-enforcer] Runtime sink-table instance totals are the
            // canonical source for per-frame assembly dispatch size.
            let assembly_workgroup_count =
                ((assembly_instance_count.saturating_add(63)) / 64).max(1);
            compute_pass.dispatch_workgroups(assembly_workgroup_count, 1, 1);
        }
        arena.set_ping_pong_index(read_index);
    }

    /// Execute a batch of NagaEmitterInstructions from the TS compiler.
    /// [LAW:single-enforcer] This is the single boundary where emitter
    /// instructions are dispatched to the GPU.
    pub fn execute_instructions(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        instructions: &[NagaEmitterInstruction],
        resolver: &SymbolResolver,
        arena: &GpuMemoryArena,
        particle_count: u32,
    ) -> Result<(), String> {
        for instruction in instructions {
            instruction.execute(
                encoder,
                &self.kernel_registry,
                resolver,
                arena,
                particle_count,
            )?;
        }
        Ok(())
    }

    pub fn encode_draw_prep(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        arena: &GpuMemoryArena,
        draw_prep_record_count: u32,
    ) {
        let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("Compute.DrawPrep.Pass"),
            timestamp_writes: None,
        });
        compute_pass.set_pipeline(&self.draw_prep_pipeline);
        compute_pass.set_bind_group(0, &arena.draw_prep_bind_group, &[]);
        // [LAW:dataflow-not-control-flow] Draw prep always dispatches on the
        // canonical stage; record count data governs in-shader no-op behavior.
        let draw_prep_workgroup_count = ((draw_prep_record_count.saturating_add(63)) / 64).max(1);
        compute_pass.dispatch_workgroups(draw_prep_workgroup_count, 1, 1);
    }
}

#[cfg(test)]
mod tests {
    use super::{CompilerComputePassSpec, ComputeDispatcher, WorkgroupSize};

    #[test]
    fn validate_compute_program_contract_rejects_missing_entry_point() {
        let result = ComputeDispatcher::validate_compute_program_contract(
            &wgpu::Limits::default(),
            1_024,
            &CompilerComputePassSpec {
                pass_id: "simulation".to_string(),
                entry_point: "compute_main".to_string(),
                wgsl: "@compute @workgroup_size(64) fn other_main() {}".to_string(),
            },
        );
        assert!(result
            .err()
            .is_some_and(|message| message.contains("entry point \"compute_main\" was not found")));
    }

    #[test]
    fn dispatch_count_uses_x_dimension_only() {
        let count = ComputeDispatcher::simulation_dispatch_count_for_workgroup_size(
            65_536,
            WorkgroupSize { x: 64, y: 1, z: 1 },
        );
        assert_eq!(count, 1_024);
    }

    #[test]
    fn validate_workgroup_size_rejects_total_invocations_over_limit() {
        let mut limits = wgpu::Limits::default();
        limits.max_compute_workgroup_size_x = 512;
        limits.max_compute_workgroup_size_y = 256;
        limits.max_compute_workgroup_size_z = 64;
        limits.max_compute_invocations_per_workgroup = 256;
        let result = ComputeDispatcher::validate_workgroup_size(
            &limits,
            "simulation",
            WorkgroupSize { x: 300, y: 1, z: 1 },
        );
        assert!(result
            .err()
            .is_some_and(|message| message.contains("total workgroup invocations")));
    }

    #[test]
    fn validate_workgroup_size_rejects_zero_dimension() {
        let result = ComputeDispatcher::validate_workgroup_size(
            &wgpu::Limits::default(),
            "simulation",
            WorkgroupSize { x: 0, y: 1, z: 1 },
        );
        assert!(result
            .err()
            .is_some_and(|message| message.contains("at least 1")));
    }

    #[test]
    fn validate_workgroup_size_rejects_non_1d_shapes() {
        let result = ComputeDispatcher::validate_workgroup_size(
            &wgpu::Limits::default(),
            "simulation",
            WorkgroupSize { x: 64, y: 2, z: 1 },
        );
        assert!(result
            .err()
            .is_some_and(|message| message.contains("must be 1D")));
    }
}
