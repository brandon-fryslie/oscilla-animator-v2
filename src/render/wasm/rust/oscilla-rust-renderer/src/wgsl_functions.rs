//! WGSL function registration: parse registered WGSL source into Naga modules,
//! transplant referenced functions into shader modules during translation.
//!
//! [LAW:one-source-of-truth] Function definitions live in TypeScript (boundary contract).
//! This module only parses and transplants — it does not define any functions.

use std::collections::HashMap;

use naga::{Arena, Block, Expression, Function, Handle, LocalVariable, Module, Range, Span, Statement, Type, TypeInner};

use crate::contract::{ExprIR, StatementIR, WgslFunction};

/// A parsed WGSL function ready for transplant into shader modules.
pub struct ParsedFunction {
    /// The Naga module containing the function and its helpers
    pub module: Module,
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

// ---------------------------------------------------------------------------
// Transplant context — tracks handle remapping between source and destination
// ---------------------------------------------------------------------------

struct TransplantCtx {
    type_map: HashMap<Handle<Type>, Handle<Type>>,
    const_map: HashMap<Handle<naga::Constant>, Handle<naga::Constant>>,
    func_map: HashMap<Handle<Function>, Handle<Function>>,
}

impl TransplantCtx {
    fn new() -> Self {
        Self {
            type_map: HashMap::new(),
            const_map: HashMap::new(),
            func_map: HashMap::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Ensure a registered function is transplanted into the target module.
/// Returns the Handle<Function> for the transplanted entrypoint.
/// Idempotent — if the function is already in dst (by name), returns its handle.
pub fn ensure_transplanted(
    dst: &mut Module,
    parsed: &HashMap<String, ParsedFunction>,
    name: &str,
) -> Result<Handle<Function>, String> {
    // Already transplanted?
    for (handle, func) in dst.functions.iter() {
        if func.name.as_deref() == Some(name) {
            return Ok(handle);
        }
    }

    let pf = parsed.get(name).ok_or_else(|| {
        format!("WGSL function '{}' not found in registered functions", name)
    })?;

    let mut ctx = TransplantCtx::new();
    transplant_function_by_name(&pf.module, dst, &pf.entrypoint, &mut ctx)
}

/// Scan a StatementIR AST for CallBuiltin references to registered functions,
/// transplant them all into the module upfront, and return a map of name → Handle<Function>.
/// This should be called before translating the function body, while the module is still mutable.
pub fn transplant_referenced_functions(
    dst: &mut Module,
    parsed: &HashMap<String, ParsedFunction>,
    ast: &[StatementIR],
) -> Result<HashMap<String, Handle<Function>>, String> {
    let mut result = HashMap::new();
    let mut names = Vec::new();
    collect_stdlib_calls_from_stmts(ast, parsed, &mut names);
    names.sort();
    names.dedup();

    for name in names {
        let handle = ensure_transplanted(dst, parsed, &name)?;
        result.insert(name, handle);
    }
    Ok(result)
}

fn collect_stdlib_calls_from_stmts(
    stmts: &[StatementIR],
    parsed: &HashMap<String, ParsedFunction>,
    out: &mut Vec<String>,
) {
    for stmt in stmts {
        collect_stdlib_calls_from_stmt(stmt, parsed, out);
    }
}

fn collect_stdlib_calls_from_stmt(
    stmt: &StatementIR,
    parsed: &HashMap<String, ParsedFunction>,
    out: &mut Vec<String>,
) {
    match stmt {
        StatementIR::Let { value, .. } | StatementIR::Assign { value, .. } => {
            collect_stdlib_calls_from_expr(value, parsed, out);
        }
        StatementIR::StoreField { value, .. } => {
            collect_stdlib_calls_from_expr(value, parsed, out);
        }
        StatementIR::StoreScalar { value, .. } => {
            collect_stdlib_calls_from_expr(value, parsed, out);
        }
        StatementIR::If { condition, accept, reject, .. } => {
            collect_stdlib_calls_from_expr(condition, parsed, out);
            collect_stdlib_calls_from_stmts(accept, parsed, out);
            collect_stdlib_calls_from_stmts(reject, parsed, out);
        }
        StatementIR::For { body, .. } => {
            collect_stdlib_calls_from_stmts(body, parsed, out);
        }
        StatementIR::ReturnVertex { position, varyings, .. } => {
            collect_stdlib_calls_from_expr(position, parsed, out);
            for v in varyings.values() {
                collect_stdlib_calls_from_expr(v, parsed, out);
            }
        }
        StatementIR::ReturnFragment { outputs, .. } => {
            for v in outputs.values() {
                collect_stdlib_calls_from_expr(v, parsed, out);
            }
        }
        _ => {} // Other statements don't contain expressions with function calls
    }
}

fn collect_stdlib_calls_from_expr(
    expr: &ExprIR,
    parsed: &HashMap<String, ParsedFunction>,
    out: &mut Vec<String>,
) {
    match expr {
        ExprIR::CallBuiltin { func, args } => {
            if parsed.contains_key(func.as_str()) {
                out.push(func.clone());
            }
            for arg in args {
                collect_stdlib_calls_from_expr(arg, parsed, out);
            }
        }
        ExprIR::BinaryOp { left, right, .. } => {
            collect_stdlib_calls_from_expr(left, parsed, out);
            collect_stdlib_calls_from_expr(right, parsed, out);
        }
        ExprIR::UnaryOp { expr: inner, .. } | ExprIR::Cast { expr: inner, .. }
        | ExprIR::Swizzle { source: inner, .. } => {
            collect_stdlib_calls_from_expr(inner, parsed, out);
        }
        ExprIR::Construct { args, .. } => {
            for arg in args {
                collect_stdlib_calls_from_expr(arg, parsed, out);
            }
        }
        _ => {} // Leaves: literals, loads, var refs — no function calls
    }
}

// ---------------------------------------------------------------------------
// Core transplant
// ---------------------------------------------------------------------------

fn transplant_function_by_name(
    src: &Module,
    dst: &mut Module,
    name: &str,
    ctx: &mut TransplantCtx,
) -> Result<Handle<Function>, String> {
    // Already transplanted?
    for (handle, func) in dst.functions.iter() {
        if func.name.as_deref() == Some(name) {
            return Ok(handle);
        }
    }

    // Find the function in source
    let (src_handle, src_func) = src
        .functions
        .iter()
        .find(|(_, f)| f.name.as_deref() == Some(name))
        .ok_or_else(|| format!("Function '{}' not found in source module", name))?;

    // First transplant transitive dependencies (functions called by this function)
    let called_functions = collect_called_functions(&src_func.body);
    for called_handle in &called_functions {
        let called_name = src.functions[*called_handle]
            .name
            .as_deref()
            .unwrap_or("<unnamed>");
        // Check if already mapped
        if !ctx.func_map.contains_key(called_handle) {
            transplant_function_by_name(src, dst, called_name, ctx)?;
            // After recursive transplant, find the new handle in dst
            let new_handle = dst
                .functions
                .iter()
                .find(|(_, f)| f.name.as_deref() == Some(called_name))
                .map(|(h, _)| h)
                .ok_or_else(|| format!("Recursive transplant of '{}' failed", called_name))?;
            ctx.func_map.insert(*called_handle, new_handle);
        }
    }

    // Remap types used by the function
    remap_function_types(src, dst, src_func, ctx);

    // Build the new function with remapped arenas
    let new_func = remap_function(src, src_func, ctx);

    let new_handle = dst.functions.append(new_func, Span::UNDEFINED);
    ctx.func_map.insert(src_handle, new_handle);
    Ok(new_handle)
}

// ---------------------------------------------------------------------------
// Type remapping
// ---------------------------------------------------------------------------

fn remap_type(src: &Module, dst: &mut Module, src_handle: Handle<Type>, ctx: &mut TransplantCtx) -> Handle<Type> {
    if let Some(&mapped) = ctx.type_map.get(&src_handle) {
        return mapped;
    }

    let src_type = &src.types[src_handle];
    let new_inner = remap_type_inner(src, dst, &src_type.inner, ctx);

    let new_handle = dst.types.insert(
        Type {
            name: src_type.name.clone(),
            inner: new_inner,
        },
        Span::UNDEFINED,
    );

    ctx.type_map.insert(src_handle, new_handle);
    new_handle
}

fn remap_type_inner(src: &Module, dst: &mut Module, inner: &TypeInner, ctx: &mut TransplantCtx) -> TypeInner {
    match inner {
        TypeInner::Scalar(_) | TypeInner::Atomic(_) => inner.clone(),
        TypeInner::Vector { size, scalar } => TypeInner::Vector { size: *size, scalar: *scalar },
        TypeInner::Matrix { columns, rows, scalar } => {
            TypeInner::Matrix { columns: *columns, rows: *rows, scalar: *scalar }
        }
        TypeInner::Pointer { base, space } => {
            let new_base = remap_type(src, dst, *base, ctx);
            TypeInner::Pointer { base: new_base, space: *space }
        }
        TypeInner::ValuePointer { size, scalar, space } => {
            TypeInner::ValuePointer { size: *size, scalar: *scalar, space: *space }
        }
        TypeInner::Array { base, size, stride } => {
            let new_base = remap_type(src, dst, *base, ctx);
            TypeInner::Array { base: new_base, size: *size, stride: *stride }
        }
        TypeInner::Struct { members, span } => {
            let new_members: Vec<_> = members
                .iter()
                .map(|m| naga::StructMember {
                    name: m.name.clone(),
                    ty: remap_type(src, dst, m.ty, ctx),
                    binding: m.binding.clone(),
                    offset: m.offset,
                })
                .collect();
            TypeInner::Struct { members: new_members, span: *span }
        }
        TypeInner::Image { .. } | TypeInner::Sampler { .. }
        | TypeInner::AccelerationStructure { .. } | TypeInner::RayQuery { .. }
        | TypeInner::BindingArray { .. } | TypeInner::CooperativeMatrix { .. } => inner.clone(),
    }
}

fn remap_function_types(src: &Module, dst: &mut Module, func: &Function, ctx: &mut TransplantCtx) {
    // Arguments
    for arg in &func.arguments {
        remap_type(src, dst, arg.ty, ctx);
    }
    // Result
    if let Some(ref result) = func.result {
        remap_type(src, dst, result.ty, ctx);
    }
    // Local variables
    for (_, local) in func.local_variables.iter() {
        remap_type(src, dst, local.ty, ctx);
    }
    // Expressions (some reference types)
    for (_, expr) in func.expressions.iter() {
        collect_types_from_expr(src, dst, expr, ctx);
    }
}

fn collect_types_from_expr(src: &Module, dst: &mut Module, expr: &Expression, ctx: &mut TransplantCtx) {
    match expr {
        Expression::Compose { ty, .. } => { remap_type(src, dst, *ty, ctx); }
        Expression::ZeroValue(ty) => { remap_type(src, dst, *ty, ctx); }
        Expression::AtomicResult { ty, .. } => { remap_type(src, dst, *ty, ctx); }
        Expression::WorkGroupUniformLoadResult { ty } => { remap_type(src, dst, *ty, ctx); }
        Expression::SubgroupOperationResult { ty } => { remap_type(src, dst, *ty, ctx); }
        Expression::As { kind, convert, .. } => { let _ = (kind, convert); }
        _ => {}
    }
}

// ---------------------------------------------------------------------------
// Constant remapping
// ---------------------------------------------------------------------------

fn remap_constant(src: &Module, dst: &mut Module, src_handle: Handle<naga::Constant>, ctx: &mut TransplantCtx) -> Handle<naga::Constant> {
    if let Some(&mapped) = ctx.const_map.get(&src_handle) {
        return mapped;
    }

    let src_const = &src.constants[src_handle];
    let new_ty = remap_type(src, dst, src_const.ty, ctx);

    // Remap the init expression — constants use module-level global_expressions arena
    // For simplicity, we re-create the init expression
    let new_init = remap_const_expr(src, dst, src_const.init, ctx);

    let new_handle = dst.constants.append(
        naga::Constant {
            name: src_const.name.clone(),
            ty: new_ty,
            init: new_init,
        },
        Span::UNDEFINED,
    );

    ctx.const_map.insert(src_handle, new_handle);
    new_handle
}

/// Remap a constant expression (from module.global_expressions arena)
fn remap_const_expr(
    src: &Module,
    dst: &mut Module,
    src_handle: Handle<Expression>,
    ctx: &mut TransplantCtx,
) -> Handle<Expression> {
    let expr = &src.global_expressions[src_handle];
    let new_expr = match expr {
        Expression::Literal(lit) => Expression::Literal(lit.clone()),
        Expression::Constant(c) => {
            let new_c = remap_constant(src, dst, *c, ctx);
            Expression::Constant(new_c)
        }
        Expression::ZeroValue(ty) => {
            let new_ty = remap_type(src, dst, *ty, ctx);
            Expression::ZeroValue(new_ty)
        }
        Expression::Compose { ty, components } => {
            let new_ty = remap_type(src, dst, *ty, ctx);
            let new_components: Vec<_> = components
                .iter()
                .map(|c| remap_const_expr(src, dst, *c, ctx))
                .collect();
            Expression::Compose { ty: new_ty, components: new_components }
        }
        // Other const expressions are uncommon in stdlib; clone as-is
        other => other.clone(),
    };
    dst.global_expressions.append(new_expr, Span::UNDEFINED)
}

// ---------------------------------------------------------------------------
// Function remapping — build new function with remapped handles
// ---------------------------------------------------------------------------

fn remap_function(src: &Module, src_func: &Function, ctx: &TransplantCtx) -> Function {
    // Remap arguments
    let arguments: Vec<_> = src_func
        .arguments
        .iter()
        .map(|arg| naga::FunctionArgument {
            name: arg.name.clone(),
            ty: ctx.type_map[&arg.ty],
            binding: arg.binding.clone(),
        })
        .collect();

    // Remap result
    let result = src_func.result.as_ref().map(|r| naga::FunctionResult {
        ty: ctx.type_map[&r.ty],
        binding: r.binding.clone(),
    });

    // Remap local variables
    let mut local_map: HashMap<Handle<LocalVariable>, Handle<LocalVariable>> = HashMap::new();
    let mut new_locals: Arena<LocalVariable> = Arena::new();
    for (src_handle, local) in src_func.local_variables.iter() {
        let new_local = LocalVariable {
            name: local.name.clone(),
            ty: ctx.type_map[&local.ty],
            init: local.init.map(|init_handle| {
                // Local variable init expressions reference the function's expression arena,
                // which we haven't built yet. We'll fix these up after building expressions.
                init_handle
            }),
        };
        let new_handle = new_locals.append(new_local, Span::UNDEFINED);
        local_map.insert(src_handle, new_handle);
    }

    // Remap expressions
    let mut expr_map: HashMap<Handle<Expression>, Handle<Expression>> = HashMap::new();
    let mut new_exprs: Arena<Expression> = Arena::new();

    for (src_handle, expr) in src_func.expressions.iter() {
        let new_expr = remap_expression(expr, ctx, &expr_map, &local_map);
        let new_handle = new_exprs.append(new_expr, Span::UNDEFINED);
        expr_map.insert(src_handle, new_handle);
    }

    // Fix up local variable init expressions
    for (src_handle, local) in src_func.local_variables.iter() {
        if let Some(init) = local.init {
            if let Some(&new_init) = expr_map.get(&init) {
                let new_local_handle = local_map[&src_handle];
                new_locals[new_local_handle].init = Some(new_init);
            }
        }
    }

    // Remap body statements
    let new_body = remap_block(&src_func.body, &expr_map, ctx);

    Function {
        name: src_func.name.clone(),
        arguments,
        result,
        local_variables: new_locals,
        expressions: new_exprs,
        named_expressions: src_func
            .named_expressions
            .iter()
            .filter_map(|(k, v)| expr_map.get(k).map(|new_k| (*new_k, v.clone())))
            .collect(),
        body: new_body,
        diagnostic_filter_leaf: src_func.diagnostic_filter_leaf,
    }
}

// ---------------------------------------------------------------------------
// Expression remapping
// ---------------------------------------------------------------------------

fn remap_expression(
    expr: &Expression,
    ctx: &TransplantCtx,
    expr_map: &HashMap<Handle<Expression>, Handle<Expression>>,
    local_map: &HashMap<Handle<LocalVariable>, Handle<LocalVariable>>,
) -> Expression {
    let e = |h: &Handle<Expression>| expr_map[h];
    let oe = |h: &Option<Handle<Expression>>| h.map(|h| expr_map[&h]);

    match expr {
        Expression::Literal(lit) => Expression::Literal(*lit),
        Expression::Constant(c) => Expression::Constant(ctx.const_map.get(c).copied().unwrap_or(*c)),
        Expression::Override(o) => Expression::Override(*o),
        Expression::ZeroValue(ty) => Expression::ZeroValue(ctx.type_map[ty]),
        Expression::Compose { ty, components } => Expression::Compose {
            ty: ctx.type_map[ty],
            components: components.iter().map(&e).collect(),
        },
        Expression::Access { base, index } => Expression::Access {
            base: e(base),
            index: e(index),
        },
        Expression::AccessIndex { base, index } => Expression::AccessIndex {
            base: e(base),
            index: *index,
        },
        Expression::Splat { size, value } => Expression::Splat {
            size: *size,
            value: e(value),
        },
        Expression::Swizzle { size, vector, pattern } => Expression::Swizzle {
            size: *size,
            vector: e(vector),
            pattern: *pattern,
        },
        Expression::FunctionArgument(idx) => Expression::FunctionArgument(*idx),
        Expression::GlobalVariable(gv) => Expression::GlobalVariable(*gv), // stdlib shouldn't use globals
        Expression::LocalVariable(lv) => Expression::LocalVariable(local_map[lv]),
        Expression::Load { pointer } => Expression::Load { pointer: e(pointer) },
        Expression::ImageSample {
            image, sampler, gather, coordinate, array_index, offset, level, depth_ref, clamp_to_edge,
        } => Expression::ImageSample {
            image: e(image),
            sampler: e(sampler),
            gather: *gather,
            coordinate: e(coordinate),
            array_index: oe(array_index),
            offset: oe(offset),
            level: remap_sample_level(level, expr_map),
            depth_ref: oe(depth_ref),
            clamp_to_edge: *clamp_to_edge,
        },
        Expression::ImageLoad { image, coordinate, array_index, sample, level } => Expression::ImageLoad {
            image: e(image),
            coordinate: e(coordinate),
            array_index: oe(array_index),
            sample: oe(sample),
            level: oe(level),
        },
        Expression::ImageQuery { image, query } => Expression::ImageQuery {
            image: e(image),
            query: *query,
        },
        Expression::Unary { op, expr: inner } => Expression::Unary {
            op: *op,
            expr: e(inner),
        },
        Expression::Binary { op, left, right } => Expression::Binary {
            op: *op,
            left: e(left),
            right: e(right),
        },
        Expression::Select { condition, accept, reject } => Expression::Select {
            condition: e(condition),
            accept: e(accept),
            reject: e(reject),
        },
        Expression::Derivative { axis, ctrl, expr: inner } => Expression::Derivative {
            axis: *axis,
            ctrl: *ctrl,
            expr: e(inner),
        },
        Expression::Relational { fun, argument } => Expression::Relational {
            fun: *fun,
            argument: e(argument),
        },
        Expression::Math { fun, arg, arg1, arg2, arg3 } => Expression::Math {
            fun: *fun,
            arg: e(arg),
            arg1: oe(arg1),
            arg2: oe(arg2),
            arg3: oe(arg3),
        },
        Expression::As { expr: inner, kind, convert } => Expression::As {
            expr: e(inner),
            kind: *kind,
            convert: *convert,
        },
        Expression::CallResult(func) => Expression::CallResult(ctx.func_map[func]),
        Expression::AtomicResult { ty, comparison } => Expression::AtomicResult {
            ty: ctx.type_map[ty],
            comparison: *comparison,
        },
        Expression::WorkGroupUniformLoadResult { ty } => {
            Expression::WorkGroupUniformLoadResult { ty: ctx.type_map[ty] }
        }
        Expression::ArrayLength(expr) => Expression::ArrayLength(e(expr)),
        Expression::SubgroupBallotResult => Expression::SubgroupBallotResult,
        Expression::SubgroupOperationResult { ty } => {
            Expression::SubgroupOperationResult { ty: ctx.type_map[ty] }
        }
        Expression::RayQueryProceedResult => Expression::RayQueryProceedResult,
        Expression::RayQueryGetIntersection { query, committed } => {
            Expression::RayQueryGetIntersection { query: e(query), committed: *committed }
        }
        Expression::RayQueryVertexPositions { query, committed } => {
            Expression::RayQueryVertexPositions { query: e(query), committed: *committed }
        }
        // Cooperative ops — unlikely in stdlib but handle for completeness
        Expression::CooperativeLoad { columns, rows, role, data } => {
            Expression::CooperativeLoad { columns: *columns, rows: *rows, role: *role, data: *data }
        }
        Expression::CooperativeMultiplyAdd { a, b, c } => {
            Expression::CooperativeMultiplyAdd { a: e(a), b: e(b), c: e(c) }
        }
    }
}

fn remap_sample_level(
    level: &naga::SampleLevel,
    expr_map: &HashMap<Handle<Expression>, Handle<Expression>>,
) -> naga::SampleLevel {
    match level {
        naga::SampleLevel::Auto => naga::SampleLevel::Auto,
        naga::SampleLevel::Zero => naga::SampleLevel::Zero,
        naga::SampleLevel::Exact(e) => naga::SampleLevel::Exact(expr_map[e]),
        naga::SampleLevel::Bias(e) => naga::SampleLevel::Bias(expr_map[e]),
        naga::SampleLevel::Gradient { x, y } => naga::SampleLevel::Gradient {
            x: expr_map[x],
            y: expr_map[y],
        },
    }
}

// ---------------------------------------------------------------------------
// Statement/Block remapping
// ---------------------------------------------------------------------------

fn remap_block(
    block: &Block,
    expr_map: &HashMap<Handle<Expression>, Handle<Expression>>,
    ctx: &TransplantCtx,
) -> Block {
    let stmts: Vec<_> = block
        .iter()
        .map(|stmt| remap_statement(stmt, expr_map, ctx))
        .collect();
    Block::from_vec(stmts)
}

fn remap_statement(
    stmt: &Statement,
    expr_map: &HashMap<Handle<Expression>, Handle<Expression>>,
    ctx: &TransplantCtx,
) -> Statement {
    let e = |h: &Handle<Expression>| expr_map[h];
    let oe = |h: &Option<Handle<Expression>>| h.map(|h| expr_map[&h]);

    match stmt {
        Statement::Emit(range) => {
            // Remap the range: map each handle in the source range to its new handle.
            // Expressions are appended in order so remapped handles stay contiguous.
            let new_handles: Vec<_> = range.clone().map(|h| expr_map[&h]).collect();
            // Emit ranges must be non-empty; skip degenerate ranges
            let first = new_handles[0];
            let last = *new_handles.last().unwrap();
            Statement::Emit(Range::new_from_bounds(first, last))
        }
        Statement::Block(block) => Statement::Block(remap_block(block, expr_map, ctx)),
        Statement::If { condition, accept, reject } => Statement::If {
            condition: e(condition),
            accept: remap_block(accept, expr_map, ctx),
            reject: remap_block(reject, expr_map, ctx),
        },
        Statement::Switch { selector, cases } => Statement::Switch {
            selector: e(selector),
            cases: cases
                .iter()
                .map(|case| naga::SwitchCase {
                    value: case.value,
                    body: remap_block(&case.body, expr_map, ctx),
                    fall_through: case.fall_through,
                })
                .collect(),
        },
        Statement::Loop { body, continuing, break_if } => Statement::Loop {
            body: remap_block(body, expr_map, ctx),
            continuing: remap_block(continuing, expr_map, ctx),
            break_if: oe(break_if),
        },
        Statement::Break => Statement::Break,
        Statement::Continue => Statement::Continue,
        Statement::Return { value } => Statement::Return { value: oe(value) },
        Statement::Kill => Statement::Kill,
        Statement::ControlBarrier(b) => Statement::ControlBarrier(*b),
        Statement::MemoryBarrier(b) => Statement::MemoryBarrier(*b),
        Statement::Store { pointer, value } => Statement::Store {
            pointer: e(pointer),
            value: e(value),
        },
        Statement::ImageStore { image, coordinate, array_index, value } => Statement::ImageStore {
            image: e(image),
            coordinate: e(coordinate),
            array_index: oe(array_index),
            value: e(value),
        },
        Statement::Atomic { pointer, fun, value, result } => Statement::Atomic {
            pointer: e(pointer),
            fun: fun.clone(),
            value: e(value),
            result: oe(result),
        },
        Statement::Call { function, arguments, result } => Statement::Call {
            function: ctx.func_map[function],
            arguments: arguments.iter().map(&e).collect(),
            result: oe(result),
        },
        // Uncommon in stdlib — pass through
        other => other.clone(),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Collect all function handles called by statements in a block (non-recursive into sub-calls).
fn collect_called_functions(block: &Block) -> Vec<Handle<Function>> {
    let mut called = Vec::new();
    collect_calls_from_block(block, &mut called);
    called.sort_by_key(|h| h.index());
    called.dedup_by_key(|h| h.index());
    called
}

fn collect_calls_from_block(block: &Block, out: &mut Vec<Handle<Function>>) {
    for stmt in block.iter() {
        match stmt {
            Statement::Call { function, .. } => out.push(*function),
            Statement::Block(b) => collect_calls_from_block(b, out),
            Statement::If { accept, reject, .. } => {
                collect_calls_from_block(accept, out);
                collect_calls_from_block(reject, out);
            }
            Statement::Switch { cases, .. } => {
                for case in cases {
                    collect_calls_from_block(&case.body, out);
                }
            }
            Statement::Loop { body, continuing, .. } => {
                collect_calls_from_block(body, out);
                collect_calls_from_block(continuing, out);
            }
            _ => {}
        }
    }
}
