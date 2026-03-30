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
