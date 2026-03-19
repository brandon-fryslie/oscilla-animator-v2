# S03A: CubicBezierRibbon2D Naga AST Reference

This note preserves the architect-provided Uber Shader implementation reference verbatim for the first real Type 2 vertical slice.

If you are building the AST directly using the `naga` Rust crate instead of concatenating WGSL strings, you are operating at the absolute bleeding edge of WebGPU engine architecture. 

Generating the Uber Shader procedurally via Naga's AST allows you to dynamically inject exact Type 2 evaluation branches (like our `CubicBezierRibbon2D`) at startup based on what your `TopologyBank` requires, completely avoiding massive switch statements in static shader code.

In Naga, expressions are **Strictly SSA** (Static Single Assignment) and live in an `Arena<Expression>`. You don't "assign" variables; you build a graph of expression handles and then issue an `Emit` statement to the basic block.

Here is the precise Rust implementation using the `naga` API to construct the analytical 2.5D Cubic Bezier evaluation phase.

### The Rust Naga Lowering Module

This code assumes you have a builder context holding your `naga::Module` and the active `naga::Function`. It demonstrates how to fetch from the Compute Arena, calculate the polynomial, derive the tangent, and extrude the vertex.

```rust
use naga::{
    Arena, BinaryOperator, Block, Constant, ConstantInner, Expression, Handle, MathFunction,
    ScalarValue, Span, Statement, TypeInner, VectorSize,
};

pub struct UberShaderBuilder<'a> {
    pub module: &'a mut naga::Module,
    pub function: &'a mut naga::Function,
    pub block: &'a mut Block,
    // Pre-resolved handles
    pub arena_ptr: Handle<Expression>,
    pub param_offset: Handle<Expression>,
    pub t: Handle<Expression>,
    pub side: Handle<Expression>,
}

impl<'a> UberShaderBuilder<'a> {
    /// Injects the Type 2 Cubic Bezier evaluation into the Naga AST
    pub fn emit_cubic_bezier_evaluation(&mut self) -> Handle<Expression> {
        let span = Span::UNDEFINED;

        // --- 1. MEMORY LOADS (The Arena) ---
        // We statically unroll the reads for P0, P1, P2, P3, and Thickness
        // arena_parameters[param_offset + index]
        let p0 = self.load_vec2_from_arena(0);
        let p1 = self.load_vec2_from_arena(2);
        let p2 = self.load_vec2_from_arena(4);
        let p3 = self.load_vec2_from_arena(6);
        let thickness = self.load_scalar_from_arena(8);

        // --- 2. PRECOMPUTE SCALARS ---
        let const_one = self.lit_f32(1.0);
        let const_three = self.lit_f32(3.0);
        let const_six = self.lit_f32(6.0);

        // u = 1.0 - t
        let u = self.add_expr(Expression::Binary {
            op: BinaryOperator::Subtract,
            left: const_one,
            right: self.t,
        });

        // u^2, u^3, t^2, t^3
        let u2 = self.mul(u, u);
        let u3 = self.mul(u2, u);
        let t2 = self.mul(self.t, self.t);
        let t3 = self.mul(t2, self.t);

        // --- 3. EVALUATE POSITION B(t) ---
        // pos = (u^3)*P0 + (3*u^2*t)*P1 + (3*u*t^2)*P2 + (t^3)*P3
        let term0 = self.mul(u3, p0);
        
        let coeff1 = self.mul(self.mul(const_three, u2), self.t);
        let term1 = self.mul(coeff1, p1);
        
        let coeff2 = self.mul(self.mul(const_three, u), t2);
        let term2 = self.mul(coeff2, p2);
        
        let term3 = self.mul(t3, p3);

        let pos_half1 = self.add(term0, term1);
        let pos_half2 = self.add(term2, term3);
        let pos = self.add(pos_half1, pos_half2);

        // --- 4. EVALUATE DERIVATIVE B'(t) ---
        // tangent = 3*u^2*(P1-P0) + 6*u*t*(P2-P1) + 3*t^2*(P3-P2)
        let p1_minus_p0 = self.sub(p1, p0);
        let p2_minus_p1 = self.sub(p2, p1);
        let p3_minus_p2 = self.sub(p3, p2);

        let tan_coeff0 = self.mul(const_three, u2);
        let tan_coeff1 = self.mul(self.mul(const_six, u), self.t);
        let tan_coeff2 = self.mul(const_three, t2);

        let tan_term0 = self.mul(tan_coeff0, p1_minus_p0);
        let tan_term1 = self.mul(tan_coeff1, p2_minus_p1);
        let tan_term2 = self.mul(tan_coeff2, p3_minus_p2);

        let raw_tangent = self.add(self.add(tan_term0, tan_term1), tan_term2);

        // --- 5. THE NAN GUARD & NORMALIZE ---
        // safe_tangent = normalize(tangent + vec2(0.00001, 0.00001))
        let epsilon = self.lit_f32(0.00001);
        let epsilon_vec = self.add_expr(Expression::Compose {
            ty: self.vec2_type(),
            components: vec![epsilon, epsilon],
        });
        let safe_tangent_input = self.add(raw_tangent, epsilon_vec);
        let tangent_norm = self.add_expr(Expression::Math {
            fun: MathFunction::Normalize,
            arg: safe_tangent_input,
            arg1: None,
            arg2: None,
            arg3: None,
        });

        // --- 6. 2D NORMAL VECTOR ---
        // normal = vec2(-tangent.y, tangent.x)
        let tan_x = self.add_expr(Expression::AccessIndex { base: tangent_norm, index: 0 });
        let tan_y = self.add_expr(Expression::AccessIndex { base: tangent_norm, index: 1 });
        
        let neg_tan_y = self.add_expr(Expression::Binary {
            op: BinaryOperator::Multiply,
            left: tan_y,
            right: self.lit_f32(-1.0),
        });
        
        let normal = self.add_expr(Expression::Compose {
            ty: self.vec2_type(),
            components: vec![neg_tan_y, tan_x],
        });

        // --- 7. EXTRUSION ---
        // extruded_pos = pos + (normal * side * thickness * 0.5)
        let half = self.lit_f32(0.5);
        let extrude_magnitude = self.mul(self.mul(self.side, thickness), half);
        let extrude_vec = self.mul(normal, extrude_magnitude);
        
        let final_pos = self.add(pos, extrude_vec);

        // [CRITICAL NAGA RULE]: We must emit the expressions we just built 
        // into the basic block so the compiler knows they evaluate here.
        self.block.push(Statement::Emit(self.function.expressions.range_from(pos.index()..)), span);

        final_pos
    }

    // --- NAGA AST UTILITIES ---

    fn load_scalar_from_arena(&mut self, offset: u32) -> Handle<Expression> {
        let offset_expr = self.lit_u32(offset);
        let index_expr = self.add_expr(Expression::Binary {
            op: BinaryOperator::Add,
            left: self.param_offset,
            right: offset_expr,
        });
        
        let pointer = self.add_expr(Expression::Access {
            base: self.arena_ptr,
            index: index_expr,
        });

        self.add_expr(Expression::Load { pointer })
    }

    fn load_vec2_from_arena(&mut self, offset: u32) -> Handle<Expression> {
        let x = self.load_scalar_from_arena(offset);
        let y = self.load_scalar_from_arena(offset + 1);
        self.add_expr(Expression::Compose {
            ty: self.vec2_type(),
            components: vec![x, y],
        })
    }

    fn add_expr(&mut self, expr: Expression) -> Handle<Expression> {
        self.function.expressions.append(expr, Span::UNDEFINED)
    }

    fn lit_f32(&mut self, value: f32) -> Handle<Expression> {
        let handle = self.module.constants.append(Constant {
            name: None,
            specialization: None,
            inner: ConstantInner::Scalar {
                width: 4,
                value: ScalarValue::Float(value as f64),
            },
        });
        self.add_expr(Expression::Constant(handle))
    }

    fn lit_u32(&mut self, value: u32) -> Handle<Expression> {
        let handle = self.module.constants.append(Constant {
            name: None,
            specialization: None,
            inner: ConstantInner::Scalar {
                width: 4,
                value: ScalarValue::Uint(value as u64),
            },
        });
        self.add_expr(Expression::Constant(handle))
    }

    fn vec2_type(&mut self) -> naga::Handle<naga::Type> {
        self.module.types.insert(
            naga::Type {
                name: None,
                inner: TypeInner::Vector {
                    size: VectorSize::Bi,
                    scalar: naga::Scalar {
                        kind: naga::ScalarKind::Float,
                        width: 4,
                    },
                },
            },
            Span::UNDEFINED,
        )
    }

    // Helper math ops for cleaner code
    fn add(&mut self, left: Handle<Expression>, right: Handle<Expression>) -> Handle<Expression> {
        self.add_expr(Expression::Binary { op: BinaryOperator::Add, left, right })
    }
    fn sub(&mut self, left: Handle<Expression>, right: Handle<Expression>) -> Handle<Expression> {
        self.add_expr(Expression::Binary { op: BinaryOperator::Subtract, left, right })
    }
    fn mul(&mut self, left: Handle<Expression>, right: Handle<Expression>) -> Handle<Expression> {
        self.add_expr(Expression::Binary { op: BinaryOperator::Multiply, left, right })
    }
}
```

### Why doing this in Rust/Naga is the "God Mode" of rendering:

If you are orchestrating this directly in Rust, you have completely eliminated WGSL string parsing at runtime for your Uber Shader generation. 

Notice how `load_scalar_from_arena` directly constructs the pointer arithmetic (`Access` -> `Load`). When WebGPU's internal drivers (like `wgpu` compiling down to Metal/Vulkan) receive this, the Naga AST is already perfectly formed SSA. The driver will aggressively optimize the `t2`, `t3`, `u2`, and `u3` derivations using hardware-level instruction collapsing (CSE). 

This is how you get your CPU to build a 2.5D topological morphing shader in fractions of a millisecond and execute it on the GPU with zero string manipulation overhead.
