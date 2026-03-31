//! AST Translator — converts ExprIR/StatementIR JSON AST into naga::Module.
//!
//! Each roster entry produces one naga::Module. The translator walks the AST
//! recursively, using the MMU's symbol_map to resolve symbolic references to
//! physical buffer offsets.
//!
//! Spec authority: design-docs/WASM-AST-to-Naga-Spec.md

use std::collections::HashMap;

use crate::contract::{ComputePassSpec, DrawCallSpec, ExprIR, StatementIR, SystemPassSpec};
use crate::dsl::{Expr, FnBodyBuilder, FnBuilder, ModuleBuilder};
use crate::mmu::{GpuMemoryArena, PhysicalSymbol};

// ---------------------------------------------------------------------------
// Translation context
// ---------------------------------------------------------------------------

/// Resolved buffer handles and type handles for a single pass.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TranslationStage {
    Compute,
    Vertex,
    Fragment,
}

struct PassContext {
    stage: TranslationStage,
    globals_expr: Option<Expr>,
    scalars_expr: Option<Expr>,
    /// Domain ID → standard buffer expression handle (array<u32>)
    domain_exprs: HashMap<String, Expr>,
    /// Domain ID → atomic buffer expression handle (array<atomic<u32>>)
    domain_atomic_exprs: HashMap<String, Expr>,
    /// Texture ID → global variable expression handle
    texture_exprs: HashMap<String, Expr>,
    /// Texture ID → whether this texture is sampled-class (requires mip level for textureLoad).
    texture_is_sampled: HashMap<String, bool>,
    /// Sampler ID → global variable expression handle
    sampler_exprs: HashMap<String, Expr>,
    /// Symbol ID → physical symbol from MMU
    symbol_map: HashMap<String, PhysicalSymbol>,
    /// WgslType string → naga type handle (pre-created by caller)
    type_handles: HashMap<String, naga::Handle<naga::Type>>,
}

/// Scope for variable resolution. `let_scope` holds immutable expression handles,
/// `var_scope` holds mutable variable pointers (need load_local to read).
#[derive(Clone)]
struct TranslationScope {
    let_scope: HashMap<String, Expr>,
    var_scope: HashMap<String, Expr>,
}

impl TranslationScope {
    fn new() -> Self {
        Self {
            let_scope: HashMap::new(),
            var_scope: HashMap::new(),
        }
    }

    fn from_let_scope(let_scope: HashMap<String, Expr>) -> Self {
        Self {
            let_scope,
            var_scope: HashMap::new(),
        }
    }

    fn insert_let(&mut self, name: String, expr: Expr) {
        self.let_scope.insert(name, expr);
    }

    fn insert_var(&mut self, name: String, ptr: Expr) {
        self.var_scope.insert(name, ptr);
    }

    /// Resolve a name. Returns (expr, needs_load).
    fn resolve(&self, name: &str) -> Option<(Expr, bool)> {
        if let Some(&ptr) = self.var_scope.get(name) {
            Some((ptr, true))
        } else if let Some(&expr) = self.let_scope.get(name) {
            Some((expr, false))
        } else {
            None
        }
    }
}

// ---------------------------------------------------------------------------
// Compute pass
// ---------------------------------------------------------------------------

pub struct ComputePassTranslation {
    pub module: naga::Module,
    pub info: naga::valid::ModuleInfo,
    pub bound_domain_keys: Vec<String>,
    /// Domain IDs that have atomic buffers bound (separate from standard buffers).
    pub bound_atomic_domain_keys: Vec<String>,
    pub bound_texture_keys: Vec<String>,
    pub bound_sampler_keys: Vec<String>,
    pub uses_globals: bool,
    pub uses_scalars: bool,
}

pub fn translate_compute_pass(
    spec: &ComputePassSpec,
    arena: &GpuMemoryArena,
) -> ComputePassTranslation {
    let mut m = ModuleBuilder::new();
    let f32_ty = m.f32_type();
    let u32_ty = m.u32_type();

    let uses_globals = ast_uses_globals(&spec.ast);
    let uses_scalars = ast_uses_scalars(&spec.ast);

    // Group 0: Only declare buffers the AST actually uses.
    // Binding indices are sequential for existing buffers.
    let mut group0_binding = 0u32;
    let globals_gv = if uses_globals {
        let arr_ty = m.array_type(f32_ty, None, 4);
        let gv = m.add_global_storage(
            "globals",
            arr_ty,
            0,
            group0_binding,
            naga::StorageAccess::LOAD,
        );
        group0_binding += 1;
        Some(gv)
    } else {
        None
    };
    let scalars_gv = if uses_scalars {
        let arr_ty = m.array_type(u32_ty, None, 4);
        let gv = m.add_global_storage(
            "scalars",
            arr_ty,
            0,
            group0_binding,
            naga::StorageAccess::LOAD | naga::StorageAccess::STORE,
        );
        Some(gv)
    } else {
        None
    };

    // Group 1: Only declare domains actually referenced by the AST
    // (unused globals get stripped by naga → auto-layout mismatch)
    let referenced = collect_domains_from_stmts_set(&spec.ast, arena);
    let mut domain_keys: Vec<_> = spec
        .dependencies
        .domains
        .keys()
        .filter(|k| referenced.contains(*k))
        .collect();
    domain_keys.sort();
    let mut domain_gvs = HashMap::new();
    for (binding_idx, domain_id) in domain_keys.iter().enumerate() {
        let access_str = &spec.dependencies.domains[*domain_id];
        let access = if access_str == "read" {
            naga::StorageAccess::LOAD
        } else {
            naga::StorageAccess::LOAD | naga::StorageAccess::STORE
        };
        let domain_arr_ty = m.array_type(u32_ty, None, 4);
        let gv = m.add_global_storage(domain_id, domain_arr_ty, 1, binding_idx as u32, access);
        domain_gvs.insert((*domain_id).clone(), gv);
    }

    // Group 1 continued: Atomic domain buffers (same domain keys, separate bindings)
    let mut group1_binding = domain_keys.len() as u32;
    let mut domain_atomic_gvs = HashMap::new();
    for domain_id in &domain_keys {
        // Check if this domain has any atomic fields
        let has_atomics = arena.domain_atomic_buffers.contains_key(*domain_id);
        if has_atomics {
            let atomic_arr_ty = m.atomic_type(naga::ScalarKind::Uint);
            let atomic_array_ty = m.array_type(atomic_arr_ty, None, 4);
            let access_str = &spec.dependencies.domains[*domain_id];
            let access = if access_str == "read" {
                naga::StorageAccess::LOAD
            } else {
                naga::StorageAccess::LOAD | naga::StorageAccess::STORE
            };
            let gv = m.add_global_storage(
                &format!("{}_atomic", domain_id),
                atomic_array_ty,
                1,
                group1_binding,
                access,
            );
            domain_atomic_gvs.insert((*domain_id).clone(), gv);
            group1_binding += 1;
        }
    }

    // Group 1 continued: Textures (sorted alpha, after domains + atomics)
    let referenced_textures = collect_textures_from_stmts_set(&spec.ast);
    let mut texture_gvs = HashMap::new();
    let mut tex_keys: Vec<_> = spec
        .dependencies
        .textures
        .keys()
        .filter(|k| referenced_textures.contains(*k))
        .collect();
    tex_keys.sort();
    let mut texture_is_sampled = HashMap::new();
    for texture_id in &tex_keys {
        let access_str = &spec.dependencies.textures[*texture_id];
        let tex_info = arena.textures.get(*texture_id);
        let format = tex_info
            .map(|t| t.format)
            .unwrap_or(wgpu::TextureFormat::Rgba8Unorm);
        let dim = tex_info
            .map(|t| t.dimension)
            .unwrap_or(wgpu::TextureViewDimension::D2);
        let naga_dim = match dim {
            wgpu::TextureViewDimension::D1 => naga::ImageDimension::D1,
            wgpu::TextureViewDimension::D3 => naga::ImageDimension::D3,
            _ => naga::ImageDimension::D2,
        };
        let is_sampled = matches!(access_str.as_str(), "read" | "sampled");
        let class = match access_str.as_str() {
            "read" | "sampled" => naga::ImageClass::Sampled {
                kind: naga::ScalarKind::Float,
                multi: false,
            },
            _ => naga::ImageClass::Storage {
                format: wgpu_format_to_naga(format),
                access: if access_str == "read_write" {
                    naga::StorageAccess::LOAD | naga::StorageAccess::STORE
                } else {
                    naga::StorageAccess::STORE
                },
            },
        };
        let img_ty = m.image_type(naga_dim, false, class);
        let gv = m.add_global_handle(*texture_id, img_ty, 1, group1_binding);
        texture_gvs.insert((*texture_id).clone(), gv);
        texture_is_sampled.insert((*texture_id).clone(), is_sampled);
        group1_binding += 1;
    }

    // Group 1 continued: Samplers (sorted alpha, after textures)
    // For compute passes, samplers are rare but possible (texture_sample_level in compute)
    let mut sampler_gvs: HashMap<String, naga::Handle<naga::GlobalVariable>> = HashMap::new();
    let sampler_ty = m.sampler_type(false);
    let mut sampler_keys: Vec<String> = collect_samplers_from_stmts_set(&spec.ast)
        .into_iter()
        .collect();
    sampler_keys.sort();
    for sampler_id in &sampler_keys {
        let gv = m.add_global_handle(sampler_id, sampler_ty, 1, group1_binding);
        sampler_gvs.insert(sampler_id.clone(), gv);
        group1_binding += 1;
    }

    let vec3_u32_ty = m.vector_type(naga::VectorSize::Tri, naga::ScalarKind::Uint);

    let mut fb = FnBuilder::new("main");

    let gid_arg = fb.add_argument(
        "gid",
        vec3_u32_ty,
        Some(naga::Binding::BuiltIn(naga::BuiltIn::GlobalInvocationId)),
    );

    // Resolve global variable expressions
    let globals_expr = globals_gv.map(|gv| fb.global(gv));
    let scalars_expr = scalars_gv.map(|gv| fb.global(gv));
    let mut domain_exprs = HashMap::new();
    for (domain_id, gv) in &domain_gvs {
        domain_exprs.insert(domain_id.clone(), fb.global(*gv));
    }
    let mut domain_atomic_exprs = HashMap::new();
    for (domain_id, gv) in &domain_atomic_gvs {
        domain_atomic_exprs.insert(domain_id.clone(), fb.global(*gv));
    }
    let mut texture_exprs = HashMap::new();
    for (tex_id, gv) in &texture_gvs {
        texture_exprs.insert(tex_id.clone(), fb.global(*gv));
    }
    let mut sampler_exprs = HashMap::new();
    for (samp_id, gv) in &sampler_gvs {
        sampler_exprs.insert(samp_id.clone(), fb.global(*gv));
    }

    let mut type_handles = HashMap::new();
    type_handles.insert("f32".into(), m.f32_type());
    type_handles.insert("u32".into(), m.u32_type());
    type_handles.insert("i32".into(), m.i32_type());
    type_handles.insert(
        "vec2<f32>".into(),
        m.vector_type(naga::VectorSize::Bi, naga::ScalarKind::Float),
    );
    type_handles.insert(
        "vec2<i32>".into(),
        m.vector_type(naga::VectorSize::Bi, naga::ScalarKind::Sint),
    );
    type_handles.insert(
        "vec2<u32>".into(),
        m.vector_type(naga::VectorSize::Bi, naga::ScalarKind::Uint),
    );
    type_handles.insert(
        "vec3<f32>".into(),
        m.vector_type(naga::VectorSize::Tri, naga::ScalarKind::Float),
    );
    type_handles.insert("vec3<u32>".into(), vec3_u32_ty);
    type_handles.insert("vec4<f32>".into(), m.vec4_f32_type());

    let ctx = PassContext {
        stage: TranslationStage::Compute,
        globals_expr,
        scalars_expr,
        domain_exprs,
        domain_atomic_exprs,
        symbol_map: arena.symbol_map.clone(),
        type_handles,
        texture_exprs,
        texture_is_sampled,
        sampler_exprs,
    };

    // Register global_invocation_id in scope so Intrinsic expressions can resolve it
    let mut scope = TranslationScope::new();
    scope.insert_let("__gid".into(), gid_arg);
    translate_statements(&mut fb, &ctx, &spec.ast, &mut scope);

    m.add_compute_entry("main", spec.workgroup_size, fb);

    let bound_domain_keys = domain_keys.into_iter().cloned().collect();
    let bound_texture_keys: Vec<String> = tex_keys.into_iter().cloned().collect();
    let bound_sampler_keys = sampler_keys;
    let (module, info) = validate_module(m.finish());
    let bound_atomic_domain_keys: Vec<String> = domain_atomic_gvs.keys().cloned().collect();
    ComputePassTranslation {
        module,
        info,
        bound_domain_keys,
        bound_atomic_domain_keys,
        bound_texture_keys,
        bound_sampler_keys,
        uses_globals,
        uses_scalars,
    }
}

// ---------------------------------------------------------------------------
// System_DrawPrep
// ---------------------------------------------------------------------------

pub fn translate_draw_prep(
    spec: &SystemPassSpec,
    arena: &GpuMemoryArena,
) -> (naga::Module, naga::valid::ModuleInfo) {
    let mut m = ModuleBuilder::new();
    let u32_ty = m.u32_type();
    let scalars_arr_ty = m.array_type(u32_ty, None, 4);
    let indirect_arr_ty = m.array_type(u32_ty, None, 4);

    // Group 0: scalars (read) + indirect (read_write)
    let scalars_gv =
        m.add_global_storage("scalars", scalars_arr_ty, 0, 0, naga::StorageAccess::LOAD);
    let indirect_gv = m.add_global_storage(
        "indirect",
        indirect_arr_ty,
        0,
        1,
        naga::StorageAccess::LOAD | naga::StorageAccess::STORE,
    );

    let mut fb = FnBuilder::new("draw_prep");

    let scalars = fb.global(scalars_gv);
    let indirect = fb.global(indirect_gv);

    // indirect[0] = vertexCount (hardcoded from spec)
    let vertex_count = fb.lit_u32(spec.vertex_count);
    let idx0 = fb.lit_u32(0);
    fb.store_buffer(indirect, idx0, vertex_count);

    // indirect[1] = scalars[active_lanes_offset]
    let active_sym = arena
        .symbol_map
        .get(&spec.active_lanes_symbol)
        .unwrap_or_else(|| {
            panic!(
                "draw_prep: activeLanesSymbol '{}' not found in symbol_map",
                spec.active_lanes_symbol
            )
        });
    let active_offset = fb.lit_u32(active_sym.word_offset);
    let instance_count = fb.load_buffer(scalars, active_offset);
    let idx1 = fb.lit_u32(1);
    fb.store_buffer(indirect, idx1, instance_count);

    // indirect[2] = 0 (firstVertex)
    let idx2 = fb.lit_u32(2);
    let zero = fb.lit_u32(0);
    fb.store_buffer(indirect, idx2, zero);

    // indirect[3] = 0 (firstInstance)
    let idx3 = fb.lit_u32(3);
    let zero2 = fb.lit_u32(0);
    fb.store_buffer(indirect, idx3, zero2);

    m.add_compute_entry("draw_prep", [1, 1, 1], fb);

    validate_module(m.finish())
}

// ---------------------------------------------------------------------------
// Render pass (vertex + fragment)
// ---------------------------------------------------------------------------

/// Check if AST references LoadGlobal anywhere.
fn ast_uses_globals(stmts: &[StatementIR]) -> bool {
    stmts.iter().any(|s| stmt_uses_globals(s))
}

fn stmt_uses_globals(stmt: &StatementIR) -> bool {
    match stmt {
        StatementIR::Let { value, .. } => expr_uses_globals(value),
        StatementIR::StoreField { index, value, .. } => {
            expr_uses_globals(index) || expr_uses_globals(value)
        }
        StatementIR::StoreScalar { value, .. } => expr_uses_globals(value),
        StatementIR::Var { value, .. } => value.as_ref().map_or(false, |v| expr_uses_globals(v)),
        StatementIR::Assign { target, value } => {
            expr_uses_globals(target) || expr_uses_globals(value)
        }
        StatementIR::If {
            condition,
            accept,
            reject,
        } => expr_uses_globals(condition) || ast_uses_globals(accept) || ast_uses_globals(reject),
        StatementIR::For {
            init,
            condition,
            update,
            body,
        } => {
            stmt_uses_globals(init)
                || expr_uses_globals(condition)
                || stmt_uses_globals(update)
                || ast_uses_globals(body)
        }
        StatementIR::ReturnVertex { position, varyings } => {
            expr_uses_globals(position) || varyings.values().any(|v| expr_uses_globals(v))
        }
        StatementIR::ReturnFragment { outputs } => outputs.values().any(|v| expr_uses_globals(v)),
        _ => false,
    }
}

fn expr_uses_globals(expr: &ExprIR) -> bool {
    match expr {
        ExprIR::LoadGlobal { .. } => true,
        ExprIR::BinaryOp { left, right, .. } => expr_uses_globals(left) || expr_uses_globals(right),
        ExprIR::UnaryOp { expr: inner, .. } | ExprIR::Cast { expr: inner, .. } => {
            expr_uses_globals(inner)
        }
        ExprIR::CallBuiltin { args, .. } | ExprIR::Construct { args, .. } => {
            args.iter().any(|a| expr_uses_globals(a))
        }
        ExprIR::Swizzle { source, .. } => expr_uses_globals(source),
        ExprIR::LoadField { index, .. } => expr_uses_globals(index),
        ExprIR::IndexAccess { target, index } => {
            expr_uses_globals(target) || expr_uses_globals(index)
        }
        _ => false,
    }
}

/// Check if AST references StoreScalar or LoadScalar anywhere.
fn ast_uses_scalars(stmts: &[StatementIR]) -> bool {
    stmts.iter().any(|s| stmt_uses_scalars(s))
}

fn stmt_uses_scalars(stmt: &StatementIR) -> bool {
    match stmt {
        StatementIR::StoreScalar { .. } => true,
        StatementIR::Let { value, .. } => expr_uses_scalars(value),
        StatementIR::StoreField { index, value, .. } => {
            expr_uses_scalars(index) || expr_uses_scalars(value)
        }
        StatementIR::If {
            condition,
            accept,
            reject,
        } => expr_uses_scalars(condition) || ast_uses_scalars(accept) || ast_uses_scalars(reject),
        StatementIR::For {
            init,
            condition,
            update,
            body,
        } => {
            stmt_uses_scalars(init)
                || expr_uses_scalars(condition)
                || stmt_uses_scalars(update)
                || ast_uses_scalars(body)
        }
        _ => false,
    }
}

fn expr_uses_scalars(expr: &ExprIR) -> bool {
    match expr {
        ExprIR::LoadScalar { .. } => true,
        ExprIR::BinaryOp { left, right, .. } => expr_uses_scalars(left) || expr_uses_scalars(right),
        ExprIR::UnaryOp { expr: inner, .. } | ExprIR::Cast { expr: inner, .. } => {
            expr_uses_scalars(inner)
        }
        ExprIR::CallBuiltin { args, .. } | ExprIR::Construct { args, .. } => {
            args.iter().any(|a| expr_uses_scalars(a))
        }
        _ => false,
    }
}

fn collect_domains_from_stmts_set(
    stmts: &[StatementIR],
    arena: &GpuMemoryArena,
) -> std::collections::HashSet<String> {
    let mut domains = std::collections::HashSet::new();
    collect_domains_from_stmts(stmts, arena, &mut domains);
    domains
}

/// Collect domain IDs actually referenced by LoadField/StoreField in the ASTs.
fn collect_referenced_domains(
    vertex_ast: &[StatementIR],
    fragment_ast: &[StatementIR],
    arena: &GpuMemoryArena,
) -> std::collections::HashSet<String> {
    let mut domains = std::collections::HashSet::new();
    let mut collect_from_stmts = |stmts: &[StatementIR]| {
        collect_domains_from_stmts(stmts, arena, &mut domains);
    };
    collect_from_stmts(vertex_ast);
    collect_from_stmts(fragment_ast);
    domains
}

fn collect_domains_from_stmts(
    stmts: &[StatementIR],
    arena: &GpuMemoryArena,
    out: &mut std::collections::HashSet<String>,
) {
    for stmt in stmts {
        collect_domains_from_stmt(stmt, arena, out);
    }
}

fn collect_domains_from_stmt(
    stmt: &StatementIR,
    arena: &GpuMemoryArena,
    out: &mut std::collections::HashSet<String>,
) {
    match stmt {
        StatementIR::Let { value, .. } => collect_domains_from_expr(value, arena, out),
        StatementIR::Var { value, .. } => {
            if let Some(value) = value {
                collect_domains_from_expr(value, arena, out);
            }
        }
        StatementIR::Assign { target, value } => {
            collect_domains_from_expr(target, arena, out);
            collect_domains_from_expr(value, arena, out);
        }
        StatementIR::StoreScalar { value, .. } => collect_domains_from_expr(value, arena, out),
        StatementIR::StoreField {
            symbol_id,
            index,
            value,
            ..
        } => {
            if let Some(sym) = arena.symbol_map.get(symbol_id) {
                if let Some(ref d) = sym.domain_id {
                    out.insert(d.clone());
                }
            }
            collect_domains_from_expr(index, arena, out);
            collect_domains_from_expr(value, arena, out);
        }
        StatementIR::TextureStore { coords, value, .. } => {
            collect_domains_from_expr(coords, arena, out);
            collect_domains_from_expr(value, arena, out);
        }
        StatementIR::ReturnVertex { position, varyings } => {
            collect_domains_from_expr(position, arena, out);
            for v in varyings.values() {
                collect_domains_from_expr(v, arena, out);
            }
        }
        StatementIR::ReturnFragment { outputs } => {
            for v in outputs.values() {
                collect_domains_from_expr(v, arena, out);
            }
        }
        StatementIR::If {
            condition,
            accept,
            reject,
        } => {
            collect_domains_from_expr(condition, arena, out);
            collect_domains_from_stmts(accept, arena, out);
            collect_domains_from_stmts(reject, arena, out);
        }
        StatementIR::For {
            init,
            condition,
            update,
            body,
        } => {
            collect_domains_from_stmt(init, arena, out);
            collect_domains_from_expr(condition, arena, out);
            collect_domains_from_stmt(update, arena, out);
            collect_domains_from_stmts(body, arena, out);
        }
        StatementIR::AtomicOpField {
            symbol_id,
            index,
            value,
            ..
        } => {
            if let Some(sym) = arena.symbol_map.get(symbol_id) {
                if let Some(ref d) = sym.domain_id {
                    out.insert(d.clone());
                }
            }
            collect_domains_from_expr(index, arena, out);
            collect_domains_from_expr(value, arena, out);
        }
        StatementIR::AtomicOpScalar { value, .. } => collect_domains_from_expr(value, arena, out),
        StatementIR::Break | StatementIR::Continue => {}
    }
}

fn collect_domains_from_expr(
    expr: &ExprIR,
    arena: &GpuMemoryArena,
    out: &mut std::collections::HashSet<String>,
) {
    match expr {
        ExprIR::LoadField { symbol_id, index } => {
            if let Some(sym) = arena.symbol_map.get(symbol_id) {
                if let Some(ref d) = sym.domain_id {
                    out.insert(d.clone());
                }
            }
            collect_domains_from_expr(index, arena, out);
        }
        ExprIR::BinaryOp { left, right, .. } => {
            collect_domains_from_expr(left, arena, out);
            collect_domains_from_expr(right, arena, out);
        }
        ExprIR::UnaryOp { expr: inner, .. } | ExprIR::Cast { expr: inner, .. } => {
            collect_domains_from_expr(inner, arena, out);
        }
        ExprIR::CallBuiltin { args, .. } | ExprIR::Construct { args, .. } => {
            for a in args {
                collect_domains_from_expr(a, arena, out);
            }
        }
        ExprIR::Swizzle { source, .. } => collect_domains_from_expr(source, arena, out),
        ExprIR::IndexAccess { target, index } => {
            collect_domains_from_expr(target, arena, out);
            collect_domains_from_expr(index, arena, out);
        }
        ExprIR::TextureSample { uv, .. } => collect_domains_from_expr(uv, arena, out),
        ExprIR::TextureLoad { coords, .. } => collect_domains_from_expr(coords, arena, out),
        ExprIR::AtomicLoadField { symbol_id, index } => {
            if let Some(sym) = arena.symbol_map.get(symbol_id) {
                if let Some(ref d) = sym.domain_id {
                    out.insert(d.clone());
                }
            }
            collect_domains_from_expr(index, arena, out);
        }
        _ => {}
    }
}

fn collect_textures_from_stmts_set(stmts: &[StatementIR]) -> std::collections::HashSet<String> {
    let mut textures = std::collections::HashSet::new();
    collect_textures_from_stmts(stmts, &mut textures);
    textures
}

fn collect_textures_from_stmts(stmts: &[StatementIR], out: &mut std::collections::HashSet<String>) {
    for stmt in stmts {
        collect_textures_from_stmt(stmt, out);
    }
}

fn collect_textures_from_stmt(stmt: &StatementIR, out: &mut std::collections::HashSet<String>) {
    match stmt {
        StatementIR::Let { value, .. } => collect_textures_from_expr(value, out),
        StatementIR::Var { value, .. } => {
            if let Some(value) = value {
                collect_textures_from_expr(value, out);
            }
        }
        StatementIR::Assign { target, value } => {
            collect_textures_from_expr(target, out);
            collect_textures_from_expr(value, out);
        }
        StatementIR::StoreScalar { value, .. } => collect_textures_from_expr(value, out),
        StatementIR::StoreField { index, value, .. } => {
            collect_textures_from_expr(index, out);
            collect_textures_from_expr(value, out);
        }
        StatementIR::TextureStore {
            texture_id,
            coords,
            value,
        } => {
            out.insert(texture_id.clone());
            collect_textures_from_expr(coords, out);
            collect_textures_from_expr(value, out);
        }
        StatementIR::If {
            condition,
            accept,
            reject,
        } => {
            collect_textures_from_expr(condition, out);
            collect_textures_from_stmts(accept, out);
            collect_textures_from_stmts(reject, out);
        }
        StatementIR::For {
            init,
            condition,
            update,
            body,
        } => {
            collect_textures_from_stmt(init, out);
            collect_textures_from_expr(condition, out);
            collect_textures_from_stmt(update, out);
            collect_textures_from_stmts(body, out);
        }
        StatementIR::AtomicOpField { index, value, .. } => {
            collect_textures_from_expr(index, out);
            collect_textures_from_expr(value, out);
        }
        StatementIR::AtomicOpScalar { value, .. } => collect_textures_from_expr(value, out),
        StatementIR::ReturnVertex { position, varyings } => {
            collect_textures_from_expr(position, out);
            for v in varyings.values() {
                collect_textures_from_expr(v, out);
            }
        }
        StatementIR::ReturnFragment { outputs } => {
            for v in outputs.values() {
                collect_textures_from_expr(v, out);
            }
        }
        StatementIR::Break | StatementIR::Continue => {}
    }
}

fn collect_textures_from_expr(expr: &ExprIR, out: &mut std::collections::HashSet<String>) {
    match expr {
        ExprIR::TextureSample { texture_id, uv, .. } => {
            out.insert(texture_id.clone());
            collect_textures_from_expr(uv, out);
        }
        ExprIR::TextureLoad { texture_id, coords } => {
            out.insert(texture_id.clone());
            collect_textures_from_expr(coords, out);
        }
        ExprIR::BinaryOp { left, right, .. } => {
            collect_textures_from_expr(left, out);
            collect_textures_from_expr(right, out);
        }
        ExprIR::UnaryOp { expr: inner, .. } | ExprIR::Cast { expr: inner, .. } => {
            collect_textures_from_expr(inner, out);
        }
        ExprIR::CallBuiltin { args, .. } | ExprIR::Construct { args, .. } => {
            for arg in args {
                collect_textures_from_expr(arg, out);
            }
        }
        ExprIR::Swizzle { source, .. } => collect_textures_from_expr(source, out),
        ExprIR::IndexAccess { target, index } => {
            collect_textures_from_expr(target, out);
            collect_textures_from_expr(index, out);
        }
        ExprIR::LoadField { index, .. } | ExprIR::AtomicLoadField { index, .. } => {
            collect_textures_from_expr(index, out);
        }
        _ => {}
    }
}

fn collect_samplers_from_stmts_set(stmts: &[StatementIR]) -> std::collections::HashSet<String> {
    let mut samplers = std::collections::HashSet::new();
    collect_samplers_from_stmts(stmts, &mut samplers);
    samplers
}

fn collect_samplers_from_stmts(stmts: &[StatementIR], out: &mut std::collections::HashSet<String>) {
    for stmt in stmts {
        collect_samplers_from_stmt(stmt, out);
    }
}

fn collect_samplers_from_stmt(stmt: &StatementIR, out: &mut std::collections::HashSet<String>) {
    match stmt {
        StatementIR::Let { value, .. } => collect_samplers_from_expr(value, out),
        StatementIR::Var { value, .. } => {
            if let Some(value) = value {
                collect_samplers_from_expr(value, out);
            }
        }
        StatementIR::Assign { target, value } => {
            collect_samplers_from_expr(target, out);
            collect_samplers_from_expr(value, out);
        }
        StatementIR::StoreScalar { value, .. } => collect_samplers_from_expr(value, out),
        StatementIR::StoreField { index, value, .. } => {
            collect_samplers_from_expr(index, out);
            collect_samplers_from_expr(value, out);
        }
        StatementIR::TextureStore { coords, value, .. } => {
            collect_samplers_from_expr(coords, out);
            collect_samplers_from_expr(value, out);
        }
        StatementIR::If {
            condition,
            accept,
            reject,
        } => {
            collect_samplers_from_expr(condition, out);
            collect_samplers_from_stmts(accept, out);
            collect_samplers_from_stmts(reject, out);
        }
        StatementIR::For {
            init,
            condition,
            update,
            body,
        } => {
            collect_samplers_from_stmt(init, out);
            collect_samplers_from_expr(condition, out);
            collect_samplers_from_stmt(update, out);
            collect_samplers_from_stmts(body, out);
        }
        StatementIR::AtomicOpField { index, value, .. } => {
            collect_samplers_from_expr(index, out);
            collect_samplers_from_expr(value, out);
        }
        StatementIR::AtomicOpScalar { value, .. } => collect_samplers_from_expr(value, out),
        StatementIR::ReturnVertex { position, varyings } => {
            collect_samplers_from_expr(position, out);
            for v in varyings.values() {
                collect_samplers_from_expr(v, out);
            }
        }
        StatementIR::ReturnFragment { outputs } => {
            for v in outputs.values() {
                collect_samplers_from_expr(v, out);
            }
        }
        StatementIR::Break | StatementIR::Continue => {}
    }
}

fn collect_samplers_from_expr(expr: &ExprIR, out: &mut std::collections::HashSet<String>) {
    match expr {
        ExprIR::TextureSample { sampler_id, uv, .. } => {
            out.insert(sampler_id.clone());
            collect_samplers_from_expr(uv, out);
        }
        ExprIR::TextureLoad { coords, .. } => collect_samplers_from_expr(coords, out),
        ExprIR::BinaryOp { left, right, .. } => {
            collect_samplers_from_expr(left, out);
            collect_samplers_from_expr(right, out);
        }
        ExprIR::UnaryOp { expr: inner, .. } | ExprIR::Cast { expr: inner, .. } => {
            collect_samplers_from_expr(inner, out);
        }
        ExprIR::CallBuiltin { args, .. } | ExprIR::Construct { args, .. } => {
            for arg in args {
                collect_samplers_from_expr(arg, out);
            }
        }
        ExprIR::Swizzle { source, .. } => collect_samplers_from_expr(source, out),
        ExprIR::IndexAccess { target, index } => {
            collect_samplers_from_expr(target, out);
            collect_samplers_from_expr(index, out);
        }
        ExprIR::LoadField { index, .. } | ExprIR::AtomicLoadField { index, .. } => {
            collect_samplers_from_expr(index, out);
        }
        _ => {}
    }
}

/// Extract varying keys from vertexAst (sorted alphabetically).
fn extract_varying_keys(stmts: &[StatementIR]) -> Vec<String> {
    for stmt in stmts {
        if let StatementIR::ReturnVertex { varyings, .. } = stmt {
            let mut keys: Vec<String> = varyings.keys().cloned().collect();
            keys.sort();
            return keys;
        }
    }
    Vec::new()
}

/// Result of render pass translation, including which domains were actually bound.
pub struct RenderPassTranslation {
    pub module: naga::Module,
    pub info: naga::valid::ModuleInfo,
    pub bound_domain_keys: Vec<String>,
    pub bound_atomic_domain_keys: Vec<String>,
    pub bound_texture_keys: Vec<String>,
    pub bound_sampler_keys: Vec<String>,
}

pub fn translate_render_pass(
    draw_call: &DrawCallSpec,
    arena: &GpuMemoryArena,
) -> RenderPassTranslation {
    let mut m = ModuleBuilder::new();
    let f32_ty = m.f32_type();
    let u32_ty = m.u32_type();
    let vec2_f32_ty = m.vector_type(naga::VectorSize::Bi, naga::ScalarKind::Float);
    let vec4_f32_ty = m.vec4_f32_type();

    // Scan vertexAst for ReturnVertex to extract varying keys (sorted alpha)
    let varying_keys = extract_varying_keys(&draw_call.vertex_ast);
    let has_varyings = !varying_keys.is_empty();

    // Build inter-stage structs if varyings present.
    // Vertex output struct has @builtin(position) + @location varyings.
    // Fragment input struct has ONLY @location varyings (no position builtin).
    let (vs_output_ty, fs_input_ty) = if has_varyings {
        let mut vs_members = vec![naga::StructMember {
            name: Some("position".into()),
            ty: vec4_f32_ty,
            binding: Some(naga::Binding::BuiltIn(naga::BuiltIn::Position {
                invariant: false,
            })),
            offset: 0,
        }];
        let mut fs_members = Vec::new();
        for (i, key) in varying_keys.iter().enumerate() {
            let loc_binding = naga::Binding::Location {
                location: i as u32,
                blend_src: None,
                per_primitive: false,
                interpolation: Some(naga::Interpolation::Perspective),
                sampling: Some(naga::Sampling::Center),
            };
            vs_members.push(naga::StructMember {
                name: Some(key.clone()),
                ty: vec4_f32_ty,
                binding: Some(loc_binding.clone()),
                offset: ((i + 1) * 16) as u32,
            });
            fs_members.push(naga::StructMember {
                name: Some(key.clone()),
                ty: vec4_f32_ty,
                binding: Some(naga::Binding::Location {
                    location: i as u32,
                    blend_src: None,
                    per_primitive: false,
                    interpolation: Some(naga::Interpolation::Perspective),
                    sampling: Some(naga::Sampling::Center),
                }),
                offset: (i * 16) as u32,
            });
        }
        (
            Some(m.struct_type("VsOutput", vs_members)),
            Some(m.struct_type("FsInput", fs_members)),
        )
    } else {
        (None, None)
    };

    // Group 0: domains + textures (only those actually referenced by ASTs)
    let referenced_domains =
        collect_referenced_domains(&draw_call.vertex_ast, &draw_call.fragment_ast, arena);
    let mut domain_keys: Vec<_> = referenced_domains.iter().collect();
    domain_keys.sort();
    let mut group0_binding = 0u32;
    let mut domain_gvs = HashMap::new();
    for domain_id in &domain_keys {
        let domain_arr_ty = m.array_type(u32_ty, None, 4);
        let gv = m.add_global_storage(
            domain_id,
            domain_arr_ty,
            0,
            group0_binding,
            naga::StorageAccess::LOAD,
        );
        domain_gvs.insert((*domain_id).clone(), gv);
        group0_binding += 1;
    }

    // Note: Atomic domain buffers are NOT declared in render passes because
    // WebGPU vertex/fragment stages don't support read_write storage (required for atomics).
    // Compute passes copy atomic values to standard fields for render consumption.
    let render_atomic_gvs: HashMap<String, naga::Handle<naga::GlobalVariable>> = HashMap::new();

    // Group 0 continued: Textures (sorted alpha)
    let referenced_textures = collect_textures_from_stmts_set(&draw_call.vertex_ast)
        .into_iter()
        .chain(collect_textures_from_stmts_set(&draw_call.fragment_ast))
        .collect::<std::collections::HashSet<_>>();
    let mut render_texture_gvs = HashMap::new();
    let mut render_tex_keys: Vec<_> = draw_call
        .dependencies
        .textures
        .keys()
        .filter(|k| referenced_textures.contains(*k))
        .collect();
    render_tex_keys.sort();
    let mut texture_is_sampled = HashMap::new();
    for texture_id in &render_tex_keys {
        let access_str = &draw_call.dependencies.textures[*texture_id];
        let tex_info = arena.textures.get(*texture_id);
        let format = tex_info
            .map(|t| t.format)
            .unwrap_or(wgpu::TextureFormat::Rgba8Unorm);
        let dim = tex_info
            .map(|t| t.dimension)
            .unwrap_or(wgpu::TextureViewDimension::D2);
        let naga_dim = match dim {
            wgpu::TextureViewDimension::D1 => naga::ImageDimension::D1,
            wgpu::TextureViewDimension::D3 => naga::ImageDimension::D3,
            _ => naga::ImageDimension::D2,
        };
        let is_sampled = access_str == "sampled";
        let class = match access_str.as_str() {
            "sampled" => naga::ImageClass::Sampled {
                kind: naga::ScalarKind::Float,
                multi: false,
            },
            _ => naga::ImageClass::Storage {
                format: wgpu_format_to_naga(format),
                access: naga::StorageAccess::LOAD,
            },
        };
        let img_ty = m.image_type(naga_dim, false, class);
        let gv = m.add_global_handle(*texture_id, img_ty, 0, group0_binding);
        render_texture_gvs.insert((*texture_id).clone(), gv);
        texture_is_sampled.insert((*texture_id).clone(), is_sampled);
        group0_binding += 1;
    }
    let mut render_sampler_gvs = HashMap::new();
    let mut render_sampler_keys: Vec<String> =
        collect_samplers_from_stmts_set(&draw_call.vertex_ast)
            .into_iter()
            .chain(collect_samplers_from_stmts_set(&draw_call.fragment_ast))
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
    render_sampler_keys.sort();
    let sampler_ty = m.sampler_type(false);
    for sampler_id in &render_sampler_keys {
        let gv = m.add_global_handle(sampler_id, sampler_ty, 0, group0_binding);
        render_sampler_gvs.insert(sampler_id.clone(), gv);
        group0_binding += 1;
    }

    let type_handles = {
        let mut th = HashMap::new();
        th.insert("f32".into(), f32_ty);
        th.insert("u32".into(), u32_ty);
        th.insert("i32".into(), m.i32_type());
        th.insert("vec2<f32>".into(), vec2_f32_ty);
        th.insert(
            "vec2<i32>".into(),
            m.vector_type(naga::VectorSize::Bi, naga::ScalarKind::Sint),
        );
        th.insert("vec4<f32>".into(), vec4_f32_ty);
        th
    };

    // --- Vertex shader ---
    let mut vs = FnBuilder::new("vs_main");
    if let Some(struct_ty) = vs_output_ty {
        vs.set_result(struct_ty, None);
    } else {
        vs.set_result(
            vec4_f32_ty,
            Some(naga::Binding::BuiltIn(naga::BuiltIn::Position {
                invariant: false,
            })),
        );
    }

    let position_arg = vs.add_argument(
        "position",
        vec2_f32_ty,
        Some(naga::Binding::Location {
            location: 0,
            blend_src: None,
            per_primitive: false,
            interpolation: Some(naga::Interpolation::Perspective),
            sampling: Some(naga::Sampling::Center),
        }),
    );
    let instance_index_arg = vs.add_argument(
        "instance_index",
        u32_ty,
        Some(naga::Binding::BuiltIn(naga::BuiltIn::InstanceIndex)),
    );
    let vertex_index_arg = vs.add_argument(
        "vertex_index",
        u32_ty,
        Some(naga::Binding::BuiltIn(naga::BuiltIn::VertexIndex)),
    );

    let mut vs_scope = TranslationScope::new();
    vs_scope.insert_let("position".into(), position_arg);
    vs_scope.insert_let("__instance_index".into(), instance_index_arg);
    vs_scope.insert_let("__vertex_index".into(), vertex_index_arg);

    let mut vs_domain_exprs = HashMap::new();
    for (domain_id, gv) in &domain_gvs {
        vs_domain_exprs.insert(domain_id.clone(), vs.global(*gv));
    }
    let mut vs_domain_atomic_exprs = HashMap::new();
    for (domain_id, gv) in &render_atomic_gvs {
        vs_domain_atomic_exprs.insert(domain_id.clone(), vs.global(*gv));
    }
    let vs_ctx = PassContext {
        stage: TranslationStage::Vertex,
        globals_expr: None,
        scalars_expr: None,
        domain_exprs: vs_domain_exprs,
        domain_atomic_exprs: vs_domain_atomic_exprs,
        symbol_map: arena.symbol_map.clone(),
        type_handles: type_handles.clone(),
        texture_exprs: HashMap::new(),
        texture_is_sampled: HashMap::new(),
        sampler_exprs: HashMap::new(),
    };

    // Translate vertex body — handle ReturnVertex with varyings
    vs.with_root(|bb| {
        for stmt in &draw_call.vertex_ast {
            match stmt {
                StatementIR::ReturnVertex { position, varyings } => {
                    let pos = translate_expr_body(bb, &vs_ctx, position, &vs_scope);
                    if let Some(struct_ty) = vs_output_ty {
                        let mut components = vec![pos];
                        for key in &varying_keys {
                            let val = varyings.get(key).unwrap_or_else(|| {
                                panic!("ReturnVertex missing varying '{}'", key)
                            });
                            components.push(translate_expr_body(bb, &vs_ctx, val, &vs_scope));
                        }
                        let composed = bb.compose(struct_ty, components);
                        bb.emit_return_value(composed);
                    } else {
                        bb.emit_return_value(pos);
                    }
                }
                _ => translate_statement_body(bb, &vs_ctx, stmt, &mut vs_scope),
            }
        }
    });
    m.add_vertex_entry("vs_main", vs);

    // --- Fragment shader ---
    let mut fs = FnBuilder::new("fs_main");
    fs.set_result(
        vec4_f32_ty,
        Some(naga::Binding::Location {
            location: 0,
            blend_src: None,
            per_primitive: false,
            interpolation: None,
            sampling: None,
        }),
    );

    let mut fs_scope = TranslationScope::new();
    if has_varyings {
        // Fragment receives its own struct (no @builtin(position) — different from VS output)
        let struct_ty = fs_input_ty.unwrap();
        let fs_input = fs.add_argument("fs_in", struct_ty, None);
        for (i, key) in varying_keys.iter().enumerate() {
            let field_val = fs.access_index(fs_input, i as u32); // no position offset — FS struct only has varyings
            fs_scope.insert_let(key.clone(), field_val);
        }
    }

    let mut fs_domain_exprs = HashMap::new();
    for (domain_id, gv) in &domain_gvs {
        fs_domain_exprs.insert(domain_id.clone(), fs.global(*gv));
    }
    let mut fs_texture_exprs = HashMap::new();
    for (tex_id, gv) in &render_texture_gvs {
        fs_texture_exprs.insert(tex_id.clone(), fs.global(*gv));
    }
    let mut fs_sampler_exprs = HashMap::new();
    for (sampler_id, gv) in &render_sampler_gvs {
        fs_sampler_exprs.insert(sampler_id.clone(), fs.global(*gv));
    }
    let fs_ctx = PassContext {
        stage: TranslationStage::Fragment,
        globals_expr: None,
        scalars_expr: None,
        domain_exprs: fs_domain_exprs,
        domain_atomic_exprs: HashMap::new(),
        symbol_map: arena.symbol_map.clone(),
        type_handles,
        texture_exprs: fs_texture_exprs,
        texture_is_sampled,
        sampler_exprs: fs_sampler_exprs,
    };

    translate_statements_fragment(
        &mut fs,
        &fs_ctx,
        &draw_call.fragment_ast,
        &mut fs_scope,
        vec4_f32_ty,
        f32_ty,
    );
    m.add_fragment_entry("fs_main", fs);

    let bound_domain_keys: Vec<String> = domain_keys.into_iter().cloned().collect();
    let bound_texture_keys: Vec<String> = render_tex_keys.into_iter().cloned().collect();
    let bound_sampler_keys = render_sampler_keys;

    // Debug: try to emit WGSL before validation (validation may panic)
    let raw_module = m.finish();
    {
        let mut permissive = naga::valid::Validator::new(
            naga::valid::ValidationFlags::empty(),
            naga::valid::Capabilities::all(),
        );
        if let Ok(info) = permissive.validate(&raw_module) {
            if let Ok(wgsl) = naga::back::wgsl::write_string(
                &raw_module,
                &info,
                naga::back::wgsl::WriterFlags::empty(),
            ) {
                web_sys::console::log_1(&wasm_bindgen::JsValue::from_str(&format!(
                    "[translator] Render pass WGSL:\n{}",
                    wgsl
                )));
            }
        }
    }

    let (module, info) = validate_module(raw_module);
    let bound_atomic_domain_keys: Vec<String> = render_atomic_gvs.keys().cloned().collect();
    RenderPassTranslation {
        module,
        info,
        bound_domain_keys,
        bound_atomic_domain_keys,
        bound_texture_keys,
        bound_sampler_keys,
    }
}

// ---------------------------------------------------------------------------
// Statement translation
// ---------------------------------------------------------------------------

fn translate_statements(
    fb: &mut FnBuilder,
    ctx: &PassContext,
    stmts: &[StatementIR],
    scope: &mut TranslationScope,
) {
    fb.with_root(|body| {
        translate_statements_body(body, ctx, stmts, scope);
    });
}

fn translate_statements_body(
    bb: &mut FnBodyBuilder<'_>,
    ctx: &PassContext,
    stmts: &[StatementIR],
    scope: &mut TranslationScope,
) {
    for stmt in stmts {
        translate_statement_body(bb, ctx, stmt, scope);
    }
}

fn translate_statement_body(
    bb: &mut FnBodyBuilder<'_>,
    ctx: &PassContext,
    stmt: &StatementIR,
    scope: &mut TranslationScope,
) {
    match stmt {
        StatementIR::Let { name, value } => {
            let expr = translate_expr_body(bb, ctx, value, scope);
            scope.insert_let(name.clone(), expr);
        }
        StatementIR::Var {
            name,
            data_type,
            value,
        } => {
            let ty = data_type
                .as_ref()
                .and_then(|dt| ctx.type_handles.get(dt.as_str()))
                .copied()
                .unwrap_or_else(|| {
                    *ctx.type_handles
                        .get("f32")
                        .expect("f32 type handle missing")
                });
            let init = value
                .as_ref()
                .map(|v| translate_expr_body(bb, ctx, v, scope));
            let ptr = bb.declare_var(name, ty, init);
            scope.insert_var(name.clone(), ptr);
        }
        StatementIR::Assign { target, value } => {
            // Target must be a VarRef that resolves to a mutable variable pointer
            let ExprIR::VarRef { name } = target else {
                panic!(
                    "Assign target must be a VarRef, got {:?}",
                    std::mem::discriminant(target)
                );
            };
            let (ptr, _) = scope
                .resolve(name)
                .unwrap_or_else(|| panic!("Assign: variable '{}' not found in scope", name));
            let val = translate_expr_body(bb, ctx, value, scope);
            bb.store_local(ptr, val);
        }
        StatementIR::StoreScalar { symbol_id, value } => {
            let sym = ctx
                .symbol_map
                .get(symbol_id)
                .unwrap_or_else(|| panic!("StoreScalar: symbol '{}' not in symbol_map", symbol_id));
            let val = translate_expr_body(bb, ctx, value, scope);
            let store_val = if is_u32_expr(value) {
                val
            } else {
                bb.bitcast_u32(val)
            };
            let scalars = ctx
                .scalars_expr
                .expect("StoreScalar requires scalars buffer");
            let offset = bb.lit_u32(sym.word_offset);
            bb.store_buffer(scalars, offset, store_val);
        }
        StatementIR::StoreField {
            symbol_id,
            index,
            value,
        } => {
            let sym = ctx
                .symbol_map
                .get(symbol_id)
                .unwrap_or_else(|| panic!("StoreField: symbol '{}' not in symbol_map", symbol_id));
            let domain_id = sym.domain_id.as_ref().unwrap();
            let domain_buf = ctx.domain_exprs.get(domain_id).unwrap_or_else(|| {
                panic!(
                    "StoreField: domain '{}' not in pass domain_exprs",
                    domain_id
                )
            });
            let idx = translate_expr_body(bb, ctx, index, scope);
            let val = translate_expr_body(bb, ctx, value, scope);
            let store_val =
                if sym.wgsl_type == "u32" || sym.wgsl_type == "i32" || is_u32_expr(value) {
                    val
                } else {
                    bb.bitcast_u32(val)
                };
            let offset_lit = bb.lit_u32(sym.word_offset);
            let addr = bb.add(offset_lit, idx);
            bb.store_buffer(*domain_buf, addr, store_val);
        }
        StatementIR::TextureStore {
            texture_id,
            coords,
            value,
        } => {
            let tex = *ctx
                .texture_exprs
                .get(texture_id)
                .unwrap_or_else(|| panic!("TextureStore: texture '{}' not in context", texture_id));
            let coords_expr = translate_expr_body(bb, ctx, coords, scope);
            let val = translate_expr_body(bb, ctx, value, scope);
            bb.texture_store(tex, coords_expr, val);
        }
        StatementIR::If {
            condition,
            accept,
            reject,
        } => {
            let cond = translate_expr_body(bb, ctx, condition, scope);
            // [LAW:dataflow-not-control-flow] Both branches lower through one
            // conditional statement; branch-local scopes prevent declaration leakage.
            let mut accept_scope = scope.clone();
            let mut reject_scope = scope.clone();
            bb.if_then_else(
                cond,
                |nested| translate_statements_body(nested, ctx, accept, &mut accept_scope),
                |nested| translate_statements_body(nested, ctx, reject, &mut reject_scope),
            );
        }
        StatementIR::For {
            init,
            condition,
            update,
            body,
        } => {
            let mut loop_scope = scope.clone();
            translate_statement_body(bb, ctx, init, &mut loop_scope);
            bb.loop_body(|loop_bb| {
                // [LAW:dataflow-not-control-flow] Condition check runs at loop
                // head each iteration; the loop always lowers through one shape.
                let cond = translate_expr_body(loop_bb, ctx, condition, &loop_scope);
                let false_lit = loop_bb.lit_bool(false);
                let not_cond = loop_bb.eq(cond, false_lit);
                loop_bb.if_then(not_cond, |nested| {
                    nested.emit_break();
                });
                let mut body_scope = loop_scope.clone();
                translate_loop_body_with_continue_update(
                    loop_bb,
                    ctx,
                    body,
                    &mut body_scope,
                    update,
                );
                translate_statement_body(loop_bb, ctx, update, &mut loop_scope);
            });
        }
        StatementIR::Break => {
            bb.emit_break();
        }
        StatementIR::Continue => {
            bb.emit_continue();
        }
        StatementIR::AtomicOpField {
            op,
            symbol_id,
            index,
            value,
            assign_result_to,
        } => {
            let sym = ctx.symbol_map.get(symbol_id).unwrap_or_else(|| {
                panic!("AtomicOpField: symbol '{}' not in symbol_map", symbol_id)
            });
            let domain_id = sym.domain_id.as_ref().unwrap();
            let atomic_buf = ctx.domain_atomic_exprs.get(domain_id).unwrap_or_else(|| {
                panic!("AtomicOpField: domain '{}' has no atomic buffer", domain_id)
            });
            let idx = translate_expr_body(bb, ctx, index, scope);
            let offset_lit = bb.lit_u32(sym.word_offset);
            let addr = bb.add(offset_lit, idx);
            let pointer = bb.access(*atomic_buf, addr);
            let val = translate_expr_body(bb, ctx, value, scope);
            let u32_ty = *ctx.type_handles.get("u32").unwrap();
            let fun = match op.as_str() {
                "Add" => naga::AtomicFunction::Add,
                "Sub" => naga::AtomicFunction::Subtract,
                "Max" => naga::AtomicFunction::Max,
                "Min" => naga::AtomicFunction::Min,
                "And" => naga::AtomicFunction::And,
                "Or" => naga::AtomicFunction::InclusiveOr,
                "Xor" => naga::AtomicFunction::ExclusiveOr,
                "Exchange" => naga::AtomicFunction::Exchange { compare: None },
                _ => panic!("AtomicOpField: unknown op '{}'", op),
            };
            let result = bb.atomic_op(fun, pointer, val, u32_ty);
            if let Some(name) = assign_result_to {
                scope.insert_let(name.clone(), result);
            }
        }
        StatementIR::AtomicOpScalar {
            op,
            symbol_id,
            value,
            assign_result_to,
        } => {
            let sym = ctx.symbol_map.get(symbol_id).unwrap_or_else(|| {
                panic!("AtomicOpScalar: symbol '{}' not in symbol_map", symbol_id)
            });
            let scalars = ctx.scalars_expr.expect("AtomicOpScalar requires scalars buffer");
            let offset = bb.lit_u32(sym.word_offset);
            let pointer = bb.access(scalars, offset);
            let val = translate_expr_body(bb, ctx, value, scope);
            let u32_ty = *ctx.type_handles.get("u32").unwrap();
            let fun = match op.as_str() {
                "Add" => naga::AtomicFunction::Add,
                "Sub" => naga::AtomicFunction::Subtract,
                "Max" => naga::AtomicFunction::Max,
                "Min" => naga::AtomicFunction::Min,
                _ => panic!("AtomicOpScalar: unknown op '{}'", op),
            };
            let result = bb.atomic_op(fun, pointer, val, u32_ty);
            if let Some(name) = assign_result_to {
                scope.insert_let(name.clone(), result);
            }
        }
        _ => {
            panic!(
                "translate_statement: not yet implemented: {:?}",
                std::mem::discriminant(stmt)
            );
        }
    }
}

fn translate_loop_body_with_continue_update(
    bb: &mut FnBodyBuilder<'_>,
    ctx: &PassContext,
    stmts: &[StatementIR],
    scope: &mut TranslationScope,
    update_stmt: &StatementIR,
) {
    for stmt in stmts {
        match stmt {
            StatementIR::Continue => {
                translate_statement_body(bb, ctx, update_stmt, scope);
                bb.emit_continue();
                return;
            }
            StatementIR::Break => {
                bb.emit_break();
                return;
            }
            StatementIR::If {
                condition,
                accept,
                reject,
            } => {
                let cond = translate_expr_body(bb, ctx, condition, scope);
                let mut accept_scope = scope.clone();
                let mut reject_scope = scope.clone();
                bb.if_then_else(
                    cond,
                    |nested| {
                        translate_loop_body_with_continue_update(
                            nested,
                            ctx,
                            accept,
                            &mut accept_scope,
                            update_stmt,
                        )
                    },
                    |nested| {
                        translate_loop_body_with_continue_update(
                            nested,
                            ctx,
                            reject,
                            &mut reject_scope,
                            update_stmt,
                        )
                    },
                );
            }
            _ => translate_statement_body(bb, ctx, stmt, scope),
        }
    }
}

/// Translate vertex shader statements. Handles ReturnVertex specially.
fn translate_statements_vertex(
    fb: &mut FnBuilder,
    ctx: &PassContext,
    stmts: &[StatementIR],
    scope: &mut TranslationScope,
    _vec4_f32_ty: naga::Handle<naga::Type>,
    _f32_ty: naga::Handle<naga::Type>,
) {
    fb.with_root(|bb| {
        for stmt in stmts {
            match stmt {
                StatementIR::ReturnVertex {
                    position,
                    varyings: _,
                } => {
                    let pos = translate_expr_body(bb, ctx, position, scope);
                    bb.emit_return_value(pos);
                }
                _ => {
                    translate_statement_body(bb, ctx, stmt, scope);
                }
            }
        }
    });
}

/// Translate fragment shader statements. Handles ReturnFragment specially.
fn translate_statements_fragment(
    fb: &mut FnBuilder,
    ctx: &PassContext,
    stmts: &[StatementIR],
    scope: &mut TranslationScope,
    _vec4_f32_ty: naga::Handle<naga::Type>,
    _f32_ty: naga::Handle<naga::Type>,
) {
    fb.with_root(|bb| {
        for stmt in stmts {
            match stmt {
                StatementIR::ReturnFragment { outputs } => {
                    let key = outputs
                        .get("color")
                        .map(|_| "color")
                        .or_else(|| outputs.keys().next().map(|k| k.as_str()))
                        .expect("ReturnFragment needs at least one output");
                    let color = translate_expr_body(bb, ctx, &outputs[key], scope);
                    bb.emit_return_value(color);
                }
                _ => {
                    translate_statement_body(bb, ctx, stmt, scope);
                }
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Expression translation (operates on FnBodyBuilder for nested block support)
// ---------------------------------------------------------------------------

fn translate_expr_body(
    bb: &mut FnBodyBuilder<'_>,
    ctx: &PassContext,
    expr: &ExprIR,
    scope: &TranslationScope,
) -> Expr {
    match expr {
        ExprIR::LiteralF32 { value } => bb.lit_f32(*value as f32),
        ExprIR::LiteralU32 { value } => bb.lit_u32(*value as u32),
        ExprIR::LiteralI32 { value } => bb.lit_i32(*value as i32),
        ExprIR::LiteralBool { value } => bb.lit_bool(*value),

        ExprIR::VarRef { name } => {
            let (expr, needs_load) = scope
                .resolve(name)
                .unwrap_or_else(|| panic!("VarRef: variable '{}' not found in scope", name));
            if needs_load {
                bb.load_local(expr)
            } else {
                expr
            }
        }

        ExprIR::LoadGlobal { symbol_id } => {
            let sym = ctx
                .symbol_map
                .get(symbol_id)
                .unwrap_or_else(|| panic!("LoadGlobal: symbol '{}' not in symbol_map", symbol_id));
            let globals = ctx
                .globals_expr
                .expect("LoadGlobal requires globals buffer");
            let offset = bb.lit_u32(sym.word_offset);
            bb.load_buffer(globals, offset)
        }

        ExprIR::LoadScalar { symbol_id } => {
            let sym = ctx
                .symbol_map
                .get(symbol_id)
                .unwrap_or_else(|| panic!("LoadScalar: symbol '{}' not in symbol_map", symbol_id));
            let scalars = ctx
                .scalars_expr
                .expect("LoadScalar requires scalars buffer");
            let offset = bb.lit_u32(sym.word_offset);
            let raw = bb.load_buffer(scalars, offset);
            if sym.wgsl_type == "f32" {
                bb.bitcast_f32(raw)
            } else {
                raw
            }
        }

        ExprIR::LoadField { symbol_id, index } => {
            let sym = ctx
                .symbol_map
                .get(symbol_id)
                .unwrap_or_else(|| panic!("LoadField: symbol '{}' not in symbol_map", symbol_id));
            let domain_id = sym.domain_id.as_ref().unwrap();
            let domain_buf = ctx.domain_exprs.get(domain_id).unwrap_or_else(|| {
                panic!("LoadField: domain '{}' not in pass domain_exprs", domain_id)
            });
            let idx = translate_expr_body(bb, ctx, index, scope);
            let offset_lit = bb.lit_u32(sym.word_offset);
            let addr = bb.add(offset_lit, idx);
            let raw = bb.load_buffer(*domain_buf, addr);
            if sym.wgsl_type == "f32" {
                bb.bitcast_f32(raw)
            } else {
                raw
            }
        }

        ExprIR::BinaryOp { op, left, right } => {
            let l = translate_expr_body(bb, ctx, left, scope);
            let r = translate_expr_body(bb, ctx, right, scope);
            match op.as_str() {
                "+" => bb.add(l, r),
                "-" => bb.sub(l, r),
                "*" => bb.mul(l, r),
                "/" => bb.div(l, r),
                "%" => bb.modulo(l, r),
                "==" => bb.eq(l, r),
                "!=" => bb.ne(l, r),
                "<" => bb.lt(l, r),
                ">" => bb.gt(l, r),
                "<=" => bb.le(l, r),
                ">=" => bb.ge(l, r),
                "&&" => bb.and(l, r),
                "||" => bb.or(l, r),
                "&" => bb.bit_and(l, r),
                "|" => bb.bit_or(l, r),
                "^" => bb.bit_xor(l, r),
                "<<" => bb.shl(l, r),
                ">>" => bb.shr(l, r),
                _ => panic!("BinaryOp: not yet implemented: '{}'", op),
            }
        }

        ExprIR::UnaryOp { op, expr: inner } => {
            let e = translate_expr_body(bb, ctx, inner, scope);
            match op.as_str() {
                "-" => bb.neg(e),
                "!" => bb.not(e),
                "~" => bb.bit_not(e),
                _ => panic!("UnaryOp: not yet implemented: '{}'", op),
            }
        }

        ExprIR::CallBuiltin { func, args } => {
            let translated: Vec<Expr> = args
                .iter()
                .map(|a| translate_expr_body(bb, ctx, a, scope))
                .collect();
            match func.as_str() {
                "sin" => bb.sin(translated[0]),
                "cos" => bb.cos(translated[0]),
                "tan" => bb.tan(translated[0]),
                "abs" => bb.abs(translated[0]),
                "sign" => bb.sign(translated[0]),
                "floor" => bb.floor(translated[0]),
                "ceil" => bb.ceil(translated[0]),
                "round" => bb.round(translated[0]),
                "fract" => bb.fract(translated[0]),
                "sqrt" => bb.sqrt(translated[0]),
                "exp" => bb.exp(translated[0]),
                "log" => bb.log(translated[0]),
                "pow" => bb.pow(translated[0], translated[1]),
                "min" => bb.min(translated[0], translated[1]),
                "max" => bb.max(translated[0], translated[1]),
                "clamp" => bb.clamp(translated[0], translated[1], translated[2]),
                "atan2" => bb.atan2(translated[0], translated[1]),
                "asin" => bb.asin(translated[0]),
                "acos" => bb.acos(translated[0]),
                "atan" => bb.atan(translated[0]),
                "step" => bb.step(translated[0], translated[1]),
                "smoothstep" => bb.smoothstep(translated[0], translated[1], translated[2]),
                "length" => bb.length(translated[0]),
                "distance" => bb.distance(translated[0], translated[1]),
                "dot" => bb.dot(translated[0], translated[1]),
                "cross" => bb.cross(translated[0], translated[1]),
                "normalize" => bb.normalize(translated[0]),
                "reflect" => bb.reflect(translated[0], translated[1]),
                "refract" => bb.refract(translated[0], translated[1], translated[2]),
                "dpdx" => {
                    ensure_fragment_derivative(ctx, "dpdx");
                    bb.dpdx(translated[0])
                }
                "dpdy" => {
                    ensure_fragment_derivative(ctx, "dpdy");
                    bb.dpdy(translated[0])
                }
                "fwidth" => {
                    ensure_fragment_derivative(ctx, "fwidth");
                    bb.fwidth(translated[0])
                }
                _ => panic!("CallBuiltin: not yet implemented: '{}'", func),
            }
        }

        ExprIR::Construct { data_type, args } => {
            let translated: Vec<Expr> = args
                .iter()
                .map(|a| translate_expr_body(bb, ctx, a, scope))
                .collect();
            let ty = ctx.type_handles.get(data_type.as_str()).unwrap_or_else(|| {
                panic!("Construct: no type handle for '{}' in context", data_type)
            });
            bb.compose(*ty, translated)
        }

        ExprIR::Swizzle { source, mask } => {
            let src = translate_expr_body(bb, ctx, source, scope);
            // Single-component → AccessIndex; multi-component → Expression::Swizzle
            if mask.len() == 1 {
                let idx = match mask.as_str() {
                    "x" | "r" => 0,
                    "y" | "g" => 1,
                    "z" | "b" => 2,
                    "w" | "a" => 3,
                    _ => panic!("Swizzle: unknown component '{}'", mask),
                };
                bb.access_index(src, idx)
            } else {
                let size = match mask.len() {
                    2 => naga::VectorSize::Bi,
                    3 => naga::VectorSize::Tri,
                    4 => naga::VectorSize::Quad,
                    _ => panic!("Swizzle: invalid mask length {}", mask.len()),
                };
                let mut pattern = [naga::SwizzleComponent::X; 4];
                for (i, ch) in mask.chars().enumerate() {
                    pattern[i] = match ch {
                        'x' | 'r' => naga::SwizzleComponent::X,
                        'y' | 'g' => naga::SwizzleComponent::Y,
                        'z' | 'b' => naga::SwizzleComponent::Z,
                        'w' | 'a' => naga::SwizzleComponent::W,
                        _ => panic!("Swizzle: unknown component '{}'", ch),
                    };
                }
                bb.swizzle(src, size, pattern)
            }
        }

        ExprIR::IndexAccess { target, index } => {
            let base = translate_expr_body(bb, ctx, target, scope);
            let idx = translate_expr_body(bb, ctx, index, scope);
            bb.access(base, idx)
        }

        ExprIR::TextureSample {
            texture_id,
            sampler_id,
            uv,
        } => {
            let tex = *ctx.texture_exprs.get(texture_id).unwrap_or_else(|| {
                panic!("TextureSample: texture '{}' not in context", texture_id)
            });
            let samp = *ctx.sampler_exprs.get(sampler_id).unwrap_or_else(|| {
                panic!("TextureSample: sampler '{}' not in context", sampler_id)
            });
            let uv_expr = translate_expr_body(bb, ctx, uv, scope);
            let zero = bb.lit_f32(0.0);
            bb.texture_sample_level(tex, samp, uv_expr, zero)
        }

        ExprIR::TextureLoad { texture_id, coords } => {
            let tex = *ctx
                .texture_exprs
                .get(texture_id)
                .unwrap_or_else(|| panic!("TextureLoad: texture '{}' not in context", texture_id));
            let coords_expr = translate_expr_body(bb, ctx, coords, scope);
            let level = if ctx
                .texture_is_sampled
                .get(texture_id)
                .copied()
                .unwrap_or(false)
            {
                Some(bb.lit_i32(0))
            } else {
                None
            };
            bb.texture_load(tex, coords_expr, level)
        }

        ExprIR::AtomicLoadField { symbol_id, index } => {
            let sym = ctx.symbol_map.get(symbol_id).unwrap_or_else(|| {
                panic!("AtomicLoadField: symbol '{}' not in symbol_map", symbol_id)
            });
            let domain_id = sym.domain_id.as_ref().unwrap();
            let atomic_buf = ctx.domain_atomic_exprs.get(domain_id).unwrap_or_else(|| {
                panic!("AtomicLoadField: domain '{}' has no atomic buffer", domain_id)
            });
            let idx = translate_expr_body(bb, ctx, index, scope);
            let offset_lit = bb.lit_u32(sym.word_offset);
            let addr = bb.add(offset_lit, idx);
            let pointer = bb.access(*atomic_buf, addr);
            bb.load_local(pointer) // atomicLoad is just Expression::Load on the atomic pointer
        }

        ExprIR::AtomicLoadScalar { symbol_id } => {
            let sym = ctx.symbol_map.get(symbol_id).unwrap_or_else(|| {
                panic!("AtomicLoadScalar: symbol '{}' not in symbol_map", symbol_id)
            });
            let scalars = ctx.scalars_expr.expect("AtomicLoadScalar requires scalars buffer");
            let offset = bb.lit_u32(sym.word_offset);
            let pointer = bb.access(scalars, offset);
            bb.load_local(pointer)
        }

        ExprIR::Intrinsic { name } => match name.as_str() {
            "global_invocation_id.x" | "global_invocation_id.y" | "global_invocation_id.z" => {
                let (gid, _) = scope
                    .resolve("__gid")
                    .unwrap_or_else(|| panic!("Intrinsic '{}' requires compute context", name));
                let component = match name.as_str() {
                    "global_invocation_id.x" => 0,
                    "global_invocation_id.y" => 1,
                    _ => 2,
                };
                bb.access_index(gid, component)
            }
            "vertex_index" | "instance_index" => {
                let key = format!("__{}", name.replace('.', "_"));
                let (expr, _) = scope.resolve(&key).unwrap_or_else(|| {
                    panic!(
                        "Intrinsic '{}' not in scope (missing vertex/render context)",
                        name
                    )
                });
                expr
            }
            _ => panic!("Intrinsic '{}' not yet implemented", name),
        },

        ExprIR::Cast {
            target_type,
            expr: inner,
        } => {
            let e = translate_expr_body(bb, ctx, inner, scope);
            match target_type.as_str() {
                "f32" => bb.f32(e),
                "u32" => bb.u32(e),
                "i32" => bb.i32(e),
                _ => panic!("Cast to '{}' not yet implemented", target_type),
            }
        }

        _ => {
            panic!(
                "translate_expr: not yet implemented: {:?}",
                std::mem::discriminant(expr)
            );
        }
    }
}

fn ensure_fragment_derivative(ctx: &PassContext, func_name: &str) {
    // [LAW:single-enforcer] Derivative stage legality is enforced in one
    // translation boundary, not scattered across callsites.
    if !matches!(ctx.stage, TranslationStage::Fragment) {
        panic!(
            "CallBuiltin '{}' is only valid in fragment shaders",
            func_name
        );
    }
}

/// Heuristic: is this expression a u32 literal or u32-typed?
fn is_u32_expr(expr: &ExprIR) -> bool {
    matches!(expr, ExprIR::LiteralU32 { .. })
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

fn wgpu_format_to_naga(format: wgpu::TextureFormat) -> naga::StorageFormat {
    match format {
        wgpu::TextureFormat::R8Unorm => naga::StorageFormat::R8Unorm,
        wgpu::TextureFormat::Rgba8Unorm => naga::StorageFormat::Rgba8Unorm,
        wgpu::TextureFormat::Rgba16Float => naga::StorageFormat::Rgba16Float,
        wgpu::TextureFormat::R32Float => naga::StorageFormat::R32Float,
        wgpu::TextureFormat::Rg32Float => naga::StorageFormat::Rg32Float,
        wgpu::TextureFormat::Rgba32Float => naga::StorageFormat::Rgba32Float,
        _ => naga::StorageFormat::Rgba8Unorm,
    }
}

fn validate_module(module: naga::Module) -> (naga::Module, naga::valid::ModuleInfo) {
    let mut validator = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    );
    let info = match validator.validate(&module) {
        Ok(info) => info,
        Err(err) => {
            // For debugging, try a permissive validation to get ModuleInfo for WGSL emission
            let mut permissive = naga::valid::Validator::new(
                naga::valid::ValidationFlags::empty(),
                naga::valid::Capabilities::all(),
            );
            let wgsl = permissive
                .validate(&module)
                .ok()
                .and_then(|info| {
                    naga::back::wgsl::write_string(
                        &module,
                        &info,
                        naga::back::wgsl::WriterFlags::empty(),
                    )
                    .ok()
                })
                .unwrap_or_else(|| "<WGSL emission failed>".into());
            panic!(
                "Naga validation failed:\n{}\n\nGenerated WGSL:\n{}",
                err, wgsl
            );
        }
    };
    (module, info)
}
