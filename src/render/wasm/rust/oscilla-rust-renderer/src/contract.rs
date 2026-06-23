//! WASM Renderer Canonical Boundary Contract — Rust mirror of boundary-contract.ts.
//!
//! [LAW:one-source-of-truth] These types are deserialized from JSON sent by JS.
//! The TS types in `boundary-contract.ts` are the authority; these must match exactly.
//!
//! [LAW:dataflow-not-control-flow] Stringly-typed contract fields force every
//! consumer to carry its own `match s.as_str() { _ => default }`. We absorb that
//! variance at the boundary by deserializing directly into Rust enums — exhaustive
//! `match` at the use site, no defensive defaults, no drift between consumers.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Contract enums — one variant per JSON tag, exhaustive
// ---------------------------------------------------------------------------

/// Color attachment load operation. `clearColor` lives next to it on `ColorTarget`.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LoadOp {
    Load,
    Clear,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StoreOp {
    #[default]
    Store,
    Discard,
}

/// Depth attachment load op with the clear value embedded in the Clear variant.
/// [LAW:one-type-per-behavior] `op + value?` collapsed into one discriminated type.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum DepthLoadOp {
    Load {
        #[serde(default)]
        store_op: StoreOp,
    },
    Clear {
        value: f32,
        #[serde(default)]
        store_op: StoreOp,
    },
}

/// Stencil attachment load op with the clear value embedded in the Clear variant.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum StencilLoadOp {
    Load {
        #[serde(default)]
        store_op: StoreOp,
    },
    Clear {
        value: u32,
        #[serde(default)]
        store_op: StoreOp,
    },
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BlendMode {
    Opaque,
    Alpha,
    Additive,
    Multiply,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CullMode {
    None,
    Front,
    Back,
}

/// Depth compare — restricted subset (less / always / equal / greater).
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DepthCompare {
    Never,
    Less,
    Equal,
    LessEqual,
    Greater,
    NotEqual,
    GreaterEqual,
    Always,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FrontFace {
    Ccw,
    Cw,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PolygonMode {
    Fill,
    Line,
    Point,
}

/// Stencil compare — full WebGPU set.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum StencilCompare {
    Always,
    Never,
    Equal,
    NotEqual,
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum StencilOp {
    Keep,
    Zero,
    Replace,
    Invert,
    IncrementClamp,
    DecrementClamp,
    IncrementWrap,
    DecrementWrap,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum TextureDimension {
    #[serde(rename = "1d")]
    D1,
    #[serde(rename = "2d")]
    D2,
    #[serde(rename = "3d")]
    D3,
    #[serde(rename = "cube")]
    Cube,
}

/// Hardware intrinsic name for `ExprIR::Intrinsic`.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum IntrinsicName {
    #[serde(rename = "global_invocation_id.x")]
    GlobalInvocationIdX,
    #[serde(rename = "global_invocation_id.y")]
    GlobalInvocationIdY,
    #[serde(rename = "global_invocation_id.z")]
    GlobalInvocationIdZ,
    #[serde(rename = "vertex_index")]
    VertexIndex,
    #[serde(rename = "instance_index")]
    InstanceIndex,
}

/// Math IR data type set — used for `Cast.targetType`, `Construct.dataType`,
/// and the optional `Var.dataType`. Mirrors `WgslTypeSchema` in TS.
#[derive(Debug, Clone, Copy, Deserialize, Hash, PartialEq, Eq)]
pub enum WgslType {
    #[serde(rename = "f32")]
    F32,
    #[serde(rename = "i32")]
    I32,
    #[serde(rename = "u32")]
    U32,
    #[serde(rename = "bool")]
    Bool,
    #[serde(rename = "vec2<f32>")]
    Vec2F32,
    #[serde(rename = "vec2<i32>")]
    Vec2I32,
    #[serde(rename = "vec2<u32>")]
    Vec2U32,
    #[serde(rename = "vec3<f32>")]
    Vec3F32,
    #[serde(rename = "vec3<i32>")]
    Vec3I32,
    #[serde(rename = "vec3<u32>")]
    Vec3U32,
    #[serde(rename = "vec4<f32>")]
    Vec4F32,
    #[serde(rename = "vec4<i32>")]
    Vec4I32,
    #[serde(rename = "vec4<u32>")]
    Vec4U32,
    #[serde(rename = "mat3x3<f32>")]
    Mat3x3F32,
    #[serde(rename = "mat4x4<f32>")]
    Mat4x4F32,
}

/// Memory data type — declared on globals, arena scalars, and domain fields.
/// Unioned across the three TS schemas; TS enforces per-location subsets.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum MemoryDataType {
    #[serde(rename = "f32")]
    F32,
    #[serde(rename = "u32")]
    U32,
    #[serde(rename = "i32")]
    I32,
    #[serde(rename = "vec2")]
    Vec2,
    #[serde(rename = "vec3")]
    Vec3,
    #[serde(rename = "vec4")]
    Vec4,
    #[serde(rename = "mat4x4")]
    Mat4x4,
    #[serde(rename = "atomic<u32>")]
    AtomicU32,
    #[serde(rename = "atomic<i32>")]
    AtomicI32,
}

impl MemoryDataType {
    /// Word count (4-byte units) occupied by this type in a flat buffer.
    pub fn word_count(self) -> u32 {
        use MemoryDataType::*;
        match self {
            F32 | U32 | I32 | AtomicU32 | AtomicI32 => 1,
            Vec2 => 2,
            Vec3 => 3,
            Vec4 => 4,
            Mat4x4 => 16,
        }
    }

    pub fn is_atomic(self) -> bool {
        matches!(self, MemoryDataType::AtomicU32 | MemoryDataType::AtomicI32)
    }

    pub fn is_f32(self) -> bool {
        matches!(self, MemoryDataType::F32)
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum BinaryOp {
    #[serde(rename = "+")] Add,
    #[serde(rename = "-")] Sub,
    #[serde(rename = "*")] Mul,
    #[serde(rename = "/")] Div,
    #[serde(rename = "%")] Mod,
    #[serde(rename = "==")] Eq,
    #[serde(rename = "!=")] Ne,
    #[serde(rename = "<")] Lt,
    #[serde(rename = ">")] Gt,
    #[serde(rename = "<=")] Le,
    #[serde(rename = ">=")] Ge,
    #[serde(rename = "&&")] And,
    #[serde(rename = "||")] Or,
    #[serde(rename = "&")] BitAnd,
    #[serde(rename = "|")] BitOr,
    #[serde(rename = "^")] BitXor,
    #[serde(rename = "<<")] Shl,
    #[serde(rename = ">>")] Shr,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum UnaryOp {
    #[serde(rename = "!")] Not,
    #[serde(rename = "-")] Neg,
    #[serde(rename = "~")] BitNot,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum AtomicOp {
    Add,
    Sub,
    Max,
    Min,
    And,
    Or,
    Xor,
    Exchange,
}

// ---------------------------------------------------------------------------
// Phase 1: Pipeline Install Payload
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineInstallPayload {
    pub manifest: MemoryManifest,
    pub roster: Vec<RosterEntry>,
    #[serde(default)]
    pub functions: Vec<WgslFunction>,
}

/// A registered WGSL function — shipped with the payload, parsed at install time.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WgslFunction {
    /// Callable name in the DSL — must match the public function in the WGSL source
    pub name: String,
    /// Complete WGSL source — may contain helper functions
    pub wgsl: String,
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
    pub data_type: MemoryDataType,
    pub is_dynamic: bool,
    pub default_value: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArenaScalarSpec {
    #[serde(rename = "type")]
    pub data_type: MemoryDataType,
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
    pub data_type: MemoryDataType,
    pub clear_value: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureSpec {
    pub dimension: TextureDimension,
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
    pub data_type: String,
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

// [LAW:one-type-per-behavior] Composite passes are Render passes with no
// depth/stencil attachment and no camera — they arrive on the wire as
// `type: 'Render'` and flow through the single Render install arm.
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
    pub sample_count: u32,
    pub targets: RenderTargets,
    pub viewport: ViewportSpec,
    pub scissor_rect: ScissorRectSpec,
    pub draw_calls: Vec<DrawCallSpec>,
}

/// Viewport in pixel coordinates. Resolved by the TS compiler from declared target dimensions.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportSpec {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub min_depth: f32,
    pub max_depth: f32,
}

/// Scissor rect in pixel coordinates. Resolved by the TS compiler from declared target dimensions.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScissorRectSpec {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
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
    pub load_op: LoadOp,
    pub clear_color: Option<[f64; 4]>,
    #[serde(default)]
    pub store_op: StoreOp,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepthStencilTarget {
    pub texture_id: String,
    pub depth: Option<DepthLoadOp>,
    pub stencil: Option<StencilLoadOp>,
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
    pub blend_mode: BlendMode,
    pub cull_mode: CullMode,
    pub depth_write: bool,
    pub depth_compare: DepthCompare,
    pub depth_bias: Option<i32>,
    pub depth_bias_slope_scale: Option<f32>,
    pub depth_bias_clamp: Option<f32>,
    pub front_face: Option<FrontFace>,
    pub polygon_mode: Option<PolygonMode>,
    pub unclipped_depth: Option<bool>,
    pub stencil_read_mask: Option<u32>,
    pub stencil_write_mask: Option<u32>,
    pub stencil_front: Option<StencilFaceState>,
    pub stencil_back: Option<StencilFaceState>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StencilFaceState {
    pub compare: StencilCompare,
    pub fail_op: StencilOp,
    pub depth_fail_op: StencilOp,
    pub pass_op: StencilOp,
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
        data_type: WgslType,
        args: Vec<ExprIR>,
    },
    Cast {
        #[serde(rename = "targetType")]
        target_type: WgslType,
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
        name: IntrinsicName,
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
        op: BinaryOp,
        left: Box<ExprIR>,
        right: Box<ExprIR>,
    },
    UnaryOp {
        op: UnaryOp,
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
        data_type: Option<WgslType>,
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
        op: AtomicOp,
        #[serde(rename = "symbolId")]
        symbol_id: String,
        index: ExprIR,
        value: ExprIR,
        #[serde(rename = "assignResultTo")]
        assign_result_to: Option<String>,
    },
    AtomicOpScalar {
        op: AtomicOp,
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
