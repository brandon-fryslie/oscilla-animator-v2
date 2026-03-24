// [LAW:one-source-of-truth] Static WGSL kernels for Eulerian fluid dynamics.
// These are pre-compiled at engine init time and dispatched via DispatchKernel
// instructions from the TS compiler. No TS-side WGSL generation.

use crate::compute::{CompiledKernel, KernelRegistry};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Kernel WGSL sources
// ---------------------------------------------------------------------------

// [LAW:one-source-of-truth] Fluid kernels operate on @group(1) texture
// bindings resolved dynamically by DispatchKernel::execute. @group(0) carries
// the standard compiler simulation layout (arena/state/uniforms) which fluid
// kernels use for dt and grid-size parameters from global_controls.

/// Semi-Lagrangian advection of velocity through itself.
const FLUID_ADVECT_WGSL: &str = r#"
@group(0) @binding(0) var<storage, read> arena_in: array<u32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<u32>;
@group(0) @binding(2) var<storage, read> state_in: array<u32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<u32>;
@group(0) @binding(4) var<uniform> global_controls: array<vec4<f32>, 16>;

@group(1) @binding(0) var velocity_in: texture_storage_2d<rg32float, read>;
@group(1) @binding(1) var velocity_out: texture_storage_2d<rg32float, write>;

fn bilinear_sample_rg(tex: texture_storage_2d<rg32float, read>, pos: vec2<f32>, dims: vec2<f32>) -> vec2<f32> {
  let clamped = clamp(pos, vec2<f32>(0.5), dims - vec2<f32>(0.5));
  let base = vec2<i32>(floor(clamped - vec2<f32>(0.5)));
  let frac = fract(clamped - vec2<f32>(0.5));
  let s00 = textureLoad(tex, base).xy;
  let s10 = textureLoad(tex, base + vec2<i32>(1, 0)).xy;
  let s01 = textureLoad(tex, base + vec2<i32>(0, 1)).xy;
  let s11 = textureLoad(tex, base + vec2<i32>(1, 1)).xy;
  return mix(mix(s00, s10, frac.x), mix(s01, s11, frac.x), frac.y);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<u32>(textureDimensions(velocity_in));
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let dt = global_controls[1].x;
  let cell = vec2<f32>(f32(gid.x), f32(gid.y));
  let vel = textureLoad(velocity_in, vec2<i32>(gid.xy)).xy;
  let trace_pos = cell + vec2<f32>(0.5) - vel * dt;
  let advected = bilinear_sample_rg(velocity_in, trace_pos, vec2<f32>(dims));
  textureStore(velocity_out, vec2<i32>(gid.xy), vec4<f32>(advected, 0.0, 0.0));
}
"#;

/// Divergence of advected velocity field.
const FLUID_DIVERGENCE_WGSL: &str = r#"
@group(0) @binding(0) var<storage, read> arena_in: array<u32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<u32>;
@group(0) @binding(2) var<storage, read> state_in: array<u32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<u32>;
@group(0) @binding(4) var<uniform> global_controls: array<vec4<f32>, 16>;

@group(1) @binding(0) var velocity_in: texture_storage_2d<rg32float, read>;
@group(1) @binding(1) var divergence_out: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<u32>(textureDimensions(velocity_in));
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coord = vec2<i32>(gid.xy);
  let left  = textureLoad(velocity_in, max(coord - vec2<i32>(1, 0), vec2<i32>(0))).x;
  let right = textureLoad(velocity_in, min(coord + vec2<i32>(1, 0), vec2<i32>(dims) - vec2<i32>(1))).x;
  let down  = textureLoad(velocity_in, max(coord - vec2<i32>(0, 1), vec2<i32>(0))).y;
  let up    = textureLoad(velocity_in, min(coord + vec2<i32>(0, 1), vec2<i32>(dims) - vec2<i32>(1))).y;
  let div = 0.5 * ((right - left) + (up - down));
  textureStore(divergence_out, coord, vec4<f32>(div, 0.0, 0.0, 0.0));
}
"#;

/// Jacobi iteration for pressure Poisson equation.
const FLUID_JACOBI_WGSL: &str = r#"
@group(0) @binding(0) var<storage, read> arena_in: array<u32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<u32>;
@group(0) @binding(2) var<storage, read> state_in: array<u32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<u32>;
@group(0) @binding(4) var<uniform> global_controls: array<vec4<f32>, 16>;

@group(1) @binding(0) var pressure_in: texture_storage_2d<r32float, read>;
@group(1) @binding(1) var divergence_in: texture_storage_2d<r32float, read>;
@group(1) @binding(2) var pressure_out: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<u32>(textureDimensions(pressure_in));
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coord = vec2<i32>(gid.xy);
  let left  = textureLoad(pressure_in, max(coord - vec2<i32>(1, 0), vec2<i32>(0))).x;
  let right = textureLoad(pressure_in, min(coord + vec2<i32>(1, 0), vec2<i32>(dims) - vec2<i32>(1))).x;
  let down  = textureLoad(pressure_in, max(coord - vec2<i32>(0, 1), vec2<i32>(0))).x;
  let up    = textureLoad(pressure_in, min(coord + vec2<i32>(0, 1), vec2<i32>(dims) - vec2<i32>(1))).x;
  let div = textureLoad(divergence_in, coord).x;
  let pressure = (left + right + down + up - div) * 0.25;
  textureStore(pressure_out, coord, vec4<f32>(pressure, 0.0, 0.0, 0.0));
}
"#;

/// Gradient subtraction to project velocity to be divergence-free.
const FLUID_GRADIENT_SUBTRACT_WGSL: &str = r#"
@group(0) @binding(0) var<storage, read> arena_in: array<u32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<u32>;
@group(0) @binding(2) var<storage, read> state_in: array<u32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<u32>;
@group(0) @binding(4) var<uniform> global_controls: array<vec4<f32>, 16>;

@group(1) @binding(0) var velocity_in: texture_storage_2d<rg32float, read>;
@group(1) @binding(1) var pressure_in: texture_storage_2d<r32float, read>;
@group(1) @binding(2) var velocity_out: texture_storage_2d<rg32float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<u32>(textureDimensions(pressure_in));
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coord = vec2<i32>(gid.xy);
  let left  = textureLoad(pressure_in, max(coord - vec2<i32>(1, 0), vec2<i32>(0))).x;
  let right = textureLoad(pressure_in, min(coord + vec2<i32>(1, 0), vec2<i32>(dims) - vec2<i32>(1))).x;
  let down  = textureLoad(pressure_in, max(coord - vec2<i32>(0, 1), vec2<i32>(0))).x;
  let up    = textureLoad(pressure_in, min(coord + vec2<i32>(0, 1), vec2<i32>(dims) - vec2<i32>(1))).x;
  let grad = vec2<f32>(right - left, up - down) * 0.5;
  let vel = textureLoad(velocity_in, coord).xy;
  textureStore(velocity_out, coord, vec4<f32>(vel - grad, 0.0, 0.0));
}
"#;

// ---------------------------------------------------------------------------
// Kernel registration
// ---------------------------------------------------------------------------

/// Descriptor for registering a static fluid kernel.
struct FluidKernelSpec {
    kernel_id: &'static str,
    wgsl: &'static str,
    /// (param_name, binding_index, format, access) for each @group(1) binding.
    params: &'static [(
        &'static str,
        u32,
        wgpu::TextureFormat,
        wgpu::StorageTextureAccess,
    )],
}

// [LAW:one-source-of-truth] Kernel specs are the single authority for which
// parameter name maps to which binding index and texture format.
const FLUID_KERNEL_SPECS: &[FluidKernelSpec] = &[
    FluidKernelSpec {
        kernel_id: "fluid_advect",
        wgsl: FLUID_ADVECT_WGSL,
        params: &[
            (
                "velocity_in",
                0,
                wgpu::TextureFormat::Rg32Float,
                wgpu::StorageTextureAccess::ReadOnly,
            ),
            (
                "velocity_out",
                1,
                wgpu::TextureFormat::Rg32Float,
                wgpu::StorageTextureAccess::WriteOnly,
            ),
        ],
    },
    FluidKernelSpec {
        kernel_id: "fluid_divergence",
        wgsl: FLUID_DIVERGENCE_WGSL,
        params: &[
            (
                "velocity_in",
                0,
                wgpu::TextureFormat::Rg32Float,
                wgpu::StorageTextureAccess::ReadOnly,
            ),
            (
                "divergence_out",
                1,
                wgpu::TextureFormat::R32Float,
                wgpu::StorageTextureAccess::WriteOnly,
            ),
        ],
    },
    FluidKernelSpec {
        kernel_id: "fluid_jacobi",
        wgsl: FLUID_JACOBI_WGSL,
        params: &[
            (
                "pressure_in",
                0,
                wgpu::TextureFormat::R32Float,
                wgpu::StorageTextureAccess::ReadOnly,
            ),
            (
                "divergence_in",
                1,
                wgpu::TextureFormat::R32Float,
                wgpu::StorageTextureAccess::ReadOnly,
            ),
            (
                "pressure_out",
                2,
                wgpu::TextureFormat::R32Float,
                wgpu::StorageTextureAccess::WriteOnly,
            ),
        ],
    },
    FluidKernelSpec {
        kernel_id: "fluid_gradient_subtract",
        wgsl: FLUID_GRADIENT_SUBTRACT_WGSL,
        params: &[
            (
                "velocity_in",
                0,
                wgpu::TextureFormat::Rg32Float,
                wgpu::StorageTextureAccess::ReadOnly,
            ),
            (
                "pressure_in",
                1,
                wgpu::TextureFormat::R32Float,
                wgpu::StorageTextureAccess::ReadOnly,
            ),
            (
                "velocity_out",
                2,
                wgpu::TextureFormat::Rg32Float,
                wgpu::StorageTextureAccess::WriteOnly,
            ),
        ],
    },
];

/// Register all static fluid kernels into the given registry.
///
/// [LAW:single-enforcer] This is the single callsite that compiles and
/// registers fluid compute pipelines — no other path creates fluid kernels.
pub fn register_fluid_kernels(
    device: &wgpu::Device,
    compiler_simulation_layout: &wgpu::BindGroupLayout,
    registry: &mut KernelRegistry,
) {
    for spec in FLUID_KERNEL_SPECS {
        let entries: Vec<wgpu::BindGroupLayoutEntry> = spec
            .params
            .iter()
            .map(|&(_, binding, format, access)| wgpu::BindGroupLayoutEntry {
                binding,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::StorageTexture {
                    access,
                    format,
                    view_dimension: wgpu::TextureViewDimension::D2,
                },
                count: None,
            })
            .collect();

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some(spec.kernel_id),
            entries: &entries,
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some(spec.kernel_id),
            bind_group_layouts: &[compiler_simulation_layout, &bind_group_layout],
            push_constant_ranges: &[],
        });

        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some(spec.kernel_id),
            source: wgpu::ShaderSource::Wgsl(spec.wgsl.into()),
        });

        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some(spec.kernel_id),
            layout: Some(&pipeline_layout),
            module: &shader_module,
            entry_point: Some("main"),
            cache: None,
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        });

        let mut param_bindings = HashMap::new();
        for &(name, binding, _, _) in spec.params {
            param_bindings.insert(name.to_string(), binding);
        }

        registry.register(
            spec.kernel_id.to_string(),
            CompiledKernel {
                pipeline,
                bind_group_layout,
                workgroup_size: [8, 8, 1],
                param_bindings,
            },
        );
    }
}
