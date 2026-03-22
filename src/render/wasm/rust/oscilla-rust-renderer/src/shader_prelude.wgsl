// [LAW:one-source-of-truth] Canonical hardened Bezier evaluation for all
// ParametricTemplates families (ribbon, closed-loop). Parsed via
// naga::front::wgsl::parse_str so the Rust builder can reference
// get_hardened_bezier_data as a Handle<Function>.
//
// Returns vec3<f32>(pos.x, pos.y, tangent_angle) where tangent_angle
// is atan2 of the normalized tangent. Falls back to central-difference
// when the analytical derivative collapses (cusp / coincident CPs).

fn get_hardened_bezier_data(p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>, t: f32) -> vec3<f32> {
    let u = 1.0 - t;
    let u2 = u * u;
    let t2 = t * t;

    let pos = (u2*u)*p0 + (3.0*u2*t)*p1 + (3.0*u*t2)*p2 + (t2*t)*p3;
    let analytical_tan = (3.0*u2)*(p1 - p0) + (6.0*u*t)*(p2 - p1) + (3.0*t2)*(p3 - p2);
    let tan_len = length(analytical_tan);

    var final_tangent: vec2<f32>;

    if (tan_len > 1e-5) {
        final_tangent = analytical_tan / tan_len;
    } else {
        // Fallback: Central Difference
        let t_a = clamp(t + 0.001, 0.0, 1.0);
        let t_b = clamp(t - 0.001, 0.0, 1.0);

        let u_a = 1.0 - t_a;
        let pos_a = (u_a*u_a*u_a)*p0 + (3.0*u_a*u_a*t_a)*p1 + (3.0*u_a*t_a*t_a)*p2 + (t_a*t_a*t_a)*p3;

        let u_b = 1.0 - t_b;
        let pos_b = (u_b*u_b*u_b)*p0 + (3.0*u_b*u_b*t_b)*p1 + (3.0*u_b*t_b*t_b)*p2 + (t_b*t_b*t_b)*p3;

        let secant = pos_a - pos_b;
        let secant_len = length(secant);

        if (secant_len > 1e-5) {
            final_tangent = secant / secant_len;
        } else {
            final_tangent = vec2<f32>(1.0, 0.0); // Absolute collapse guard
        }
    }

    return vec3<f32>(pos.x, pos.y, atan2(final_tangent.y, final_tangent.x));
}
