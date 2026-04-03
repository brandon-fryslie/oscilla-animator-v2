//! WASM Renderer Canonical Boundary Contract — Rust mirror of boundary-contract.ts.
//!
//! [LAW:one-source-of-truth] These types are deserialized from JSON sent by JS.
//! The TS types in `boundary-contract.ts` are the authority; these must match exactly.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Phase 1: Pipeline Install Payload
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineInstallPayload {
    pub manifest: MemoryManifest,
    pub roster: Vec<RosterEntry>,
}

// ---------------------------------------------------------------------------
// Memory Manifest
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryManifest {
    pub preserve_state_on_recompile: bool,
    pub globals: HashMap<String, GlobalSpec>,
    pub arena_scalars: HashMap<String, ArenaScalarSpec>,
    pub domains: HashMap<String, InstanceDomainSpec>,
    pub textures: HashMap<String, TextureSpec>,
    pub shape_bank: HashMap<String, StaticGeometrySpec>,
    pub data_streams: HashMap<String, DataStreamSpec>,
    pub samplers: HashMap<String, SamplerSpec>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSpec {
    #[serde(rename = "type")]
    pub wgsl_type: String,
    pub is_dynamic: bool,
    pub default_value: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArenaScalarSpec {
    #[serde(rename = "type")]
    pub wgsl_type: String,
    pub clear_value: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceDomainSpec {
    pub capacity: u32,
    pub active_lanes_symbol: String,
    pub fields: HashMap<String, FieldSpec>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldSpec {
    #[serde(rename = "type")]
    pub wgsl_type: String,
    pub clear_value: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureSpec {
    pub dimension: String,
    pub width: serde_json::Value,
    pub height: Option<serde_json::Value>,
    pub depth_or_array_layers: Option<u32>,
    pub format: String,
    pub usage: Vec<String>,
    pub external_source: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticGeometrySpec {
    pub topology: String,
    pub vertex_layout: VertexLayout,
    pub vertex_data: Vec<f32>,
    pub index_data: Option<Vec<u32>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VertexLayout {
    pub stride: u32,
    pub attributes: HashMap<String, VertexAttribute>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VertexAttribute {
    pub format: String,
    pub shader_location: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataStreamSpec {
    #[serde(rename = "type")]
    pub wgsl_type: String,
    pub length: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamplerSpec {
    pub mag_filter: String,
    pub min_filter: String,
    pub address_mode_u: String,
    pub address_mode_v: String,
}

// ---------------------------------------------------------------------------
// Execution Roster
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum RosterEntry {
    Compute(ComputePassSpec),
    Render(RenderPassSpec),
    #[serde(rename = "System_DrawPrep")]
    SystemDrawPrep(SystemPassSpec),
    #[serde(rename = "System_CameraUpdate")]
    SystemCameraUpdate(SystemCameraUpdateSpec),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputePassSpec {
    pub pass_id: String,
    pub source_block_ids: Vec<String>,
    pub workgroup_size: [u32; 3],
    pub dispatch: DispatchMode,
    pub dependencies: ComputeDependencies,
    pub ast: Vec<StatementIR>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "mode")]
pub enum DispatchMode {
    Domain {
        #[serde(rename = "domainId")]
        domain_id: String,
    },
    Texture {
        #[serde(rename = "textureId")]
        texture_id: String,
    },
    Exact {
        x: u32,
        y: u32,
        z: u32,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeDependencies {
    pub requires_globals: bool,
    pub domains: HashMap<String, String>,
    pub textures: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPassSpec {
    pub pass_id: String,
    pub source_block_ids: Vec<String>,
    pub targets: RenderTargets,
    pub viewport: Option<ViewportSpec>,
    pub scissor_rect: Option<ScissorRectSpec>,
    pub draw_calls: Vec<DrawCallSpec>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportSpec {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub min_depth: Option<f32>,
    pub max_depth: Option<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScissorRectSpec {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderTargets {
    pub colors: Vec<ColorTarget>,
    pub depth_stencil: Option<DepthStencilTarget>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorTarget {
    pub texture_id: String,
    pub load_op: String,
    pub clear_color: Option<[f64; 4]>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepthStencilTarget {
    pub texture_id: String,
    pub depth_load_op: Option<String>,
    pub depth_clear_value: Option<f64>,
    pub stencil_load_op: Option<String>,
    pub stencil_clear_value: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawCallSpec {
    pub intent_id: String,
    pub source: DrawCallSource,
    pub pipeline_state: PipelineStateSpec,
    pub dependencies: DrawCallDependencies,
    pub vertex_ast: Vec<StatementIR>,
    pub fragment_ast: Vec<StatementIR>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum DrawCallSource {
    Domain {
        #[serde(rename = "domainId")]
        domain_id: String,
        #[serde(rename = "sourceKind")]
        source_kind: String,
        #[serde(rename = "shapeId")]
        shape_id: String,
    },
    FullScreenQuad,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStateSpec {
    pub blend_mode: String,
    pub cull_mode: String,
    pub depth_write: bool,
    pub depth_compare: String,
    pub stencil_read_mask: Option<u32>,
    pub stencil_write_mask: Option<u32>,
    pub stencil_front: Option<StencilFaceState>,
    pub stencil_back: Option<StencilFaceState>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StencilFaceState {
    pub compare: String,
    pub fail_op: String,
    pub depth_fail_op: String,
    pub pass_op: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawCallDependencies {
    pub requires_globals: bool,
    pub camera_ref: String,
    pub domains: HashMap<String, String>,
    pub textures: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPassSpec {
    pub pass_id: String,
    pub source_block_ids: Vec<String>,
    pub active_lanes_symbol: String,
    pub vertex_count: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemCameraUpdateSpec {
    pub pass_id: String,
    pub camera_ref: String,
    pub ast: Vec<StatementIR>,
}

// ---------------------------------------------------------------------------
// Math IR: ExprIR
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum ExprIR {
    // Primitive literals
    LiteralF32 {
        value: f64,
    },
    LiteralU32 {
        value: u64,
    },
    LiteralI32 {
        value: i64,
    },
    LiteralBool {
        value: bool,
    },
    // Composite constructors & casts
    Construct {
        #[serde(rename = "dataType")]
        data_type: String,
        args: Vec<ExprIR>,
    },
    Cast {
        #[serde(rename = "targetType")]
        target_type: String,
        expr: Box<ExprIR>,
    },
    Swizzle {
        source: Box<ExprIR>,
        mask: String,
    },
    IndexAccess {
        target: Box<ExprIR>,
        index: Box<ExprIR>,
    },
    // Hardware intrinsics
    Intrinsic {
        name: String,
    },
    // Symbolic memory reads
    LoadGlobal {
        #[serde(rename = "symbolId")]
        symbol_id: String,
    },
    LoadScalar {
        #[serde(rename = "symbolId")]
        symbol_id: String,
    },
    LoadField {
        #[serde(rename = "symbolId")]
        symbol_id: String,
        index: Box<ExprIR>,
    },
    // Texture reads
    TextureSample {
        #[serde(rename = "textureId")]
        texture_id: String,
        #[serde(rename = "samplerId")]
        sampler_id: String,
        uv: Box<ExprIR>,
    },
    TextureLoad {
        #[serde(rename = "textureId")]
        texture_id: String,
        coords: Box<ExprIR>,
    },
    // Atomic reads
    AtomicLoadField {
        #[serde(rename = "symbolId")]
        symbol_id: String,
        index: Box<ExprIR>,
    },
    AtomicLoadScalar {
        #[serde(rename = "symbolId")]
        symbol_id: String,
    },
    // Operators
    BinaryOp {
        op: String,
        left: Box<ExprIR>,
        right: Box<ExprIR>,
    },
    UnaryOp {
        op: String,
        expr: Box<ExprIR>,
    },
    // Built-in math
    CallBuiltin {
        func: String,
        args: Vec<ExprIR>,
    },
    // Variable reference
    VarRef {
        name: String,
    },
    // Semantic: VP camera projection (expands to mat4x4 * position)
    ApplyVP {
        #[serde(rename = "vpSymbol")]
        vp_symbol: String,
        position: Box<ExprIR>,
    },
    // Semantic: 2D instance transform (scale → rotate → translate)
    ApplyTransform2D {
        position: Box<ExprIR>,
        #[serde(rename = "translateX")]
        translate_x: Box<ExprIR>,
        #[serde(rename = "translateY")]
        translate_y: Box<ExprIR>,
        rotation: Box<ExprIR>,
        scale: Box<ExprIR>,
    },
}

// ---------------------------------------------------------------------------
// Math IR: StatementIR
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum StatementIR {
    // Declarations
    Let {
        name: String,
        value: ExprIR,
    },
    Var {
        name: String,
        #[serde(rename = "dataType")]
        data_type: Option<String>,
        value: Option<ExprIR>,
    },
    Assign {
        target: ExprIR,
        value: ExprIR,
    },
    // Symbolic memory writes
    StoreGlobal {
        #[serde(rename = "symbolId")]
        symbol_id: String,
        value: ExprIR,
    },
    StoreScalar {
        #[serde(rename = "symbolId")]
        symbol_id: String,
        value: ExprIR,
    },
    StoreField {
        #[serde(rename = "symbolId")]
        symbol_id: String,
        index: ExprIR,
        value: ExprIR,
    },
    TextureStore {
        #[serde(rename = "textureId")]
        texture_id: String,
        coords: ExprIR,
        value: ExprIR,
    },
    // Control flow
    If {
        condition: ExprIR,
        accept: Vec<StatementIR>,
        reject: Vec<StatementIR>,
    },
    For {
        init: Box<StatementIR>,
        condition: ExprIR,
        update: Box<StatementIR>,
        body: Vec<StatementIR>,
    },
    Break,
    Continue,
    // Atomic mutations
    AtomicOpField {
        op: String,
        #[serde(rename = "symbolId")]
        symbol_id: String,
        index: ExprIR,
        value: ExprIR,
        #[serde(rename = "assignResultTo")]
        assign_result_to: Option<String>,
    },
    AtomicOpScalar {
        op: String,
        #[serde(rename = "symbolId")]
        symbol_id: String,
        value: ExprIR,
        #[serde(rename = "assignResultTo")]
        assign_result_to: Option<String>,
    },
    // Shader terminals
    ReturnVertex {
        position: ExprIR,
        varyings: HashMap<String, ExprIR>,
    },
    ReturnFragment {
        outputs: HashMap<String, ExprIR>,
    },
}

// ---------------------------------------------------------------------------
// Install Receipt (Rust → JS)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallReceipt {
    pub status: String,
    pub compilation_time_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub global_offset_map: Option<HashMap<String, u32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_payload_length: Option<u32>,
    pub diagnostics: Vec<CompilationDiagnostic>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompilationDiagnostic {
    pub severity: String,
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol_id: Option<String>,
    pub message: String,
}

impl InstallReceipt {
    pub fn error(diagnostics: Vec<CompilationDiagnostic>) -> Self {
        Self {
            status: "error".into(),
            compilation_time_ms: 0.0,
            global_offset_map: None,
            frame_payload_length: None,
            diagnostics,
        }
    }

    pub fn fatal(phase: &str, message: impl Into<String>) -> Self {
        Self::error(vec![CompilationDiagnostic {
            severity: "fatal".into(),
            phase: phase.into(),
            block_id: None,
            symbol_id: None,
            message: message.into(),
        }])
    }
}
