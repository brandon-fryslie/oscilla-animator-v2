#![allow(dead_code)]

use std::num::NonZeroU32;

pub type Expr = naga::Handle<naga::Expression>;

#[derive(Debug, Default)]
struct BlockState {
    block: naga::Block,
    pending_emit_start: Option<Expr>,
    pending_emit_end: Option<Expr>,
    break_if: Option<Expr>,
    uniform_source: Option<Expr>,
}

fn expression_requires_emit(expr: &naga::Expression) -> bool {
    !matches!(
        expr,
        naga::Expression::Literal(_)
            | naga::Expression::Constant(_)
            | naga::Expression::ZeroValue(_)
            | naga::Expression::FunctionArgument(_)
            | naga::Expression::GlobalVariable(_)
            | naga::Expression::LocalVariable(_)
            | naga::Expression::CallResult(_)
            | naga::Expression::AtomicResult { .. }
            | naga::Expression::WorkGroupUniformLoadResult { .. }
    )
}

pub struct ModuleBuilder {
    module: naga::Module,
}

impl Default for ModuleBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl ModuleBuilder {
    pub fn new() -> Self {
        Self {
            module: naga::Module::default(),
        }
    }

    pub fn finish(self) -> naga::Module {
        self.module
    }

    pub fn scalar_type(&mut self, kind: naga::ScalarKind) -> naga::Handle<naga::Type> {
        self.module.types.insert(
            naga::Type {
                name: None,
                inner: naga::TypeInner::Scalar(naga::Scalar { kind, width: 4 }),
            },
            naga::Span::UNDEFINED,
        )
    }

    pub fn atomic_type(&mut self, kind: naga::ScalarKind) -> naga::Handle<naga::Type> {
        self.module.types.insert(
            naga::Type {
                name: None,
                inner: naga::TypeInner::Atomic(naga::Scalar { kind, width: 4 }),
            },
            naga::Span::UNDEFINED,
        )
    }

    pub fn f32_type(&mut self) -> naga::Handle<naga::Type> {
        self.scalar_type(naga::ScalarKind::Float)
    }

    pub fn i32_type(&mut self) -> naga::Handle<naga::Type> {
        self.scalar_type(naga::ScalarKind::Sint)
    }

    pub fn u32_type(&mut self) -> naga::Handle<naga::Type> {
        self.scalar_type(naga::ScalarKind::Uint)
    }

    pub fn vector_type(
        &mut self,
        size: naga::VectorSize,
        kind: naga::ScalarKind,
    ) -> naga::Handle<naga::Type> {
        self.module.types.insert(
            naga::Type {
                name: None,
                inner: naga::TypeInner::Vector {
                    size,
                    scalar: naga::Scalar { kind, width: 4 },
                },
            },
            naga::Span::UNDEFINED,
        )
    }

    pub fn vec4_f32_type(&mut self) -> naga::Handle<naga::Type> {
        self.vector_type(naga::VectorSize::Quad, naga::ScalarKind::Float)
    }

    pub fn array_type(
        &mut self,
        base: naga::Handle<naga::Type>,
        size: Option<NonZeroU32>,
        stride: u32,
    ) -> naga::Handle<naga::Type> {
        let size = match size {
            Some(value) => naga::ArraySize::Constant(value),
            None => naga::ArraySize::Dynamic,
        };
        self.module.types.insert(
            naga::Type {
                name: None,
                inner: naga::TypeInner::Array { base, size, stride },
            },
            naga::Span::UNDEFINED,
        )
    }

    pub fn add_global_storage(
        &mut self,
        name: &str,
        ty: naga::Handle<naga::Type>,
        group: u32,
        binding: u32,
        access: naga::StorageAccess,
    ) -> naga::Handle<naga::GlobalVariable> {
        self.module.global_variables.append(
            naga::GlobalVariable {
                name: Some(name.to_owned()),
                space: naga::AddressSpace::Storage { access },
                binding: Some(naga::ResourceBinding { group, binding }),
                ty,
                init: None,
            },
            naga::Span::UNDEFINED,
        )
    }

    pub fn add_global_uniform(
        &mut self,
        name: &str,
        ty: naga::Handle<naga::Type>,
        group: u32,
        binding: u32,
    ) -> naga::Handle<naga::GlobalVariable> {
        self.module.global_variables.append(
            naga::GlobalVariable {
                name: Some(name.to_owned()),
                space: naga::AddressSpace::Uniform,
                binding: Some(naga::ResourceBinding { group, binding }),
                ty,
                init: None,
            },
            naga::Span::UNDEFINED,
        )
    }

    fn add_entry(
        &mut self,
        name: &str,
        stage: naga::ShaderStage,
        workgroup_size: [u32; 3],
        function: FnBuilder,
    ) -> usize {
        self.module.entry_points.push(naga::EntryPoint {
            name: name.to_owned(),
            stage,
            early_depth_test: None,
            workgroup_size,
            function: function.finish(),
        });
        self.module.entry_points.len() - 1
    }

    pub fn add_compute_entry(
        &mut self,
        name: &str,
        workgroup_size: [u32; 3],
        function: FnBuilder,
    ) -> usize {
        self.add_entry(name, naga::ShaderStage::Compute, workgroup_size, function)
    }

    pub fn add_vertex_entry(&mut self, name: &str, function: FnBuilder) -> usize {
        self.add_entry(name, naga::ShaderStage::Vertex, [0, 0, 0], function)
    }

    pub fn add_fragment_entry(&mut self, name: &str, function: FnBuilder) -> usize {
        self.add_entry(name, naga::ShaderStage::Fragment, [0, 0, 0], function)
    }

    pub fn sampler_type(&mut self, comparison: bool) -> naga::Handle<naga::Type> {
        self.module.types.insert(
            naga::Type {
                name: None,
                inner: naga::TypeInner::Sampler { comparison },
            },
            naga::Span::UNDEFINED,
        )
    }

    pub fn image_type(
        &mut self,
        dim: naga::ImageDimension,
        arrayed: bool,
        class: naga::ImageClass,
    ) -> naga::Handle<naga::Type> {
        self.module.types.insert(
            naga::Type {
                name: None,
                inner: naga::TypeInner::Image {
                    dim,
                    arrayed,
                    class,
                },
            },
            naga::Span::UNDEFINED,
        )
    }

    pub fn add_global_handle(
        &mut self,
        name: &str,
        ty: naga::Handle<naga::Type>,
        group: u32,
        binding: u32,
    ) -> naga::Handle<naga::GlobalVariable> {
        self.module.global_variables.append(
            naga::GlobalVariable {
                name: Some(name.to_owned()),
                space: naga::AddressSpace::Handle,
                binding: Some(naga::ResourceBinding { group, binding }),
                ty,
                init: None,
            },
            naga::Span::UNDEFINED,
        )
    }
}

pub struct FnBuilder {
    function: naga::Function,
    root: BlockState,
}

impl FnBuilder {
    pub fn new(name: &str) -> Self {
        Self {
            function: naga::Function {
                name: Some(name.to_owned()),
                ..naga::Function::default()
            },
            root: BlockState::default(),
        }
    }

    fn with_root<R>(&mut self, f: impl FnOnce(&mut FnBodyBuilder<'_>) -> R) -> R {
        let mut root = std::mem::take(&mut self.root);
        let mut builder = FnBodyBuilder {
            function: &mut self.function,
            state: root,
        };
        let out = f(&mut builder);
        root = builder.state;
        self.root = root;
        out
    }

    pub fn set_uniform_source(&mut self, uniform_source: Expr) {
        self.with_root(|b| b.set_uniform_source(uniform_source));
    }

    pub fn global(&mut self, handle: naga::Handle<naga::GlobalVariable>) -> Expr {
        self.with_root(|b| b.global(handle))
    }

    pub fn lit_f32(&mut self, v: f32) -> Expr {
        self.with_root(|b| b.lit_f32(v))
    }

    pub fn lit_u32(&mut self, v: u32) -> Expr {
        self.with_root(|b| b.lit_u32(v))
    }

    pub fn lit_i32(&mut self, v: i32) -> Expr {
        self.with_root(|b| b.lit_i32(v))
    }

    pub fn lit_bool(&mut self, v: bool) -> Expr {
        self.with_root(|b| b.lit_bool(v))
    }

    pub fn add(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.add(a, b))
    }

    pub fn sub(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.sub(a, b))
    }

    pub fn mul(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.mul(a, b))
    }

    pub fn div(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.div(a, b))
    }

    pub fn modulo(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.modulo(a, b))
    }

    pub fn neg(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.neg(a))
    }

    pub fn lt(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.lt(a, b))
    }

    pub fn le(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.le(a, b))
    }

    pub fn gt(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.gt(a, b))
    }

    pub fn ge(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.ge(a, b))
    }

    pub fn eq(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.eq(a, b))
    }

    pub fn ne(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.ne(a, b))
    }

    pub fn sin(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.sin(a))
    }

    pub fn cos(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.cos(a))
    }

    pub fn tan(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.tan(a))
    }

    pub fn floor(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.floor(a))
    }

    pub fn ceil(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.ceil(a))
    }

    pub fn round(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.round(a))
    }

    pub fn trunc(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.trunc(a))
    }

    pub fn abs(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.abs(a))
    }

    pub fn sqrt(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.sqrt(a))
    }

    pub fn clamp(&mut self, value: Expr, min: Expr, max: Expr) -> Expr {
        self.with_root(|inner| inner.clamp(value, min, max))
    }

    pub fn min(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.min(a, b))
    }

    pub fn max(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.max(a, b))
    }

    pub fn pow(&mut self, a: Expr, b: Expr) -> Expr {
        self.with_root(|inner| inner.pow(a, b))
    }

    pub fn fract(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.fract(a))
    }

    pub fn exp(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.exp(a))
    }

    pub fn log(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.log(a))
    }

    pub fn sign(&mut self, a: Expr) -> Expr {
        self.with_root(|inner| inner.sign(a))
    }

    pub fn atan2(&mut self, y: Expr, x: Expr) -> Expr {
        self.with_root(|inner| inner.atan2(y, x))
    }

    pub fn f32(&mut self, e: Expr) -> Expr {
        self.with_root(|inner| inner.f32(e))
    }

    pub fn u32(&mut self, e: Expr) -> Expr {
        self.with_root(|inner| inner.u32(e))
    }

    pub fn i32(&mut self, e: Expr) -> Expr {
        self.with_root(|inner| inner.i32(e))
    }

    pub fn compose(&mut self, ty: naga::Handle<naga::Type>, components: Vec<Expr>) -> Expr {
        self.with_root(move |inner| inner.compose(ty, components))
    }

    pub fn access(&mut self, base: Expr, index: Expr) -> Expr {
        self.with_root(|inner| inner.access(base, index))
    }

    pub fn load_buffer(&mut self, buffer: Expr, index: Expr) -> Expr {
        self.with_root(|inner| inner.load_buffer(buffer, index))
    }

    pub fn store_buffer(&mut self, buffer: Expr, index: Expr, value: Expr) {
        self.with_root(|inner| inner.store_buffer(buffer, index, value));
    }

    pub fn select(&mut self, cond: Expr, accept: Expr, reject: Expr) -> Expr {
        self.with_root(|inner| inner.select(cond, accept, reject))
    }

    pub fn access_index(&mut self, base: Expr, index: u32) -> Expr {
        self.with_root(|inner| inner.access_index(base, index))
    }

    pub fn texture_sample(&mut self, image: Expr, sampler: Expr, coordinate: Expr) -> Expr {
        self.with_root(|inner| inner.texture_sample(image, sampler, coordinate))
    }

    pub fn texture_sample_level(
        &mut self,
        image: Expr,
        sampler: Expr,
        coordinate: Expr,
        level: Expr,
    ) -> Expr {
        self.with_root(|inner| inner.texture_sample_level(image, sampler, coordinate, level))
    }

    pub fn texture_load(&mut self, image: Expr, coordinate: Expr, level: Option<Expr>) -> Expr {
        self.with_root(|inner| inner.texture_load(image, coordinate, level))
    }

    pub fn texture_store(&mut self, image: Expr, coordinate: Expr, value: Expr) {
        self.with_root(|inner| inner.texture_store(image, coordinate, value));
    }

    pub fn if_then<F>(&mut self, cond: Expr, body: F)
    where
        F: FnOnce(&mut FnBodyBuilder<'_>),
    {
        self.with_root(move |inner| inner.if_then(cond, body));
    }

    pub fn if_then_else<F, G>(&mut self, cond: Expr, accept: F, reject: G)
    where
        F: FnOnce(&mut FnBodyBuilder<'_>),
        G: FnOnce(&mut FnBodyBuilder<'_>),
    {
        self.with_root(move |inner| inner.if_then_else(cond, accept, reject));
    }

    pub fn loop_body<F>(&mut self, body: F)
    where
        F: FnOnce(&mut FnBodyBuilder<'_>),
    {
        self.with_root(move |inner| inner.loop_body(body));
    }

    pub fn break_if(&mut self, cond: Expr) {
        self.with_root(|inner| inner.break_if(cond));
    }

    pub fn emit_break(&mut self) {
        self.with_root(|inner| inner.emit_break());
    }

    pub fn emit_continue(&mut self) {
        self.with_root(|inner| inner.emit_continue());
    }

    pub fn emit_return(&mut self) {
        self.with_root(|inner| inner.emit_return());
    }

    pub fn buffer_address(
        &mut self,
        base: u32,
        lane: Expr,
        lane_stride: u32,
        component: u32,
        component_stride: u32,
    ) -> Expr {
        self.with_root(|inner| {
            inner.buffer_address(base, lane, lane_stride, component, component_stride)
        })
    }

    pub fn load_slot(
        &mut self,
        buffer: Expr,
        base: u32,
        lane: Expr,
        lane_stride: u32,
        component: u32,
        component_stride: u32,
    ) -> Expr {
        self.with_root(|inner| {
            inner.load_slot(buffer, base, lane, lane_stride, component, component_stride)
        })
    }

    pub fn store_slot(
        &mut self,
        buffer: Expr,
        base: u32,
        lane: Expr,
        lane_stride: u32,
        component: u32,
        component_stride: u32,
        value: Expr,
    ) {
        self.with_root(|inner| {
            inner.store_slot(
                buffer,
                base,
                lane,
                lane_stride,
                component,
                component_stride,
                value,
            )
        });
    }

    pub fn load_uniform(&mut self, vec4_index: u32, component: u32) -> Expr {
        self.with_root(|inner| inner.load_uniform(vec4_index, component))
    }

    pub fn fma(&mut self, a: Expr, b: Expr, c: Expr) -> Expr {
        self.with_root(|inner| inner.fma(a, b, c))
    }

    pub fn mix(&mut self, a: Expr, b: Expr, t: Expr) -> Expr {
        self.with_root(|inner| inner.mix(a, b, t))
    }

    pub fn saturate(&mut self, v: Expr) -> Expr {
        self.with_root(|inner| inner.saturate(v))
    }

    pub fn remap01(&mut self, v: Expr, lo: Expr, hi: Expr) -> Expr {
        self.with_root(|inner| inner.remap01(v, lo, hi))
    }

    pub fn bool_to_f32(&mut self, cond: Expr) -> Expr {
        self.with_root(|inner| inner.bool_to_f32(cond))
    }

    pub fn storage_barrier(&mut self) {
        self.with_root(|inner| inner.storage_barrier());
    }

    pub fn workgroup_barrier(&mut self) {
        self.with_root(|inner| inner.workgroup_barrier());
    }

    pub fn atomic_add(
        &mut self,
        pointer: Expr,
        value: Expr,
        result_type: naga::Handle<naga::Type>,
    ) -> Expr {
        self.with_root(|inner| inner.atomic_add(pointer, value, result_type))
    }

    pub fn atomic_exchange(
        &mut self,
        pointer: Expr,
        value: Expr,
        result_type: naga::Handle<naga::Type>,
    ) -> Expr {
        self.with_root(|inner| inner.atomic_exchange(pointer, value, result_type))
    }

    pub fn finish(mut self) -> naga::Function {
        let root = std::mem::take(&mut self.root);
        let root_builder = FnBodyBuilder {
            function: &mut self.function,
            state: root,
        };
        let (body, _) = root_builder.finish();
        self.function.body = body;
        self.function
    }
}

pub struct FnBodyBuilder<'a> {
    function: &'a mut naga::Function,
    state: BlockState,
}

impl<'a> FnBodyBuilder<'a> {
    fn append_expr(&mut self, expr: naga::Expression) -> Expr {
        let requires_emit = expression_requires_emit(&expr);
        if !requires_emit && self.state.pending_emit_start.is_some() {
            // [LAW:dataflow-not-control-flow] Expression emission remains
            // deterministic; we only split ranges to satisfy Naga scope rules.
            self.flush_pending_emits();
        }
        let handle = self
            .function
            .expressions
            .append(expr, naga::Span::UNDEFINED);
        if requires_emit {
            if self.state.pending_emit_start.is_none() {
                self.state.pending_emit_start = Some(handle);
            }
            self.state.pending_emit_end = Some(handle);
        }
        handle
    }

    fn flush_pending_emits(&mut self) {
        let Some(start) = self.state.pending_emit_start else {
            return;
        };
        let end = self
            .state
            .pending_emit_end
            .expect("pending emit end must exist when start exists");
        self.state.block.push(
            naga::Statement::Emit(naga::Range::new_from_bounds(start, end)),
            naga::Span::UNDEFINED,
        );
        self.state.pending_emit_start = None;
        self.state.pending_emit_end = None;
    }

    fn push_statement(&mut self, statement: naga::Statement) {
        self.flush_pending_emits();
        self.state.block.push(statement, naga::Span::UNDEFINED);
    }

    fn with_nested_block<R>(
        &mut self,
        f: impl FnOnce(&mut FnBodyBuilder<'_>) -> R,
    ) -> (naga::Block, Option<Expr>, R) {
        let mut nested = FnBodyBuilder {
            function: self.function,
            state: BlockState {
                uniform_source: self.state.uniform_source,
                ..BlockState::default()
            },
        };
        let out = f(&mut nested);
        let (block, break_if) = nested.finish();
        (block, break_if, out)
    }

    fn finish(mut self) -> (naga::Block, Option<Expr>) {
        self.flush_pending_emits();
        (self.state.block, self.state.break_if)
    }

    pub fn set_uniform_source(&mut self, uniform_source: Expr) {
        self.state.uniform_source = Some(uniform_source);
    }

    pub fn global(&mut self, handle: naga::Handle<naga::GlobalVariable>) -> Expr {
        self.append_expr(naga::Expression::GlobalVariable(handle))
    }

    pub fn lit_f32(&mut self, v: f32) -> Expr {
        self.append_expr(naga::Expression::Literal(naga::Literal::F32(v)))
    }

    pub fn lit_u32(&mut self, v: u32) -> Expr {
        self.append_expr(naga::Expression::Literal(naga::Literal::U32(v)))
    }

    pub fn lit_i32(&mut self, v: i32) -> Expr {
        self.append_expr(naga::Expression::Literal(naga::Literal::I32(v)))
    }

    pub fn lit_bool(&mut self, v: bool) -> Expr {
        self.append_expr(naga::Expression::Literal(naga::Literal::Bool(v)))
    }

    fn binary(&mut self, op: naga::BinaryOperator, left: Expr, right: Expr) -> Expr {
        self.append_expr(naga::Expression::Binary { op, left, right })
    }

    pub fn add(&mut self, a: Expr, b: Expr) -> Expr {
        self.binary(naga::BinaryOperator::Add, a, b)
    }

    pub fn sub(&mut self, a: Expr, b: Expr) -> Expr {
        self.binary(naga::BinaryOperator::Subtract, a, b)
    }

    pub fn mul(&mut self, a: Expr, b: Expr) -> Expr {
        self.binary(naga::BinaryOperator::Multiply, a, b)
    }

    pub fn div(&mut self, a: Expr, b: Expr) -> Expr {
        self.binary(naga::BinaryOperator::Divide, a, b)
    }

    pub fn modulo(&mut self, a: Expr, b: Expr) -> Expr {
        self.binary(naga::BinaryOperator::Modulo, a, b)
    }

    pub fn neg(&mut self, a: Expr) -> Expr {
        self.append_expr(naga::Expression::Unary {
            op: naga::UnaryOperator::Negate,
            expr: a,
        })
    }

    pub fn lt(&mut self, a: Expr, b: Expr) -> Expr {
        self.binary(naga::BinaryOperator::Less, a, b)
    }

    pub fn le(&mut self, a: Expr, b: Expr) -> Expr {
        self.binary(naga::BinaryOperator::LessEqual, a, b)
    }

    pub fn gt(&mut self, a: Expr, b: Expr) -> Expr {
        self.binary(naga::BinaryOperator::Greater, a, b)
    }

    pub fn ge(&mut self, a: Expr, b: Expr) -> Expr {
        self.binary(naga::BinaryOperator::GreaterEqual, a, b)
    }

    pub fn eq(&mut self, a: Expr, b: Expr) -> Expr {
        self.binary(naga::BinaryOperator::Equal, a, b)
    }

    pub fn ne(&mut self, a: Expr, b: Expr) -> Expr {
        self.binary(naga::BinaryOperator::NotEqual, a, b)
    }

    fn math(
        &mut self,
        fun: naga::MathFunction,
        arg: Expr,
        arg1: Option<Expr>,
        arg2: Option<Expr>,
        arg3: Option<Expr>,
    ) -> Expr {
        self.append_expr(naga::Expression::Math {
            fun,
            arg,
            arg1,
            arg2,
            arg3,
        })
    }

    pub fn sin(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Sin, a, None, None, None)
    }

    pub fn cos(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Cos, a, None, None, None)
    }

    pub fn tan(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Tan, a, None, None, None)
    }

    pub fn floor(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Floor, a, None, None, None)
    }

    pub fn ceil(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Ceil, a, None, None, None)
    }

    pub fn round(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Round, a, None, None, None)
    }

    pub fn trunc(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Trunc, a, None, None, None)
    }

    pub fn abs(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Abs, a, None, None, None)
    }

    pub fn sqrt(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Sqrt, a, None, None, None)
    }

    pub fn clamp(&mut self, value: Expr, min: Expr, max: Expr) -> Expr {
        self.math(naga::MathFunction::Clamp, value, Some(min), Some(max), None)
    }

    pub fn min(&mut self, a: Expr, b: Expr) -> Expr {
        self.math(naga::MathFunction::Min, a, Some(b), None, None)
    }

    pub fn max(&mut self, a: Expr, b: Expr) -> Expr {
        self.math(naga::MathFunction::Max, a, Some(b), None, None)
    }

    pub fn pow(&mut self, a: Expr, b: Expr) -> Expr {
        self.math(naga::MathFunction::Pow, a, Some(b), None, None)
    }

    pub fn fract(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Fract, a, None, None, None)
    }

    pub fn exp(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Exp, a, None, None, None)
    }

    pub fn log(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Log, a, None, None, None)
    }

    pub fn sign(&mut self, a: Expr) -> Expr {
        self.math(naga::MathFunction::Sign, a, None, None, None)
    }

    pub fn atan2(&mut self, y: Expr, x: Expr) -> Expr {
        self.math(naga::MathFunction::Atan2, y, Some(x), None, None)
    }

    pub fn f32(&mut self, e: Expr) -> Expr {
        self.append_expr(naga::Expression::As {
            expr: e,
            kind: naga::ScalarKind::Float,
            convert: Some(4),
        })
    }

    pub fn u32(&mut self, e: Expr) -> Expr {
        self.append_expr(naga::Expression::As {
            expr: e,
            kind: naga::ScalarKind::Uint,
            convert: Some(4),
        })
    }

    pub fn i32(&mut self, e: Expr) -> Expr {
        self.append_expr(naga::Expression::As {
            expr: e,
            kind: naga::ScalarKind::Sint,
            convert: Some(4),
        })
    }

    pub fn compose(&mut self, ty: naga::Handle<naga::Type>, components: Vec<Expr>) -> Expr {
        self.append_expr(naga::Expression::Compose { ty, components })
    }

    pub fn access(&mut self, base: Expr, index: Expr) -> Expr {
        self.append_expr(naga::Expression::Access { base, index })
    }

    pub fn load_buffer(&mut self, buffer: Expr, index: Expr) -> Expr {
        let pointer = self.access(buffer, index);
        self.append_expr(naga::Expression::Load { pointer })
    }

    pub fn store_buffer(&mut self, buffer: Expr, index: Expr, value: Expr) {
        let pointer = self.access(buffer, index);
        self.push_statement(naga::Statement::Store { pointer, value });
    }

    pub fn select(&mut self, cond: Expr, accept: Expr, reject: Expr) -> Expr {
        self.append_expr(naga::Expression::Select {
            condition: cond,
            accept,
            reject,
        })
    }

    pub fn access_index(&mut self, base: Expr, index: u32) -> Expr {
        self.append_expr(naga::Expression::AccessIndex { base, index })
    }

    pub fn texture_sample(&mut self, image: Expr, sampler: Expr, coordinate: Expr) -> Expr {
        self.append_expr(naga::Expression::ImageSample {
            image,
            sampler,
            gather: None,
            coordinate,
            array_index: None,
            offset: None,
            level: naga::SampleLevel::Auto,
            depth_ref: None,
        })
    }

    pub fn texture_sample_level(
        &mut self,
        image: Expr,
        sampler: Expr,
        coordinate: Expr,
        level: Expr,
    ) -> Expr {
        self.append_expr(naga::Expression::ImageSample {
            image,
            sampler,
            gather: None,
            coordinate,
            array_index: None,
            offset: None,
            level: naga::SampleLevel::Exact(level),
            depth_ref: None,
        })
    }

    pub fn texture_load(&mut self, image: Expr, coordinate: Expr, level: Option<Expr>) -> Expr {
        self.append_expr(naga::Expression::ImageLoad {
            image,
            coordinate,
            array_index: None,
            sample: None,
            level,
        })
    }

    pub fn texture_store(&mut self, image: Expr, coordinate: Expr, value: Expr) {
        self.push_statement(naga::Statement::ImageStore {
            image,
            coordinate,
            array_index: None,
            value,
        });
    }

    pub fn if_then<F>(&mut self, cond: Expr, body: F)
    where
        F: FnOnce(&mut FnBodyBuilder<'_>),
    {
        let (accept, _, _) = self.with_nested_block(body);
        self.push_statement(naga::Statement::If {
            condition: cond,
            accept,
            reject: naga::Block::new(),
        });
    }

    pub fn if_then_else<F, G>(&mut self, cond: Expr, accept: F, reject: G)
    where
        F: FnOnce(&mut FnBodyBuilder<'_>),
        G: FnOnce(&mut FnBodyBuilder<'_>),
    {
        let (accept_block, _, _) = self.with_nested_block(accept);
        let (reject_block, _, _) = self.with_nested_block(reject);
        self.push_statement(naga::Statement::If {
            condition: cond,
            accept: accept_block,
            reject: reject_block,
        });
    }

    pub fn loop_body<F>(&mut self, body: F)
    where
        F: FnOnce(&mut FnBodyBuilder<'_>),
    {
        let (loop_body, break_if, _) = self.with_nested_block(body);
        self.push_statement(naga::Statement::Loop {
            body: loop_body,
            continuing: naga::Block::new(),
            break_if,
        });
    }

    pub fn break_if(&mut self, cond: Expr) {
        self.state.break_if = Some(cond);
    }

    pub fn emit_break(&mut self) {
        self.push_statement(naga::Statement::Break);
    }

    pub fn emit_continue(&mut self) {
        self.push_statement(naga::Statement::Continue);
    }

    pub fn emit_return(&mut self) {
        self.push_statement(naga::Statement::Return { value: None });
    }

    pub fn buffer_address(
        &mut self,
        base: u32,
        lane: Expr,
        lane_stride: u32,
        component: u32,
        component_stride: u32,
    ) -> Expr {
        // [LAW:one-source-of-truth] Address math is centralized in one helper to
        // avoid divergent indexing formulas at callsites.
        let base_expr = self.lit_u32(base);
        let lane_stride_expr = self.lit_u32(lane_stride);
        let lane_offset = self.mul(lane, lane_stride_expr);
        let with_lane = self.add(base_expr, lane_offset);
        let component_expr = self.lit_u32(component);
        let component_stride_expr = self.lit_u32(component_stride);
        let component_offset = self.mul(component_expr, component_stride_expr);
        self.add(with_lane, component_offset)
    }

    pub fn load_slot(
        &mut self,
        buffer: Expr,
        base: u32,
        lane: Expr,
        lane_stride: u32,
        component: u32,
        component_stride: u32,
    ) -> Expr {
        let address = self.buffer_address(base, lane, lane_stride, component, component_stride);
        self.load_buffer(buffer, address)
    }

    pub fn store_slot(
        &mut self,
        buffer: Expr,
        base: u32,
        lane: Expr,
        lane_stride: u32,
        component: u32,
        component_stride: u32,
        value: Expr,
    ) {
        let address = self.buffer_address(base, lane, lane_stride, component, component_stride);
        self.store_buffer(buffer, address, value);
    }

    pub fn load_uniform(&mut self, vec4_index: u32, component: u32) -> Expr {
        let uniforms = self
            .state
            .uniform_source
            .expect("uniform source must be set before load_uniform");
        let vector_index = self.lit_u32(vec4_index);
        let vector_ptr = self.append_expr(naga::Expression::Access {
            base: uniforms,
            index: vector_index,
        });
        let component_ptr = self.append_expr(naga::Expression::AccessIndex {
            base: vector_ptr,
            index: component,
        });
        self.append_expr(naga::Expression::Load {
            pointer: component_ptr,
        })
    }

    pub fn fma(&mut self, a: Expr, b: Expr, c: Expr) -> Expr {
        let mul = self.mul(a, b);
        self.add(mul, c)
    }

    pub fn mix(&mut self, a: Expr, b: Expr, t: Expr) -> Expr {
        let delta = self.sub(b, a);
        let weighted = self.mul(delta, t);
        self.add(a, weighted)
    }

    pub fn saturate(&mut self, v: Expr) -> Expr {
        let lo = self.lit_f32(0.0);
        let hi = self.lit_f32(1.0);
        self.clamp(v, lo, hi)
    }

    pub fn remap01(&mut self, v: Expr, lo: Expr, hi: Expr) -> Expr {
        let numerator = self.sub(v, lo);
        let denominator = self.sub(hi, lo);
        self.div(numerator, denominator)
    }

    pub fn bool_to_f32(&mut self, cond: Expr) -> Expr {
        let zero = self.lit_f32(0.0);
        let one = self.lit_f32(1.0);
        self.select(cond, one, zero)
    }

    pub fn storage_barrier(&mut self) {
        self.push_statement(naga::Statement::Barrier(naga::Barrier::STORAGE));
    }

    pub fn workgroup_barrier(&mut self) {
        self.push_statement(naga::Statement::Barrier(naga::Barrier::WORK_GROUP));
    }

    pub fn atomic_add(
        &mut self,
        pointer: Expr,
        value: Expr,
        result_type: naga::Handle<naga::Type>,
    ) -> Expr {
        let result = self.append_expr(naga::Expression::AtomicResult {
            ty: result_type,
            comparison: false,
        });
        self.push_statement(naga::Statement::Atomic {
            pointer,
            fun: naga::AtomicFunction::Add,
            value,
            result,
        });
        result
    }

    pub fn atomic_exchange(
        &mut self,
        pointer: Expr,
        value: Expr,
        result_type: naga::Handle<naga::Type>,
    ) -> Expr {
        let result = self.append_expr(naga::Expression::AtomicResult {
            ty: result_type,
            comparison: false,
        });
        self.push_statement(naga::Statement::Atomic {
            pointer,
            fun: naga::AtomicFunction::Exchange { compare: None },
            value,
            result,
        });
        result
    }
}

#[cfg(test)]
mod tests {
    use super::{Expr, FnBuilder, ModuleBuilder};
    use std::num::NonZeroU32;

    fn validate_and_emit(module: &naga::Module) -> String {
        let info = naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        )
        .validate(module)
        .expect("module validation should succeed");

        naga::back::wgsl::write_string(module, &info, naga::back::wgsl::WriterFlags::empty())
            .expect("wgsl emission should succeed")
    }

    fn new_compute_builder() -> (
        ModuleBuilder,
        naga::Handle<naga::GlobalVariable>,
        naga::Handle<naga::GlobalVariable>,
    ) {
        let mut module = ModuleBuilder::new();
        let f32_ty = module.f32_type();
        let vec4_ty = module.vec4_f32_type();
        let storage_array = module.array_type(f32_ty, None, 4);
        let uniform_array =
            module.array_type(vec4_ty, Some(NonZeroU32::new(4).expect("non-zero")), 16);

        let arena = module.add_global_storage(
            "arena",
            storage_array,
            0,
            0,
            naga::StorageAccess::LOAD | naga::StorageAccess::STORE,
        );
        let uniforms = module.add_global_uniform("uniforms", uniform_array, 0, 4);

        (module, arena, uniforms)
    }

    #[test]
    fn builds_minimal_compute_module() {
        let (mut module, arena, _uniforms) = new_compute_builder();

        let mut function = FnBuilder::new("compute_main");
        let arena_expr = function.global(arena);
        let value = function.lit_f32(1.0);
        let index = function.lit_u32(0);
        function.store_buffer(arena_expr, index, value);
        function.emit_return();

        module.add_compute_entry("compute_main", [64, 1, 1], function);
        let wgsl = validate_and_emit(&module.finish());
        assert!(wgsl.contains("@compute"));
    }

    #[test]
    fn module_builder_supports_non_compute_entrypoints() {
        let mut module = ModuleBuilder::new();
        let vertex = FnBuilder::new("vertex_main");
        let fragment = FnBuilder::new("fragment_main");
        let vertex_index = module.add_vertex_entry("vertex_main", vertex);
        let fragment_index = module.add_fragment_entry("fragment_main", fragment);
        let module = module.finish();

        assert_eq!(vertex_index, 0);
        assert_eq!(fragment_index, 1);
        assert!(matches!(
            module.entry_points[vertex_index].stage,
            naga::ShaderStage::Vertex
        ));
        assert!(matches!(
            module.entry_points[fragment_index].stage,
            naga::ShaderStage::Fragment
        ));
    }

    #[test]
    fn texture_sample_helper_emits_image_sample_expression() {
        let mut module = ModuleBuilder::new();
        let sampled_image_ty = module.image_type(
            naga::ImageDimension::D2,
            false,
            naga::ImageClass::Sampled {
                kind: naga::ScalarKind::Float,
                multi: false,
            },
        );
        let sampler_ty = module.sampler_type(false);
        let vec2_f32_ty = module.vector_type(naga::VectorSize::Bi, naga::ScalarKind::Float);
        let arena_f32_ty = module.f32_type();
        let arena_array_ty = module.array_type(arena_f32_ty, None, 4);
        let sampled_image = module.add_global_handle("sampled_image", sampled_image_ty, 0, 0);
        let image_sampler = module.add_global_handle("image_sampler", sampler_ty, 0, 1);
        let arena = module.add_global_storage(
            "arena",
            arena_array_ty,
            0,
            2,
            naga::StorageAccess::LOAD | naga::StorageAccess::STORE,
        );

        let mut function = FnBuilder::new("compute_main");
        let sampled_image_expr = function.global(sampled_image);
        let sampler_expr = function.global(image_sampler);
        let arena_expr = function.global(arena);
        let uv_x = function.lit_f32(0.5);
        let uv_y = function.lit_f32(0.25);
        let uv = function.compose(vec2_f32_ty, vec![uv_x, uv_y]);
        let sampled = function.texture_sample(sampled_image_expr, sampler_expr, uv);
        let sampled_x = function.access_index(sampled, 0);
        let index = function.lit_u32(0);
        function.store_buffer(arena_expr, index, sampled_x);
        function.emit_return();

        module.add_compute_entry("compute_main", [1, 1, 1], function);
        let module = module.finish();
        let expressions = &module.entry_points[0].function.expressions;
        assert!(expressions.iter().any(|(_, expr)| matches!(
            expr,
            naga::Expression::ImageSample {
                level: naga::SampleLevel::Auto,
                ..
            }
        )));
    }

    #[test]
    fn arithmetic_and_math_helpers_emit_valid_expressions() {
        let (mut module, arena, uniforms) = new_compute_builder();
        let mut function = FnBuilder::new("compute_main");

        let arena_expr = function.global(arena);
        let uniform_expr = function.global(uniforms);
        function.set_uniform_source(uniform_expr);

        let lane = function.lit_u32(2);
        let lane_f = function.f32(lane);
        let sin_lane = function.sin(lane_f);
        let cos_lane = function.cos(lane_f);
        let tan_lane = function.tan(lane_f);
        let sin_plus_cos = function.add(sin_lane, cos_lane);
        let trig = function.add(sin_plus_cos, tan_lane);
        let half = function.lit_f32(0.5);
        let quarter = function.lit_f32(0.25);
        let folded = function.fma(trig, half, quarter);
        let neg_folded = function.neg(folded);
        let abs_folded = function.abs(neg_folded);
        let fract_folded = function.fract(abs_folded);
        let shaped = function.saturate(fract_folded);
        let zero = function.lit_f32(0.0);
        let one = function.lit_f32(1.0);
        let remapped = function.remap01(shaped, zero, one);
        let pow_exp = function.lit_f32(1.5);
        let powed = function.pow(remapped, pow_exp);
        let low_a = function.lit_f32(0.1);
        let low_b = function.lit_f32(0.9);
        let lo = function.min(low_a, low_b);
        let high_a = function.lit_f32(0.1);
        let high_b = function.lit_f32(0.9);
        let hi = function.max(high_a, high_b);
        let sqrt_powed = function.sqrt(powed);
        let clamped = function.clamp(sqrt_powed, lo, hi);
        let floor_clamped = function.floor(clamped);
        let ceil_clamped = function.ceil(clamped);
        let stepped = function.atan2(floor_clamped, ceil_clamped);
        let exp_stepped = function.exp(stepped);
        let log_stepped = function.log(exp_stepped);
        let rounded = function.round(log_stepped);
        let truncated = function.trunc(rounded);
        let signed = function.sign(truncated);

        let lane_as_u32 = function.u32(lane_f);
        let one_u32 = function.lit_u32(1);
        let cond = function.gt(lane_as_u32, one_u32);
        let selected = function.bool_to_f32(cond);
        let lerp_start = function.lit_f32(0.0);
        let lerp_t = function.lit_f32(0.75);
        let mixed = function.mix(lerp_start, selected, lerp_t);
        let final_value = function.add(mixed, signed);

        let idx = function.lit_u32(4);
        function.store_buffer(arena_expr, idx, final_value);

        let uniform_sample = function.load_uniform(0, 1);
        let uniform_store_idx = function.lit_u32(5);
        function.store_buffer(arena_expr, uniform_store_idx, uniform_sample);
        function.emit_return();

        module.add_compute_entry("compute_main", [32, 1, 1], function);
        let module = module.finish();

        let entry = &module.entry_points[0];
        let exprs = &entry.function.expressions;
        assert!(exprs
            .iter()
            .any(|(_, expr)| matches!(expr, naga::Expression::Math { .. })));
        assert!(exprs
            .iter()
            .any(|(_, expr)| matches!(expr, naga::Expression::Binary { .. })));
        assert!(exprs
            .iter()
            .any(|(_, expr)| matches!(expr, naga::Expression::Select { .. })));

        let _ = validate_and_emit(&module);
    }

    #[test]
    fn control_flow_helpers_emit_valid_statements() {
        let (mut module, arena, _uniforms) = new_compute_builder();
        let mut function = FnBuilder::new("compute_main");

        let arena_expr = function.global(arena);
        let lhs = function.lit_u32(1);
        let rhs = function.lit_u32(2);
        let cond = function.lt(lhs, rhs);

        function.if_then_else(
            cond,
            |body| {
                let index = body.lit_u32(0);
                let value = body.lit_f32(2.0);
                body.store_buffer(arena_expr, index, value);
            },
            |body| {
                let index = body.lit_u32(0);
                let value = body.lit_f32(3.0);
                body.store_buffer(arena_expr, index, value);
            },
        );

        function.loop_body(|body| {
            let index = body.lit_u32(1);
            let value = body.lit_f32(4.0);
            body.store_buffer(arena_expr, index, value);
            body.emit_continue();
            let should_break = body.lit_bool(true);
            body.break_if(should_break);
        });

        function.loop_body(|body| {
            let index = body.lit_u32(2);
            let value = body.lit_f32(5.0);
            body.store_buffer(arena_expr, index, value);
            body.emit_break();
        });

        function.emit_return();

        module.add_compute_entry("compute_main", [8, 1, 1], function);
        let module = module.finish();

        let statements = &module.entry_points[0].function.body;
        assert!(statements
            .iter()
            .any(|stmt| matches!(stmt, naga::Statement::If { .. })));
        assert!(statements
            .iter()
            .any(|stmt| matches!(stmt, naga::Statement::Loop { .. })));

        let wgsl = validate_and_emit(&module);
        assert!(wgsl.contains("continue;"));
        assert!(wgsl.contains("break;"));
    }

    fn expect_u32_literal(expressions: &naga::Arena<naga::Expression>, expr: Expr, value: u32) {
        match &expressions[expr] {
            naga::Expression::Literal(naga::Literal::U32(v)) => assert_eq!(*v, value),
            other => panic!("expected u32 literal {value}, got {other:?}"),
        }
    }

    #[test]
    fn address_helpers_generate_expected_index_formula() {
        let (mut module, arena, _uniforms) = new_compute_builder();
        let mut function = FnBuilder::new("compute_main");

        let arena_expr = function.global(arena);
        let lane = function.lit_u32(7);
        let address = function.buffer_address(10, lane, 4, 2, 8);
        let value = function.lit_f32(1.0);
        function.store_buffer(arena_expr, address, value);
        function.emit_return();

        module.add_compute_entry("compute_main", [16, 1, 1], function);
        let module = module.finish();

        let expressions = &module.entry_points[0].function.expressions;
        let root = &expressions[address];
        let (left, right) = match root {
            naga::Expression::Binary {
                op: naga::BinaryOperator::Add,
                left,
                right,
            } => (*left, *right),
            other => panic!("expected top-level add for address formula, got {other:?}"),
        };

        let (base_plus_lane, component_mul) = (left, right);

        match &expressions[base_plus_lane] {
            naga::Expression::Binary {
                op: naga::BinaryOperator::Add,
                left,
                right,
            } => {
                expect_u32_literal(expressions, *left, 10);
                match &expressions[*right] {
                    naga::Expression::Binary {
                        op: naga::BinaryOperator::Multiply,
                        left,
                        right,
                    } => {
                        assert_eq!(*left, lane);
                        expect_u32_literal(expressions, *right, 4);
                    }
                    other => panic!("expected lane multiply, got {other:?}"),
                }
            }
            other => panic!("expected base + lane term, got {other:?}"),
        }

        match &expressions[component_mul] {
            naga::Expression::Binary {
                op: naga::BinaryOperator::Multiply,
                left,
                right,
            } => {
                expect_u32_literal(expressions, *left, 2);
                expect_u32_literal(expressions, *right, 8);
            }
            other => panic!("expected component multiply term, got {other:?}"),
        }

        let _ = validate_and_emit(&module);
    }

    #[test]
    fn exercise_full_helper_surface() {
        let (mut module, arena, uniforms) = new_compute_builder();
        let u32_ty = module.u32_type();
        let vec2_f32_ty = module.vector_type(naga::VectorSize::Bi, naga::ScalarKind::Float);
        let vec2_i32_ty = module.vector_type(naga::VectorSize::Bi, naga::ScalarKind::Sint);
        let atomic_u32_ty = module.atomic_type(naga::ScalarKind::Uint);
        let atomic_array_ty = module.array_type(atomic_u32_ty, None, 4);
        let atomic_words = module.add_global_storage(
            "atomic_words",
            atomic_array_ty,
            0,
            2,
            naga::StorageAccess::LOAD | naga::StorageAccess::STORE,
        );
        let sampled_image_ty = module.image_type(
            naga::ImageDimension::D2,
            false,
            naga::ImageClass::Sampled {
                kind: naga::ScalarKind::Float,
                multi: false,
            },
        );
        let storage_image_ty = module.image_type(
            naga::ImageDimension::D2,
            false,
            naga::ImageClass::Storage {
                format: naga::StorageFormat::Rgba32Float,
                access: naga::StorageAccess::LOAD | naga::StorageAccess::STORE,
            },
        );
        let sampler_ty = module.sampler_type(false);
        let sampled_image = module.add_global_handle("sampled_image", sampled_image_ty, 0, 6);
        let storage_image = module.add_global_handle("storage_image", storage_image_ty, 0, 7);
        let image_sampler = module.add_global_handle("image_sampler", sampler_ty, 0, 8);
        let mut function = FnBuilder::new("compute_main");

        let arena_expr = function.global(arena);
        let uniforms_expr = function.global(uniforms);
        let atomic_expr = function.global(atomic_words);
        let sampled_image_expr = function.global(sampled_image);
        let storage_image_expr = function.global(storage_image);
        let sampler_expr = function.global(image_sampler);
        function.set_uniform_source(uniforms_expr);

        let a = function.lit_f32(2.0);
        let b = function.lit_f32(3.0);
        let sub = function.sub(a, b);
        let mul = function.mul(a, b);
        let div = function.div(a, b);
        let rem_l = function.lit_u32(9);
        let rem_r = function.lit_u32(4);
        let rem = function.modulo(rem_l, rem_r);
        let le_l = function.lit_u32(1);
        let le_r = function.lit_u32(2);
        let _le = function.le(le_l, le_r);
        let ge_l = function.lit_u32(3);
        let ge_r = function.lit_u32(2);
        let _ge = function.ge(ge_l, ge_r);
        let eq_l = function.lit_u32(5);
        let eq_r = function.lit_u32(5);
        let _eq = function.eq(eq_l, eq_r);
        let ne_l = function.lit_u32(5);
        let ne_r = function.lit_u32(6);
        let _ne = function.ne(ne_l, ne_r);
        let lane = function.lit_u32(1);
        let lane_i32 = function.i32(lane);
        let loaded = function.load_slot(arena_expr, 0, lane, 4, 0, 4);
        let idx = function.buffer_address(4, lane, 2, 1, 2);
        let vec4_idx = function.lit_u32(0);
        let vec4 = function.load_buffer(uniforms_expr, vec4_idx);
        let _component = function.access_index(vec4, 0);
        function.store_slot(arena_expr, 8, lane, 4, 0, 4, loaded);
        let mul_plus_div = function.add(mul, div);
        let aggregate = function.add(sub, mul_plus_div);
        function.store_buffer(arena_expr, idx, aggregate);
        let store_idx = function.lit_u32(12);
        let rem_as_f32 = function.f32(rem);
        function.store_buffer(arena_expr, store_idx, rem_as_f32);
        let lane_i32_as_f32 = function.f32(lane_i32);
        let lane_store_idx = function.lit_u32(14);
        function.store_buffer(arena_expr, lane_store_idx, lane_i32_as_f32);

        let uv_x = function.lit_f32(0.5);
        let uv_y = function.lit_f32(0.25);
        let uv = function.compose(vec2_f32_ty, vec![uv_x, uv_y]);
        let lod = function.lit_f32(0.0);
        let sampled_lod = function.texture_sample_level(sampled_image_expr, sampler_expr, uv, lod);
        let sampled_lod_y = function.access_index(sampled_lod, 1);
        let sampled_lod_store_idx = function.lit_u32(15);
        function.store_buffer(arena_expr, sampled_lod_store_idx, sampled_lod_y);

        let coord_x = function.lit_i32(0);
        let coord_y = function.lit_i32(0);
        let coord = function.compose(vec2_i32_ty, vec![coord_x, coord_y]);
        let texel = function.texture_load(storage_image_expr, coord, None);
        function.texture_store(storage_image_expr, coord, texel);
        function.storage_barrier();
        function.workgroup_barrier();

        let atomic_index = function.lit_u32(0);
        let atomic_ptr = function.access(atomic_expr, atomic_index);
        let one = function.lit_u32(1);
        let atomic_prev = function.atomic_add(atomic_ptr, one, u32_ty);
        let two = function.lit_u32(2);
        let atomic_prev_2 = function.atomic_exchange(atomic_ptr, two, u32_ty);
        let atomic_sum = function.add(atomic_prev, atomic_prev_2);
        let atomic_as_f32 = function.f32(atomic_sum);
        let atomic_store_idx = function.lit_u32(17);
        function.store_buffer(arena_expr, atomic_store_idx, atomic_as_f32);

        let condition = function.lit_bool(true);
        function.if_then(condition, |body| {
            let i = body.lit_u32(13);
            let v = body.lit_f32(7.0);
            body.store_buffer(arena_expr, i, v);
        });

        function.loop_body(|body| {
            let break_now = body.lit_bool(true);
            body.break_if(break_now);
        });
        function.loop_body(|body| {
            let break_now = body.lit_bool(true);
            body.emit_continue();
            body.break_if(break_now);
        });
        function.loop_body(|body| {
            body.emit_break();
        });
        let no_break = function.lit_bool(false);
        function.break_if(no_break);

        function.emit_return();
        module.add_compute_entry("compute_main", [1, 1, 1], function);
        let _ = validate_and_emit(&module.finish());
    }
}
