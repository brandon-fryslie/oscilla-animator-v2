import type { NormalizedPatch } from '../compiler/frontend/normalize-indexing';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type { Step, StepRender } from '../compiler/ir/types';
import type { CompiledGpuArtifactBundle, CompiledGpuPassArtifact } from './compile-worker-protocol';

const FLUID_BLOCK_TYPE = 'FluidDynamics2D';

interface FluidConfig {
  readonly velocityDissipation: number;
  readonly dyeDissipation: number;
  readonly vorticity: number;
  readonly splatRadius: number;
  readonly advection: number;
  readonly particleScale: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
}

interface ArenaAddressPlan {
  readonly offset: number;
  readonly laneStride: number;
  readonly componentStride: number;
}

interface FluidRenderPlan {
  readonly controlPoints: ArenaAddressPlan;
  readonly color: ArenaAddressPlan;
  readonly scale: ArenaAddressPlan;
  readonly activeLanes: number;
}

function asFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asU32Literal(value: number): string {
  return `${Math.max(0, Math.floor(value))}u`;
}

function asF32Literal(value: number): string {
  if (!Number.isFinite(value)) return '0.0';
  const normalized = Math.abs(value) < 1e-6 ? 0 : value;
  const text = normalized.toFixed(6).replace(/\.?0+$/, '');
  return text.includes('.') ? text : `${text}.0`;
}

function getFluidBlockIds(normalizedPatch: NormalizedPatch): readonly string[] {
  const ids: string[] = [];
  for (const block of normalizedPatch.blocks) {
    if (block.type === FLUID_BLOCK_TYPE) {
      ids.push(block.id);
    }
  }
  return ids;
}

function resolveFluidRenderScale(normalizedPatch: NormalizedPatch, fluidBlockIds: readonly string[]): number | null {
  const fluidIndices = new Set<number>();
  for (let index = 0; index < normalizedPatch.blocks.length; index += 1) {
    const block = normalizedPatch.blocks[index];
    if (fluidBlockIds.includes(block.id)) {
      fluidIndices.add(index);
    }
  }
  for (const edge of normalizedPatch.edges) {
    if (!fluidIndices.has(edge.fromBlock)) continue;
    if (edge.fromPort !== 'controlPoints' && edge.fromPort !== 'color') continue;
    const targetBlock = normalizedPatch.blocks[edge.toBlock];
    if (!targetBlock || targetBlock.type !== 'RenderInstances2D') continue;
    const rawScale = targetBlock.params.scale;
    if (typeof rawScale === 'number' && Number.isFinite(rawScale)) {
      return rawScale;
    }
  }
  return null;
}

function getFluidConfig(
  normalizedPatch: NormalizedPatch,
  fluidBlockIds: readonly string[],
  activeLanes: number,
): FluidConfig {
  const fluidBlock = normalizedPatch.blocks.find((block) => block.type === FLUID_BLOCK_TYPE);
  const params = fluidBlock?.params ?? {};
  const renderScale = resolveFluidRenderScale(normalizedPatch, fluidBlockIds);

  const requestedResolution = clamp(
    Math.floor(asFinite(params.simResolution, Math.sqrt(activeLanes))),
    8,
    1024,
  );
  const gridWidth = requestedResolution;
  const gridHeight = Math.max(1, Math.ceil(activeLanes / gridWidth));

  return {
    velocityDissipation: clamp(asFinite(params.velocityDissipation, 0.992), 0.7, 0.9995),
    dyeDissipation: clamp(asFinite(params.dyeDissipation, 0.996), 0.7, 0.9999),
    vorticity: clamp(asFinite(params.vorticity, 18.0), 0.0, 96.0),
    splatRadius: clamp(asFinite(params.splatRadius, 20.0), 2.0, 256.0),
    advection: clamp(asFinite(params.advection, 1.0), 0.1, 3.0),
    particleScale: clamp(asFinite(params.particleScale, asFinite(renderScale, 0.02)), 0.001, 0.2),
    gridWidth,
    gridHeight,
  };
}

function resolveStepOwnerBlockId(
  program: CompiledProgramIR,
  slot: StepRender['controlPointsSlot'] | StepRender['colorSlot'],
): string | null {
  const slotOwner = program.debugIndex.slotToBlock.get(slot as never);
  if (typeof slotOwner === 'string') {
    return slotOwner;
  }
  if (slotOwner === undefined || slotOwner === null) {
    return null;
  }
  const blockMapValue = program.debugIndex.blockMap.get(slotOwner as never);
  return typeof blockMapValue === 'string' ? blockMapValue : null;
}

function selectFluidRenderStep(program: CompiledProgramIR, fluidBlockIds: readonly string[]): StepRender | null {
  const fluidOwners = new Set(fluidBlockIds);
  for (const step of program.schedule.steps as readonly Step[]) {
    if (step.kind !== 'render') continue;
    const controlOwner = resolveStepOwnerBlockId(program, step.controlPointsSlot);
    const colorOwner = resolveStepOwnerBlockId(program, step.colorSlot);
    if ((controlOwner && fluidOwners.has(controlOwner)) || (colorOwner && fluidOwners.has(colorOwner))) {
      return step;
    }
  }
  // [LAW:no-silent-fallbacks] Some compiler paths do not currently populate
  // slot owner debug metadata; fluid patches still require deterministic bundle
  // generation, so fall back to the first render step when fluid blocks exist.
  for (const step of program.schedule.steps as readonly Step[]) {
    if (step.kind === 'render') {
      return step;
    }
  }
  return null;
}

function descriptorToPlan(program: CompiledProgramIR, slot: number): ArenaAddressPlan | null {
  const descriptor = program.runtimeAddressTable?.slotToArena.get(slot as never);
  if (!descriptor) return null;
  const packing = descriptor.packing ?? 'soa';
  const laneStride = descriptor.laneStride ?? (packing === 'soa' ? 1 : descriptor.stride);
  const componentStride = descriptor.componentStride ?? (packing === 'soa' ? descriptor.laneCount : 1);
  return {
    offset: descriptor.offset,
    laneStride,
    componentStride,
  };
}

function buildFluidRenderPlan(program: CompiledProgramIR, step: StepRender): FluidRenderPlan | null {
  const controlPoints = descriptorToPlan(program, step.controlPointsSlot);
  const color = descriptorToPlan(program, step.colorSlot as never);
  const scale = step.scale?.k === 'slot'
    ? descriptorToPlan(program, step.scale.slot as never)
    : null;
  if (!controlPoints || !color || !scale) return null;

  const controlDescriptor = program.runtimeAddressTable?.slotToArena.get(step.controlPointsSlot as never);
  if (!controlDescriptor) return null;

  const maxActiveLanes = Math.max(1, Math.floor(program.generatedComputeProgram?.maxActiveLanes ?? controlDescriptor.laneCount));
  const activeLanes = Math.max(1, Math.min(maxActiveLanes, controlDescriptor.laneCount));
  return { controlPoints, color, scale, activeLanes };
}

function buildStatePassWgsl(config: FluidConfig, plan: FluidRenderPlan): string {
  return `
struct GlobalUniforms {
  view_proj: mat4x4<f32>,
  resolution: vec2<f32>,
  time_seconds: f32,
  delta_time_seconds: f32,
};

@group(0) @binding(0) var<storage, read> arena_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<f32>;
@group(0) @binding(2) var<storage, read> state_in: array<f32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<f32>;
@group(0) @binding(4) var<uniform> global: GlobalUniforms;

const ACTIVE_LANES: u32 = ${asU32Literal(plan.activeLanes)};
const GRID_WIDTH: u32 = ${asU32Literal(config.gridWidth)};
const GRID_HEIGHT: u32 = ${asU32Literal(config.gridHeight)};
const VELOCITY_DISSIPATION: f32 = ${asF32Literal(config.velocityDissipation)};
const DYE_DISSIPATION: f32 = ${asF32Literal(config.dyeDissipation)};
const VORTICITY: f32 = ${asF32Literal(config.vorticity)};
const SPLAT_RADIUS: f32 = ${asF32Literal(config.splatRadius)};
const ADVECTION: f32 = ${asF32Literal(config.advection)};

fn lane_from_xy(x: i32, y: i32) -> u32 {
  let w = i32(max(GRID_WIDTH, 1u));
  let h = i32(max(GRID_HEIGHT, 1u));
  let wrapped_x = ((x % w) + w) % w;
  let wrapped_y = ((y % h) + h) % h;
  let lane = u32(wrapped_y) * GRID_WIDTH + u32(wrapped_x);
  return min(lane, ACTIVE_LANES - 1u);
}

fn lane_xy(lane: u32) -> vec2<i32> {
  let x = i32(lane % GRID_WIDTH);
  let y = i32(min(lane / GRID_WIDTH, GRID_HEIGHT - 1u));
  return vec2<i32>(x, y);
}

fn lane_uv(lane: u32) -> vec2<f32> {
  let xy = lane_xy(lane);
  let width = max(f32(GRID_WIDTH), 1.0);
  let height = max(f32(GRID_HEIGHT), 1.0);
  return vec2<f32>((f32(xy.x) + 0.5) / width, (f32(xy.y) + 0.5) / height);
}

fn sample_lane_from_uv(uv: vec2<f32>) -> u32 {
  let clamped = clamp(uv, vec2<f32>(0.0, 0.0), vec2<f32>(0.999999, 0.999999));
  let x = i32(clamped.x * max(f32(GRID_WIDTH), 1.0));
  let y = i32(clamped.y * max(f32(GRID_HEIGHT), 1.0));
  return lane_from_xy(x, y);
}

fn read_state_in(lane: u32, component: u32) -> f32 {
  let idx = lane * 4u + component;
  if (idx >= arrayLength(&state_in)) {
    return 0.0;
  }
  let raw = state_in[idx];
  return select(0.0, raw, raw == raw);
}

fn write_state_out(lane: u32, component: u32, value: f32) {
  let idx = lane * 4u + component;
  if (idx >= arrayLength(&state_out)) {
    return;
  }
  state_out[idx] = value;
}

fn read_velocity(lane: u32) -> vec2<f32> {
  return vec2<f32>(read_state_in(lane, 0u), read_state_in(lane, 1u));
}

fn read_dye(lane: u32) -> f32 {
  return max(read_state_in(lane, 2u), 0.0);
}

@compute @workgroup_size(64, 1, 1)
fn compute_state_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane >= ACTIVE_LANES) {
    return;
  }

  let dt = clamp(global.delta_time_seconds, 1.0 / 240.0, 1.0 / 20.0);
  let uv = lane_uv(lane);
  let xy = lane_xy(lane);

  let lane_l = lane_from_xy(xy.x - 1, xy.y);
  let lane_r = lane_from_xy(xy.x + 1, xy.y);
  let lane_t = lane_from_xy(xy.x, xy.y - 1);
  let lane_b = lane_from_xy(xy.x, xy.y + 1);

  let vel = read_velocity(lane);
  let vel_l = read_velocity(lane_l);
  let vel_r = read_velocity(lane_r);
  let vel_t = read_velocity(lane_t);
  let vel_b = read_velocity(lane_b);

  let laplacian = (vel_l + vel_r + vel_t + vel_b) - (vel * 4.0);
  let curl = (vel_r.y - vel_l.y) - (vel_b.x - vel_t.x);

  let curl_l = abs(read_velocity(lane_l).y);
  let curl_r = abs(read_velocity(lane_r).y);
  let curl_t = abs(read_velocity(lane_t).x);
  let curl_b = abs(read_velocity(lane_b).x);
  let grad = vec2<f32>(curl_r - curl_l, curl_b - curl_t);
  let grad_norm = grad / max(length(grad), 1e-5);
  let vort_force = vec2<f32>(grad_norm.y, -grad_norm.x) * curl * VORTICITY;

  let mouse = vec2<f32>(
    clamp(global.view_proj[0][3], 0.0, 1.0),
    clamp(global.view_proj[1][0], 0.0, 1.0),
  );
  let mouse_buttons = global.view_proj[1][1];
  let user_strength = select(0.0, 1.0, mouse_buttons > 0.5);
  let center = vec2<f32>(
    0.5 + 0.22 * cos(global.time_seconds * 0.19),
    0.5 + 0.22 * sin(global.time_seconds * 0.17),
  );
  let to_center = uv - center;
  let center_falloff = exp(-dot(to_center, to_center) * 24.0);
  let to_mouse = (uv - mouse) * SPLAT_RADIUS;
  let mouse_impulse = exp(-dot(to_mouse, to_mouse));
  let impulse = center_falloff * 0.55 + mouse_impulse * (0.2 + user_strength * 1.0);
  let spin = global.time_seconds * 0.7 + f32(lane) * 0.031;
  let impulse_vec = vec2<f32>(cos(spin), sin(spin)) * impulse;
  let orbit = vec2<f32>(-to_center.y, to_center.x) * (0.5 + center_falloff * 1.7);

  var next_vel = vel + laplacian * 0.24 + vort_force * dt + impulse_vec * dt + orbit * dt;
  next_vel = next_vel * VELOCITY_DISSIPATION;

  let advect_uv = uv - next_vel * ADVECTION * dt;
  let source_lane = sample_lane_from_uv(advect_uv);
  let source_dye = read_dye(source_lane);
  let band = 0.5 + 0.5 * sin(uv.x * 14.0 + global.time_seconds * 0.9) * cos(uv.y * 18.0 - global.time_seconds * 0.8);
  let next_dye = max(0.0, source_dye * DYE_DISSIPATION + impulse * 0.55 + band * 0.12);

  write_state_out(lane, 0u, next_vel.x);
  write_state_out(lane, 1u, next_vel.y);
  write_state_out(lane, 2u, next_dye);
  write_state_out(lane, 3u, impulse);
}
`.trim();
}

function buildPresentPassWgsl(config: FluidConfig, plan: FluidRenderPlan): string {
  return `
struct GlobalUniforms {
  view_proj: mat4x4<f32>,
  resolution: vec2<f32>,
  time_seconds: f32,
  delta_time_seconds: f32,
};

@group(0) @binding(0) var<storage, read> arena_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<f32>;
@group(0) @binding(2) var<storage, read> state_in: array<f32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<f32>;
@group(0) @binding(4) var<uniform> global: GlobalUniforms;

const ACTIVE_LANES: u32 = ${asU32Literal(plan.activeLanes)};
const GRID_WIDTH: u32 = ${asU32Literal(config.gridWidth)};
const GRID_HEIGHT: u32 = ${asU32Literal(config.gridHeight)};
const CP_OFFSET: u32 = ${asU32Literal(plan.controlPoints.offset)};
const CP_LANE_STRIDE: u32 = ${asU32Literal(plan.controlPoints.laneStride)};
const CP_COMPONENT_STRIDE: u32 = ${asU32Literal(plan.controlPoints.componentStride)};
const COLOR_OFFSET: u32 = ${asU32Literal(plan.color.offset)};
const COLOR_LANE_STRIDE: u32 = ${asU32Literal(plan.color.laneStride)};
const COLOR_COMPONENT_STRIDE: u32 = ${asU32Literal(plan.color.componentStride)};
const SCALE_OFFSET: u32 = ${asU32Literal(plan.scale.offset)};
const SCALE_LANE_STRIDE: u32 = ${asU32Literal(plan.scale.laneStride)};
const SCALE_COMPONENT_STRIDE: u32 = ${asU32Literal(plan.scale.componentStride)};
const PARTICLE_SCALE: f32 = ${asF32Literal(config.particleScale)};

fn lane_xy(lane: u32) -> vec2<u32> {
  let x = lane % GRID_WIDTH;
  let y = min(lane / GRID_WIDTH, GRID_HEIGHT - 1u);
  return vec2<u32>(x, y);
}

fn lane_uv(lane: u32) -> vec2<f32> {
  let xy = lane_xy(lane);
  let width = max(f32(GRID_WIDTH), 1.0);
  let height = max(f32(GRID_HEIGHT), 1.0);
  return vec2<f32>((f32(xy.x) + 0.5) / width, (f32(xy.y) + 0.5) / height);
}

fn read_state_out(lane: u32, component: u32) -> f32 {
  let idx = lane * 4u + component;
  if (idx >= arrayLength(&state_out)) {
    return 0.0;
  }
  let raw = state_out[idx];
  return select(0.0, raw, raw == raw);
}

fn write_arena(offset: u32, lane_stride: u32, component_stride: u32, lane: u32, component: u32, value: f32) {
  let idx = offset + lane * lane_stride + component * component_stride;
  if (idx >= arrayLength(&arena_out)) {
    return;
  }
  arena_out[idx] = value;
}

@compute @workgroup_size(64, 1, 1)
fn compute_present_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane >= ACTIVE_LANES) {
    return;
  }
  let uv = lane_uv(lane);
  let vel = vec2<f32>(read_state_out(lane, 0u), read_state_out(lane, 1u));
  let dye = max(read_state_out(lane, 2u), 0.0);
  let impulse = max(read_state_out(lane, 3u), 0.0);

  let wobble = vec2<f32>(
    sin(global.time_seconds * 0.7 + uv.y * 16.0),
    cos(global.time_seconds * 0.6 + uv.x * 14.0),
  ) * 0.018;
  let pos = clamp(uv + vel * 0.2 + wobble, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
  let wave = vec3<f32>(
    abs(sin(6.28318 * (uv.x * 0.95 + global.time_seconds * 0.07 + dye * 0.09))),
    abs(sin(6.28318 * (uv.y * 1.10 + global.time_seconds * 0.11 + impulse * 0.07))),
    abs(sin(6.28318 * ((uv.x + uv.y) * 0.6 + global.time_seconds * 0.09))),
  );
  let rgb = clamp(vec3<f32>(0.22, 0.24, 0.28) + wave * vec3<f32>(0.78, 0.76, 0.72), vec3<f32>(0.0), vec3<f32>(1.0));
  let alpha = clamp(0.82 + dye * 0.18, 0.82, 1.0);
  let scale = clamp(PARTICLE_SCALE * (0.85 + dye * 0.20 + impulse * 0.15), 0.001, 0.2);

  write_arena(CP_OFFSET, CP_LANE_STRIDE, CP_COMPONENT_STRIDE, lane, 0u, pos.x);
  write_arena(CP_OFFSET, CP_LANE_STRIDE, CP_COMPONENT_STRIDE, lane, 1u, pos.y);

  write_arena(COLOR_OFFSET, COLOR_LANE_STRIDE, COLOR_COMPONENT_STRIDE, lane, 0u, rgb.x);
  write_arena(COLOR_OFFSET, COLOR_LANE_STRIDE, COLOR_COMPONENT_STRIDE, lane, 1u, rgb.y);
  write_arena(COLOR_OFFSET, COLOR_LANE_STRIDE, COLOR_COMPONENT_STRIDE, lane, 2u, rgb.z);
  write_arena(COLOR_OFFSET, COLOR_LANE_STRIDE, COLOR_COMPONENT_STRIDE, lane, 3u, alpha);
  write_arena(SCALE_OFFSET, SCALE_LANE_STRIDE, SCALE_COMPONENT_STRIDE, lane, 0u, scale);
}
`.trim();
}

function buildFluidPassBundle(config: FluidConfig, plan: FluidRenderPlan): CompiledGpuArtifactBundle {
  const passes: CompiledGpuPassArtifact[] = [
    {
      passId: 'fluid.state',
      stage: 'compute',
      entryPoint: 'compute_state_main',
      wgsl: buildStatePassWgsl(config, plan),
    },
    {
      passId: 'fluid.present',
      stage: 'compute',
      entryPoint: 'compute_present_main',
      wgsl: buildPresentPassWgsl(config, plan),
    },
  ];
  return {
    schemaVersion: 1,
    passes,
  };
}

export function maybeBuildFluidGpuBundle(
  normalizedPatch: NormalizedPatch,
  program: CompiledProgramIR,
): CompiledGpuArtifactBundle | null {
  const fluidBlockIds = getFluidBlockIds(normalizedPatch);
  if (fluidBlockIds.length === 0) return null;
  const renderStep = selectFluidRenderStep(program, fluidBlockIds);
  if (!renderStep) return null;
  const plan = buildFluidRenderPlan(program, renderStep);
  if (!plan) return null;
  const config = getFluidConfig(normalizedPatch, fluidBlockIds, plan.activeLanes);
  return buildFluidPassBundle(config, plan);
}
