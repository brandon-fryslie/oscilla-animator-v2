use super::dsl::{Expr, FnBuilder, ModuleBuilder};
use std::num::NonZeroU32;
use wasm_bindgen_test::wasm_bindgen_test;

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
    let uniform_array = module.array_type(vec4_ty, Some(NonZeroU32::new(4).expect("non-zero")), 16);

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

#[wasm_bindgen_test]
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

#[wasm_bindgen_test]
fn module_builder_supports_non_compute_entrypoints() {
    let mut module = ModuleBuilder::new();
    let vec4_ty = module.vec4_f32_type();

    let mut vertex = FnBuilder::new("vertex_main");
    vertex.set_result(
        vec4_ty,
        Some(naga::Binding::BuiltIn(naga::BuiltIn::Position {
            invariant: false,
        })),
    );
    let vx = vertex.lit_f32(0.0);
    let vy = vertex.lit_f32(0.0);
    let vz = vertex.lit_f32(0.0);
    let vw = vertex.lit_f32(1.0);
    let clip = vertex.compose(vec4_ty, vec![vx, vy, vz, vw]);
    vertex.emit_return_value(clip);

    let mut fragment = FnBuilder::new("fragment_main");
    fragment.set_result(
        vec4_ty,
        Some(naga::Binding::Location {
            location: 0,
            interpolation: None,
            sampling: None,
            blend_src: None,
            per_primitive: false,
        }),
    );
    let fr = fragment.lit_f32(1.0);
    let fg = fragment.lit_f32(0.0);
    let fb = fragment.lit_f32(0.0);
    let fa = fragment.lit_f32(1.0);
    let color = fragment.compose(vec4_ty, vec![fr, fg, fb, fa]);
    fragment.emit_return_value(color);

    let vertex_index = module.add_vertex_entry("vertex_main", vertex);
    let fragment_index = module.add_fragment_entry("fragment_main", fragment);
    let module = module.finish();
    let wgsl = validate_and_emit(&module);

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
    assert!(wgsl.contains("@vertex"));
    assert!(wgsl.contains("@fragment"));
}

#[wasm_bindgen_test]
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

#[wasm_bindgen_test]
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

#[wasm_bindgen_test]
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

#[wasm_bindgen_test]
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

#[wasm_bindgen_test]
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

    function.emit_return();
    module.add_compute_entry("compute_main", [1, 1, 1], function);
    let _ = validate_and_emit(&module.finish());
}

#[wasm_bindgen_test]
#[should_panic(expected = "FnBuilder::break_if is only valid inside loop_body closures")]
fn break_if_panics_at_function_root() {
    let mut function = FnBuilder::new("compute_main");
    let cond = function.lit_bool(true);
    function.break_if(cond);
}

#[wasm_bindgen_test]
#[should_panic(expected = "FnBodyBuilder::break_if is only valid inside loop_body closures")]
fn break_if_panics_inside_if_then() {
    let (mut module, arena, _uniforms) = new_compute_builder();
    let mut function = FnBuilder::new("compute_main");
    let arena_expr = function.global(arena);
    let cond = function.lit_bool(true);

    function.if_then(cond, |body| {
        let idx = body.lit_u32(0);
        let value = body.lit_f32(1.0);
        body.store_buffer(arena_expr, idx, value);
        let break_cond = body.lit_bool(true);
        body.break_if(break_cond);
    });

    module.add_compute_entry("compute_main", [1, 1, 1], function);
}

#[wasm_bindgen_test]
#[should_panic(expected = "FnBodyBuilder::break_if is only valid inside loop_body closures")]
fn break_if_panics_inside_if_then_else() {
    let (mut module, arena, _uniforms) = new_compute_builder();
    let mut function = FnBuilder::new("compute_main");
    let arena_expr = function.global(arena);
    let cond = function.lit_bool(true);

    function.if_then_else(
        cond,
        |accept| {
            let idx = accept.lit_u32(0);
            let value = accept.lit_f32(1.0);
            accept.store_buffer(arena_expr, idx, value);
            let break_cond = accept.lit_bool(true);
            accept.break_if(break_cond);
        },
        |reject| {
            let idx = reject.lit_u32(1);
            let value = reject.lit_f32(2.0);
            reject.store_buffer(arena_expr, idx, value);
        },
    );

    module.add_compute_entry("compute_main", [1, 1, 1], function);
}
