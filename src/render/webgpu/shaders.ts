/**
 * WebGPU shader sources.
 *
 * [LAW:one-source-of-truth] WGSL sources are centralized here so both
 * pipeline construction and tests share one canonical shader definition.
 */

export const WEBGPU_RENDER_CONTRACT = Object.freeze({
  sceneUniformFloats: 8,
  sceneUniformBytes: 8 * Float32Array.BYTES_PER_ELEMENT,
  instanceFloats: 12,
  instanceBytes: 12 * Float32Array.BYTES_PER_ELEMENT,
  sceneBindGroup: 0,
  sceneBinding: 0,
  instanceBindGroup: 1,
  instanceBinding: 0,
  topologyBankBindGroup: 2,
  topologyBankBinding: 0,
  topologyBankFlagsWord: 3,
  topologyBankFlagClosed: 1 << 0,
  computeBindGroup: 0,
  computeSrcStateBinding: 0,
  computeDstStateBinding: 1,
  computeParamsBinding: 2,
  computeMigrationBindGroup: 0,
  computeMigrationSrcBinding: 0,
  computeMigrationDstBinding: 1,
  computeMigrationParamsBinding: 2,
  computeParamsFloats: 4,
  computeMigrationParamsU32: 4,
  inputHeaderBytes: 256,
  inputHeaderTimeOffsetBytes: 0x00,
  inputHeaderDeltaTimeOffsetBytes: 0x04,
  inputHeaderFrameCountOffsetBytes: 0x08,
  inputHeaderResolutionXOffsetBytes: 0x0c,
  inputHeaderResolutionYOffsetBytes: 0x10,
  inputHeaderMouseXOffsetBytes: 0x14,
  inputHeaderMouseYOffsetBytes: 0x18,
  inputHeaderMouseButtonsOffsetBytes: 0x1c,
  inputHeaderAudioLowOffsetBytes: 0x20,
  inputHeaderAudioMidOffsetBytes: 0x24,
  inputHeaderAudioHighOffsetBytes: 0x28,
  inputHeaderGaugeActiveOffsetBytes: 0x2c,
  inputHeaderSimStateOffset: 16,
  computeWorkgroupSize: 64,
  computeMigrationWorkgroupSize: 64,
  simulationCapacity: 65_536,
  indirectArgsWords: 5,
  indirectArgsBytes: 5 * Uint32Array.BYTES_PER_ELEMENT,
  drawPrepBindGroup: 0,
  drawPrepIndirectBinding: 0,
  drawPrepParamsBinding: 1,
  drawPrepParamsU32: 8,
  drawPrepWorkgroupSize: 1,
  renderMsaaSampleCount: 4,
} as const);

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
  // transform1 = [scale2X, scale2Y, topologyWordOffset, _]
  transform1: vec4<f32>,
  // color = [h, c, l, a] where h is turns and c/l/a are normalized
  color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var<storage, read> instances: array<InstanceData>;
@group(2) @binding(0) var<storage, read> topologyBank: array<u32>;

struct VertexInput {
  @location(0) localPos: vec2<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

fn oklch_to_linear_srgb(h: f32, c: f32, l: f32) -> vec3<f32> {
  let hue = fract(h) * 6.283185307179586;
  let a = c * cos(hue);
  let b = c * sin(hue);

  let l_prime = l + 0.3963377774 * a + 0.2158037573 * b;
  let m_prime = l - 0.1055613458 * a - 0.0638541728 * b;
  let s_prime = l - 0.0894841775 * a - 1.2914855480 * b;

  let l3 = l_prime * l_prime * l_prime;
  let m3 = m_prime * m_prime * m_prime;
  let s3 = s_prime * s_prime * s_prime;

  let x = 1.2270138511035211 * l3 - 0.5577999806518222 * m3 + 0.2812561489664678 * s3;
  let y = -0.0405801784232806 * l3 + 1.11225686961683 * m3 - 0.0716766786656012 * s3;
  let z = -0.0763812845057069 * l3 - 0.4214819784180127 * m3 + 1.5861632204407947 * s3;

  return vec3<f32>(
    3.240969941904521 * x - 1.537383177570093 * y - 0.498610760293 * z,
    -0.96924363628087 * x + 1.87596750150772 * y + 0.041555057407175 * z,
    0.055630079696993 * x - 0.20397695888897 * y + 1.056971514242878 * z
  );
}

fn build_model_matrix(centerPx: vec2<f32>, scalePx: vec2<f32>, rotationRad: f32) -> mat3x3<f32> {
  let c = cos(rotationRad);
  let s = sin(rotationRad);
  let scaleRotate = mat3x3<f32>(
    vec3<f32>(c * scalePx.x, s * scalePx.x, 0.0),
    vec3<f32>(-s * scalePx.y, c * scalePx.y, 0.0),
    vec3<f32>(0.0, 0.0, 1.0)
  );
  let translate = mat3x3<f32>(
    vec3<f32>(1.0, 0.0, 0.0),
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(centerPx.x, centerPx.y, 1.0)
  );
  return translate * scaleRotate;
}

fn build_view_projection_matrix(viewportPx: vec2<f32>, panPx: vec2<f32>, zoom: f32) -> mat3x3<f32> {
  let viewTranslate = (viewportPx * 0.5) * (1.0 - zoom) + (panPx * zoom);
  let view = mat3x3<f32>(
    vec3<f32>(zoom, 0.0, 0.0),
    vec3<f32>(0.0, zoom, 0.0),
    vec3<f32>(viewTranslate.x, viewTranslate.y, 1.0)
  );
  // [LAW:single-enforcer] Aspect correction is owned by the View->Clip matrix.
  let viewToClip = mat3x3<f32>(
    vec3<f32>(2.0 / viewportPx.x, 0.0, 0.0),
    vec3<f32>(0.0, -2.0 / viewportPx.y, 0.0),
    vec3<f32>(-1.0, 1.0, 1.0)
  );
  return viewToClip * view;
}

@vertex
fn vs_main(input: VertexInput, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  let inst = instances[instanceIndex];
  let topologyWordOffset = u32(max(inst.transform1.z, 0.0));
  let topologyFlags = topologyBank[
    topologyWordOffset + ${WEBGPU_RENDER_CONTRACT.topologyBankFlagsWord}u
  ];
  let closedMask = select(0.0, 1.0, (topologyFlags & ${WEBGPU_RENDER_CONTRACT.topologyBankFlagClosed}u) != 0u);
  let viewportPx = scene.v0.xy;
  let panPx = scene.v0.zw;
  let zoom = scene.v1.x;
  let viewportMinPx = scene.v1.y;

  let centerPx = inst.transform0.xy * viewportPx;
  let scalePx = vec2<f32>(
    inst.transform0.z * inst.transform1.x,
    inst.transform0.z * inst.transform1.y
  ) * viewportMinPx;
  let localPos = vec3<f32>(input.localPos, 1.0);
  let model = build_model_matrix(centerPx, scalePx, inst.transform0.w);
  let viewProjection = build_view_projection_matrix(viewportPx, panPx, zoom);
  // [LAW:dataflow-not-control-flow] Canonical transform chain is fixed:
  // p_clip = VP * (M * p_local)
  let clipPos = viewProjection * (model * localPos);

  var output: VertexOutput;
  output.position = vec4<f32>(clipPos.xy, 0.0, 1.0);
  let safeH = select(0.0, inst.color.x, inst.color.x == inst.color.x);
  let safeC = max(0.0, select(0.0, inst.color.y, inst.color.y == inst.color.y));
  let safeL = clamp(select(0.0, inst.color.z, inst.color.z == inst.color.z), 0.0, 1.0);
  let safeA = clamp(select(1.0, inst.color.w, inst.color.w == inst.color.w), 0.0, 1.0);
  let safeRgb = clamp(oklch_to_linear_srgb(safeH, safeC, safeL), vec3<f32>(0.0), vec3<f32>(1.0));
  output.color = vec4<f32>(safeRgb, safeA) * (1.0 + closedMask * 0.0);
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  // [LAW:single-enforcer] Fragment stage outputs premultiplied alpha so browser
  // compositing and pipeline blending share one canonical alpha contract.
  return vec4<f32>(input.color.rgb * input.color.a, input.color.a);
}
`;

export const SIMULATION_MIGRATION_COMPUTE_WGSL = /* wgsl */ `
struct MigrationParams {
  // v0 = [wordCount, _, _, _]
  v0: vec4<u32>,
};

@group(0) @binding(0) var<storage, read> srcWords: array<u32>;
@group(0) @binding(1) var<storage, read_write> dstWords: array<u32>;
@group(0) @binding(2) var<uniform> migrationParams: MigrationParams;

@compute @workgroup_size(${WEBGPU_RENDER_CONTRACT.computeMigrationWorkgroupSize})
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let wordCount = migrationParams.v0.x;
  if (gid.x >= wordCount) {
    return;
  }
  dstWords[gid.x] = srcWords[gid.x];
}
`;

export const SIMULATION_COMPUTE_WGSL = /* wgsl */ `
struct SimState {
  position: vec2<f32>,
  velocity: vec2<f32>,
};

struct SimParams {
  // v0 = [activeCount, dtSeconds, damping, capacity]
  v0: vec4<f32>,
};

@group(0) @binding(0) var<storage, read> srcState: array<SimState>;
@group(0) @binding(1) var<storage, read_write> dstState: array<SimState>;
@group(0) @binding(2) var<uniform> simParams: SimParams;

@compute @workgroup_size(${WEBGPU_RENDER_CONTRACT.computeWorkgroupSize})
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let capacity = u32(simParams.v0.w);
  if (gid.x >= capacity) {
    return;
  }

  let activeCount = u32(simParams.v0.x);
  if (gid.x >= activeCount) {
    return;
  }

  let dt = simParams.v0.y;
  let damping = simParams.v0.z;

  let stateIndex = gid.x + ${WEBGPU_RENDER_CONTRACT.inputHeaderSimStateOffset}u;
  var state = srcState[stateIndex];
  state.position = state.position + state.velocity * dt;
  state.velocity = state.velocity * damping;
  dstState[stateIndex] = state;
}
`;

export const DRAW_PREP_COMPUTE_WGSL = /* wgsl */ `
struct DrawPrepParams {
  // v0 = [indexCount, instanceCount, firstIndex, baseVertexBits]
  v0: vec4<u32>,
  // v1 = [firstInstance, recordIndex, maxRecords, _]
  v1: vec4<u32>,
};

@group(0) @binding(0) var<storage, read_write> indirectArgs: array<u32>;
@group(0) @binding(1) var<uniform> drawPrepParams: DrawPrepParams;

@compute @workgroup_size(${WEBGPU_RENDER_CONTRACT.drawPrepWorkgroupSize})
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x > 0u) {
    return;
  }

  let recordIndex = drawPrepParams.v1.y;
  let maxRecords = drawPrepParams.v1.z;
  if (recordIndex >= maxRecords) {
    return;
  }

  let base = recordIndex * ${WEBGPU_RENDER_CONTRACT.indirectArgsWords}u;
  indirectArgs[base + 0u] = drawPrepParams.v0.x; // indexCount
  indirectArgs[base + 1u] = drawPrepParams.v0.y; // instanceCount
  indirectArgs[base + 2u] = drawPrepParams.v0.z; // firstIndex
  indirectArgs[base + 3u] = drawPrepParams.v0.w; // baseVertex bits
  indirectArgs[base + 4u] = drawPrepParams.v1.x; // firstInstance
}
`;

export function shaderUsesCanonicalVpMTransformChain(source: string = PATH_RENDER_WGSL): boolean {
  return source.includes('let clipPos = viewProjection * (model * localPos);');
}

export function shaderEncodesViewToClipAspectCorrection(source: string = PATH_RENDER_WGSL): boolean {
  return source.includes('2.0 / viewportPx.x') && source.includes('-2.0 / viewportPx.y');
}
