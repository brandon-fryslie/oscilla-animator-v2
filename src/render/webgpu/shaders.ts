/**
 * WebGPU shader sources.
 *
 * [LAW:one-source-of-truth] WGSL sources are centralized here so both
 * pipeline construction and tests share one canonical shader definition.
 */

export const PATH_RENDER_WGSL = /* wgsl */ `
struct SceneUniforms {
  // v0 = [viewportWidthPx, viewportHeightPx, panXPx, panYPx]
  v0: vec4<f32>,
  // v1 = [zoom, viewportMinPx, _, _]
  v1: vec4<f32>,
};

struct InstanceData {
  // transform0 = [posXNorm, posYNorm, sizeNorm, rotationRad]
  transform0: vec4<f32>,
  // transform1 = [scale2X, scale2Y, _, _]
  transform1: vec4<f32>,
  // color = [r, g, b, a] in 0..1
  color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var<storage, read> instances: array<InstanceData>;

struct VertexInput {
  @location(0) localPos: vec2<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(input: VertexInput, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  let inst = instances[instanceIndex];
  let viewportPx = scene.v0.xy;
  let panPx = scene.v0.zw;
  let zoom = scene.v1.x;
  let viewportMinPx = scene.v1.y;

  let centerPx = inst.transform0.xy * viewportPx;
  let centeredPx = (centerPx - (viewportPx * 0.5)) * zoom + (viewportPx * 0.5) + (panPx * zoom);

  let localScaled = vec2<f32>(
    input.localPos.x * inst.transform0.z * inst.transform1.x,
    input.localPos.y * inst.transform0.z * inst.transform1.y
  ) * viewportMinPx * zoom;

  let c = cos(inst.transform0.w);
  let s = sin(inst.transform0.w);
  let rotatedPx = vec2<f32>(
    localScaled.x * c - localScaled.y * s,
    localScaled.x * s + localScaled.y * c
  );

  let finalPx = centeredPx + rotatedPx;
  let ndc = vec2<f32>(
    (finalPx.x / viewportPx.x) * 2.0 - 1.0,
    1.0 - (finalPx.y / viewportPx.y) * 2.0
  );

  var output: VertexOutput;
  output.position = vec4<f32>(ndc, 0.0, 1.0);
  output.color = inst.color;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return input.color;
}
`;

export const SIMULATION_COMPUTE_WGSL = /* wgsl */ `
struct SimState {
  position: vec2<f32>,
  velocity: vec2<f32>,
};

struct SimParams {
  // v0 = [activeCount, dtSeconds, damping, _]
  v0: vec4<f32>,
};

@group(0) @binding(0) var<storage, read> srcState: array<SimState>;
@group(0) @binding(1) var<storage, read_write> dstState: array<SimState>;
@group(0) @binding(2) var<uniform> simParams: SimParams;

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let activeCount = u32(simParams.v0.x);
  if (gid.x >= activeCount) {
    return;
  }

  let dt = simParams.v0.y;
  let damping = simParams.v0.z;

  var state = srcState[gid.x];
  state.position = state.position + state.velocity * dt;
  state.velocity = state.velocity * damping;
  dstState[gid.x] = state;
}
`;
