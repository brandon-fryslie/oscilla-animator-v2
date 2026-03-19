import type { NormalizedPatch } from '../compiler/frontend/normalize-indexing';
import type { CompilerGraphBlock } from '../compiler/ir/CompilerGraph';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type { Step, StepRender } from '../compiler/ir/types';
import type { CompiledGpuPassArtifact, CompiledGpuPassBundle } from './compile-worker-protocol';

const LEGACY_FLUID_BLOCK_TYPE = 'FluidDynamics2D';
const COMPOSABLE_FLUID_BLOCK_TYPES = [
  'FluidSplat',
  'FluidCurl',
  'FluidVorticity',
  'FluidDivergence',
  'FluidPressureJacobi',
  'FluidGradientSubtract',
  'FluidAdvect',
  'FluidPresent',
] as const;
const ALL_FLUID_BLOCK_TYPES = new Set<string>([
  LEGACY_FLUID_BLOCK_TYPE,
  ...COMPOSABLE_FLUID_BLOCK_TYPES,
]);
const NO_SLOT_U32 = 0xFFFF_FFFF;
// [LAW:one-source-of-truth] Single canonical ordering for fluid pass stages.
// Validation in compiled-gpu-pass-validation.ts derives from this array.
export const CANONICAL_FLUID_PASS_STAGES = [
  'splat',
  'curl',
  'vorticity',
  'divergence',
  'pressure',
  'gradient-subtract',
  'advect',
  'present',
] as const;

type ComposableFluidBlockType = typeof COMPOSABLE_FLUID_BLOCK_TYPES[number];
type FluidPassStage = typeof CANONICAL_FLUID_PASS_STAGES[number];

interface FluidScalarBinding {
  readonly offset: number;
  readonly laneStride: number;
  readonly componentStride: number;
  readonly fallback: number;
}

interface FluidBindings {
  readonly simResolution: FluidScalarBinding;
  readonly splatRadius: FluidScalarBinding;
  readonly splatStrength: FluidScalarBinding;
  readonly centerX: FluidScalarBinding;
  readonly centerY: FluidScalarBinding;
  readonly curlStrength: FluidScalarBinding;
  readonly vorticityStrength: FluidScalarBinding;
  readonly divergenceDamping: FluidScalarBinding;
  readonly pressureIterations: FluidScalarBinding;
  readonly pressureStrength: FluidScalarBinding;
  readonly gradientStrength: FluidScalarBinding;
  readonly velocityDissipation: FluidScalarBinding;
  readonly dyeDissipation: FluidScalarBinding;
  readonly advection: FluidScalarBinding;
  readonly particleScale: FluidScalarBinding;
  readonly colorGain: FluidScalarBinding;
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
    if (ALL_FLUID_BLOCK_TYPES.has(block.type)) {
      ids.push(block.id);
    }
  }
  return ids;
}

function mapFluidBlocksByType(normalizedPatch: NormalizedPatch): ReadonlyMap<string, CompilerGraphBlock> {
  const map = new Map<string, CompilerGraphBlock>();
  for (const block of normalizedPatch.blocks) {
    if (!ALL_FLUID_BLOCK_TYPES.has(block.type)) continue;
    if (!map.has(block.type)) {
      map.set(block.type, block);
    }
  }
  return map;
}

function resolveFluidPassStages(normalizedPatch: NormalizedPatch): readonly FluidPassStage[] {
  const byType = mapFluidBlocksByType(normalizedPatch);
  const hasLegacy = byType.has(LEGACY_FLUID_BLOCK_TYPE);
  if (hasLegacy) {
    return CANONICAL_FLUID_PASS_STAGES;
  }
  const stageByBlockType: ReadonlyMap<ComposableFluidBlockType, FluidPassStage> = new Map([
    ['FluidSplat', 'splat'],
    ['FluidCurl', 'curl'],
    ['FluidVorticity', 'vorticity'],
    ['FluidDivergence', 'divergence'],
    ['FluidPressureJacobi', 'pressure'],
    ['FluidGradientSubtract', 'gradient-subtract'],
    ['FluidAdvect', 'advect'],
    ['FluidPresent', 'present'],
  ]);
  const enabled = new Set<FluidPassStage>();
  for (const blockType of COMPOSABLE_FLUID_BLOCK_TYPES) {
    if (!byType.has(blockType)) continue;
    const stage = stageByBlockType.get(blockType);
    if (!stage) continue;
    enabled.add(stage);
  }
  const ordered: FluidPassStage[] = [];
  for (const stage of CANONICAL_FLUID_PASS_STAGES) {
    if (enabled.has(stage)) ordered.push(stage);
  }
  return ordered;
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
  for (const step of program.schedule.steps as readonly Step[]) {
    if (step.kind === 'render') {
      return step;
    }
  }
  return null;
}

function descriptorToPlan(program: CompiledProgramIR, slot: number): ArenaAddressPlan | null {
  const descriptor = program.runtimeAddressTable.slotToArena.get(slot as never);
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
  const scale = descriptorToPlan(program, step.scale.slot as never);
  if (!controlPoints || !color || !scale) return null;

  const controlDescriptor = program.runtimeAddressTable.slotToArena.get(step.controlPointsSlot as never);
  if (!controlDescriptor) return null;

  const maxActiveLanes = Math.max(1, Math.floor(program.generatedComputeProgram.maxActiveLanes));
  const activeLanes = Math.max(1, Math.min(maxActiveLanes, controlDescriptor.laneCount));
  return { controlPoints, color, scale, activeLanes };
}

function resolveBlockPortSlot(
  program: CompiledProgramIR,
  blockId: string | null,
  portName: string,
): number | null {
  if (!blockId) return null;
  const ports = program.debugIndex.ports as ReadonlyArray<{ readonly block?: unknown; readonly portName?: string }>;
  for (const [slotKey, portIndex] of program.debugIndex.slotToPort.entries()) {
    const port = ports[Number(portIndex)];
    if (!port || port.portName !== portName) continue;
    const blockRef = port.block;
    const mappedBlockId = (() => {
      if (typeof blockRef === 'string') {
        return blockRef;
      }
      if (typeof blockRef === 'number') {
        return program.debugIndex.blockMap.get(blockRef as never) ?? null;
      }
      return null;
    })();
    if (mappedBlockId === blockId) {
      return Number(slotKey);
    }
  }
  return null;
}

function resolveScalarBinding(
  program: CompiledProgramIR,
  blockId: string | null,
  outputPortName: string,
  fallback: number,
): FluidScalarBinding {
  const slot = resolveBlockPortSlot(program, blockId, outputPortName);
  const descriptor = slot !== null
    ? program.runtimeAddressTable.slotToArena.get(slot as never)
    : undefined;
  if (!descriptor) {
    return {
      offset: NO_SLOT_U32,
      laneStride: 1,
      componentStride: 1,
      fallback,
    };
  }
  const packing = descriptor.packing ?? 'soa';
  return {
    offset: descriptor.offset,
    laneStride: descriptor.laneStride ?? (packing === 'soa' ? 1 : descriptor.stride),
    componentStride: descriptor.componentStride ?? (packing === 'soa' ? descriptor.laneCount : 1),
    fallback,
  };
}

function scalarBindingConstants(prefix: string, binding: FluidScalarBinding): string {
  return [
    `const PARAM_${prefix}_OFFSET: u32 = ${asU32Literal(binding.offset)};`,
    `const PARAM_${prefix}_LANE_STRIDE: u32 = ${asU32Literal(binding.laneStride)};`,
    `const PARAM_${prefix}_COMPONENT_STRIDE: u32 = ${asU32Literal(binding.componentStride)};`,
    `const PARAM_${prefix}_FALLBACK: f32 = ${asF32Literal(binding.fallback)};`,
  ].join('\n');
}

function bindingsConstants(bindings: FluidBindings): string {
  return [
    scalarBindingConstants('SIM_RESOLUTION', bindings.simResolution),
    scalarBindingConstants('SPLAT_RADIUS', bindings.splatRadius),
    scalarBindingConstants('SPLAT_STRENGTH', bindings.splatStrength),
    scalarBindingConstants('CENTER_X', bindings.centerX),
    scalarBindingConstants('CENTER_Y', bindings.centerY),
    scalarBindingConstants('CURL_STRENGTH', bindings.curlStrength),
    scalarBindingConstants('VORTICITY_STRENGTH', bindings.vorticityStrength),
    scalarBindingConstants('DIVERGENCE_DAMPING', bindings.divergenceDamping),
    scalarBindingConstants('PRESSURE_ITERATIONS', bindings.pressureIterations),
    scalarBindingConstants('PRESSURE_STRENGTH', bindings.pressureStrength),
    scalarBindingConstants('GRADIENT_STRENGTH', bindings.gradientStrength),
    scalarBindingConstants('VELOCITY_DISSIPATION', bindings.velocityDissipation),
    scalarBindingConstants('DYE_DISSIPATION', bindings.dyeDissipation),
    scalarBindingConstants('ADVECTION', bindings.advection),
    scalarBindingConstants('PARTICLE_SCALE', bindings.particleScale),
    scalarBindingConstants('COLOR_GAIN', bindings.colorGain),
  ].join('\n');
}

function composeFluidBindings(
  normalizedPatch: NormalizedPatch,
  program: CompiledProgramIR,
): FluidBindings {
  const byType = mapFluidBlocksByType(normalizedPatch);
  const legacy = byType.get(LEGACY_FLUID_BLOCK_TYPE) ?? null;
  const composable = {
    splat: byType.get('FluidSplat') ?? null,
    curl: byType.get('FluidCurl') ?? null,
    vorticity: byType.get('FluidVorticity') ?? null,
    divergence: byType.get('FluidDivergence') ?? null,
    pressure: byType.get('FluidPressureJacobi') ?? null,
    gradient: byType.get('FluidGradientSubtract') ?? null,
    advect: byType.get('FluidAdvect') ?? null,
    present: byType.get('FluidPresent') ?? null,
  };

  return {
    simResolution: resolveScalarBinding(
      program,
      composable.splat?.id ?? legacy?.id ?? null,
      composable.splat ? '_simResolution' : '_simResolution',
      clamp(Math.floor(asFinite(composable.splat?.params.simResolution ?? legacy?.params.simResolution, 128)), 8, 1024),
    ),
    splatRadius: resolveScalarBinding(
      program,
      composable.splat?.id ?? legacy?.id ?? null,
      composable.splat ? '_radius' : '_splatRadius',
      clamp(asFinite(composable.splat?.params.radius ?? legacy?.params.splatRadius, 20.0), 2.0, 256.0),
    ),
    splatStrength: resolveScalarBinding(
      program,
      composable.splat?.id ?? null,
      '_strength',
      clamp(asFinite(composable.splat?.params.strength, 1.0), 0.0, 8.0),
    ),
    centerX: resolveScalarBinding(
      program,
      composable.splat?.id ?? null,
      '_centerX',
      clamp(asFinite(composable.splat?.params.centerX, 0.5), 0.0, 1.0),
    ),
    centerY: resolveScalarBinding(
      program,
      composable.splat?.id ?? null,
      '_centerY',
      clamp(asFinite(composable.splat?.params.centerY, 0.5), 0.0, 1.0),
    ),
    curlStrength: resolveScalarBinding(
      program,
      composable.curl?.id ?? null,
      '_strength',
      clamp(asFinite(composable.curl?.params.strength, 1.0), 0.0, 8.0),
    ),
    vorticityStrength: resolveScalarBinding(
      program,
      composable.vorticity?.id ?? legacy?.id ?? null,
      composable.vorticity ? '_strength' : '_vorticity',
      clamp(asFinite(composable.vorticity?.params.strength ?? legacy?.params.vorticity, 18.0), 0.0, 96.0),
    ),
    divergenceDamping: resolveScalarBinding(
      program,
      composable.divergence?.id ?? null,
      '_damping',
      clamp(asFinite(composable.divergence?.params.damping, 0.24), 0.0, 1.0),
    ),
    pressureIterations: resolveScalarBinding(
      program,
      composable.pressure?.id ?? null,
      '_iterations',
      clamp(asFinite(composable.pressure?.params.iterations, 20.0), 1.0, 64.0),
    ),
    pressureStrength: resolveScalarBinding(
      program,
      composable.pressure?.id ?? null,
      '_pressure',
      clamp(asFinite(composable.pressure?.params.pressure, 1.0), 0.0, 8.0),
    ),
    gradientStrength: resolveScalarBinding(
      program,
      composable.gradient?.id ?? null,
      '_strength',
      clamp(asFinite(composable.gradient?.params.strength, 1.0), 0.0, 8.0),
    ),
    velocityDissipation: resolveScalarBinding(
      program,
      composable.advect?.id ?? legacy?.id ?? null,
      composable.advect ? '_velocityDissipation' : '_velocityDissipation',
      clamp(asFinite(composable.advect?.params.velocityDissipation ?? legacy?.params.velocityDissipation, 0.992), 0.7, 0.9995),
    ),
    dyeDissipation: resolveScalarBinding(
      program,
      composable.advect?.id ?? legacy?.id ?? null,
      composable.advect ? '_dyeDissipation' : '_dyeDissipation',
      clamp(asFinite(composable.advect?.params.dyeDissipation ?? legacy?.params.dyeDissipation, 0.996), 0.7, 0.9999),
    ),
    advection: resolveScalarBinding(
      program,
      composable.advect?.id ?? legacy?.id ?? null,
      composable.advect ? '_advection' : '_advection',
      clamp(asFinite(composable.advect?.params.advection ?? legacy?.params.advection, 1.0), 0.1, 3.0),
    ),
    particleScale: resolveScalarBinding(
      program,
      composable.present?.id ?? legacy?.id ?? null,
      composable.present ? '_particleScale' : '_particleScale',
      clamp(asFinite(composable.present?.params.particleScale ?? legacy?.params.particleScale, 0.02), 0.001, 0.2),
    ),
    colorGain: resolveScalarBinding(
      program,
      composable.present?.id ?? null,
      '_colorGain',
      clamp(asFinite(composable.present?.params.colorGain, 1.0), 0.1, 2.5),
    ),
  };
}

function commonFluidPreamble(bindings: FluidBindings, plan: FluidRenderPlan): string {
  return `
// [LAW:one-source-of-truth] FrameHeader mirrors the Rust FrameHeader struct.
// The uniform binding is derived transport; the canonical source is the arena
// header zone (offset 0 of the compiler arena buffer).
struct FrameHeader {
  view_proj: mat4x4<f32>,
  resolution: vec2<f32>,
  time_seconds: f32,
  delta_time_seconds: f32,
};

@group(0) @binding(0) var<storage, read> arena_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<f32>;
@group(0) @binding(2) var<storage, read> state_in: array<f32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<f32>;
@group(0) @binding(4) var<uniform> frame_header: FrameHeader;

const ACTIVE_LANES: u32 = ${asU32Literal(plan.activeLanes)};
const NO_SLOT: u32 = ${asU32Literal(NO_SLOT_U32)};
${bindingsConstants(bindings)}

fn read_scalar_param(offset: u32, lane_stride: u32, component_stride: u32, fallback: f32) -> f32 {
  if (offset == NO_SLOT) {
    return fallback;
  }
  let idx = offset + 0u * lane_stride + 0u * component_stride;
  if (idx >= arrayLength(&arena_in)) {
    return fallback;
  }
  let raw = arena_in[idx];
  return select(fallback, raw, raw == raw);
}

fn resolve_grid_width() -> u32 {
  let value = read_scalar_param(PARAM_SIM_RESOLUTION_OFFSET, PARAM_SIM_RESOLUTION_LANE_STRIDE, PARAM_SIM_RESOLUTION_COMPONENT_STRIDE, PARAM_SIM_RESOLUTION_FALLBACK);
  return max(1u, u32(clamp(round(value), 8.0, 1024.0)));
}

fn resolve_grid_height(grid_width: u32) -> u32 {
  return max(1u, (ACTIVE_LANES + grid_width - 1u) / grid_width);
}

fn lane_from_xy(x: i32, y: i32, grid_width: u32, grid_height: u32) -> u32 {
  let w = i32(max(grid_width, 1u));
  let h = i32(max(grid_height, 1u));
  let wrapped_x = ((x % w) + w) % w;
  let wrapped_y = ((y % h) + h) % h;
  let lane = u32(wrapped_y) * grid_width + u32(wrapped_x);
  return min(lane, ACTIVE_LANES - 1u);
}

fn lane_xy(lane: u32, grid_width: u32, grid_height: u32) -> vec2<i32> {
  let x = i32(lane % grid_width);
  let y = i32(min(lane / grid_width, grid_height - 1u));
  return vec2<i32>(x, y);
}

fn lane_uv(lane: u32, grid_width: u32, grid_height: u32) -> vec2<f32> {
  let xy = lane_xy(lane, grid_width, grid_height);
  let width = max(f32(grid_width), 1.0);
  let height = max(f32(grid_height), 1.0);
  return vec2<f32>((f32(xy.x) + 0.5) / width, (f32(xy.y) + 0.5) / height);
}

fn sample_lane_from_uv(uv: vec2<f32>, grid_width: u32, grid_height: u32) -> u32 {
  let clamped = clamp(uv, vec2<f32>(0.0, 0.0), vec2<f32>(0.999999, 0.999999));
  let x = i32(clamped.x * max(f32(grid_width), 1.0));
  let y = i32(clamped.y * max(f32(grid_height), 1.0));
  return lane_from_xy(x, y, grid_width, grid_height);
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
`;
}

function buildSplatPassWgsl(bindings: FluidBindings, plan: FluidRenderPlan): string {
  return `${commonFluidPreamble(bindings, plan)}
@compute @workgroup_size(64, 1, 1)
fn compute_splat_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane >= ACTIVE_LANES) {
    return;
  }
  let grid_width = resolve_grid_width();
  let grid_height = resolve_grid_height(grid_width);
  let uv = lane_uv(lane, grid_width, grid_height);
  let vel = vec2<f32>(read_state_in(lane, 0u), read_state_in(lane, 1u));
  let dye = max(read_state_in(lane, 2u), 0.0);

  let splat_radius = clamp(read_scalar_param(PARAM_SPLAT_RADIUS_OFFSET, PARAM_SPLAT_RADIUS_LANE_STRIDE, PARAM_SPLAT_RADIUS_COMPONENT_STRIDE, PARAM_SPLAT_RADIUS_FALLBACK), 2.0, 256.0);
  let splat_strength = max(0.0, read_scalar_param(PARAM_SPLAT_STRENGTH_OFFSET, PARAM_SPLAT_STRENGTH_LANE_STRIDE, PARAM_SPLAT_STRENGTH_COMPONENT_STRIDE, PARAM_SPLAT_STRENGTH_FALLBACK));
  let center_x = clamp(read_scalar_param(PARAM_CENTER_X_OFFSET, PARAM_CENTER_X_LANE_STRIDE, PARAM_CENTER_X_COMPONENT_STRIDE, PARAM_CENTER_X_FALLBACK), 0.0, 1.0);
  let center_y = clamp(read_scalar_param(PARAM_CENTER_Y_OFFSET, PARAM_CENTER_Y_LANE_STRIDE, PARAM_CENTER_Y_COMPONENT_STRIDE, PARAM_CENTER_Y_FALLBACK), 0.0, 1.0);

  let dt = clamp(frame_header.delta_time_seconds, 1.0 / 240.0, 1.0 / 20.0);
  let mouse = vec2<f32>(
    clamp(frame_header.view_proj[0][3], 0.0, 1.0),
    clamp(frame_header.view_proj[1][0], 0.0, 1.0),
  );
  let mouse_buttons = frame_header.view_proj[1][1];
  let user_strength = select(0.0, 1.0, mouse_buttons > 0.5);

  let center = vec2<f32>(
    center_x + 0.22 * cos(frame_header.time_seconds * 0.19),
    center_y + 0.22 * sin(frame_header.time_seconds * 0.17),
  );
  let to_center = uv - center;
  let center_falloff = exp(-dot(to_center, to_center) * 24.0);
  let to_mouse = (uv - mouse) * splat_radius;
  let mouse_impulse = exp(-dot(to_mouse, to_mouse));
  let impulse = (center_falloff * 0.55 + mouse_impulse * (0.2 + user_strength * 1.0)) * splat_strength;
  let spin = frame_header.time_seconds * 0.7 + f32(lane) * 0.031;
  let impulse_vec = vec2<f32>(cos(spin), sin(spin)) * impulse;

  let next_vel = vel + impulse_vec * dt;
  let next_dye = max(0.0, dye + impulse * 0.45);

  write_state_out(lane, 0u, next_vel.x);
  write_state_out(lane, 1u, next_vel.y);
  write_state_out(lane, 2u, next_dye);
  write_state_out(lane, 3u, impulse);
}`.trim();
}

function buildCurlPassWgsl(bindings: FluidBindings, plan: FluidRenderPlan): string {
  return `${commonFluidPreamble(bindings, plan)}
@compute @workgroup_size(64, 1, 1)
fn compute_curl_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane >= ACTIVE_LANES) {
    return;
  }
  let grid_width = resolve_grid_width();
  let grid_height = resolve_grid_height(grid_width);
  let xy = lane_xy(lane, grid_width, grid_height);
  let lane_l = lane_from_xy(xy.x - 1, xy.y, grid_width, grid_height);
  let lane_r = lane_from_xy(xy.x + 1, xy.y, grid_width, grid_height);
  let lane_t = lane_from_xy(xy.x, xy.y - 1, grid_width, grid_height);
  let lane_b = lane_from_xy(xy.x, xy.y + 1, grid_width, grid_height);

  let vel = vec2<f32>(read_state_in(lane, 0u), read_state_in(lane, 1u));
  let vel_l = vec2<f32>(read_state_in(lane_l, 0u), read_state_in(lane_l, 1u));
  let vel_r = vec2<f32>(read_state_in(lane_r, 0u), read_state_in(lane_r, 1u));
  let vel_t = vec2<f32>(read_state_in(lane_t, 0u), read_state_in(lane_t, 1u));
  let vel_b = vec2<f32>(read_state_in(lane_b, 0u), read_state_in(lane_b, 1u));

  let curl_strength = max(0.0, read_scalar_param(PARAM_CURL_STRENGTH_OFFSET, PARAM_CURL_STRENGTH_LANE_STRIDE, PARAM_CURL_STRENGTH_COMPONENT_STRIDE, PARAM_CURL_STRENGTH_FALLBACK));
  let curl = ((vel_r.y - vel_l.y) - (vel_b.x - vel_t.x)) * curl_strength;

  write_state_out(lane, 0u, vel.x);
  write_state_out(lane, 1u, vel.y);
  write_state_out(lane, 2u, max(read_state_in(lane, 2u), 0.0));
  write_state_out(lane, 3u, curl);
}`.trim();
}

function buildVorticityPassWgsl(bindings: FluidBindings, plan: FluidRenderPlan): string {
  return `${commonFluidPreamble(bindings, plan)}
@compute @workgroup_size(64, 1, 1)
fn compute_vorticity_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane >= ACTIVE_LANES) {
    return;
  }
  let grid_width = resolve_grid_width();
  let grid_height = resolve_grid_height(grid_width);
  let xy = lane_xy(lane, grid_width, grid_height);
  let lane_l = lane_from_xy(xy.x - 1, xy.y, grid_width, grid_height);
  let lane_r = lane_from_xy(xy.x + 1, xy.y, grid_width, grid_height);
  let lane_t = lane_from_xy(xy.x, xy.y - 1, grid_width, grid_height);
  let lane_b = lane_from_xy(xy.x, xy.y + 1, grid_width, grid_height);

  let vel = vec2<f32>(read_state_in(lane, 0u), read_state_in(lane, 1u));
  let curl = read_state_in(lane, 3u);
  let curl_l = abs(read_state_in(lane_l, 3u));
  let curl_r = abs(read_state_in(lane_r, 3u));
  let curl_t = abs(read_state_in(lane_t, 3u));
  let curl_b = abs(read_state_in(lane_b, 3u));
  let grad = vec2<f32>(curl_r - curl_l, curl_b - curl_t);
  let grad_norm = grad / max(length(grad), 1e-5);

  let vorticity = clamp(read_scalar_param(PARAM_VORTICITY_STRENGTH_OFFSET, PARAM_VORTICITY_STRENGTH_LANE_STRIDE, PARAM_VORTICITY_STRENGTH_COMPONENT_STRIDE, PARAM_VORTICITY_STRENGTH_FALLBACK), 0.0, 96.0);
  let dt = clamp(frame_header.delta_time_seconds, 1.0 / 240.0, 1.0 / 20.0);
  let vort_force = vec2<f32>(grad_norm.y, -grad_norm.x) * curl * vorticity;
  let next_vel = vel + vort_force * dt;

  write_state_out(lane, 0u, next_vel.x);
  write_state_out(lane, 1u, next_vel.y);
  write_state_out(lane, 2u, max(read_state_in(lane, 2u), 0.0));
  write_state_out(lane, 3u, curl);
}`.trim();
}

function buildDivergencePassWgsl(bindings: FluidBindings, plan: FluidRenderPlan): string {
  return `${commonFluidPreamble(bindings, plan)}
@compute @workgroup_size(64, 1, 1)
fn compute_divergence_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane >= ACTIVE_LANES) {
    return;
  }
  let grid_width = resolve_grid_width();
  let grid_height = resolve_grid_height(grid_width);
  let xy = lane_xy(lane, grid_width, grid_height);
  let lane_l = lane_from_xy(xy.x - 1, xy.y, grid_width, grid_height);
  let lane_r = lane_from_xy(xy.x + 1, xy.y, grid_width, grid_height);
  let lane_t = lane_from_xy(xy.x, xy.y - 1, grid_width, grid_height);
  let lane_b = lane_from_xy(xy.x, xy.y + 1, grid_width, grid_height);

  let vel = vec2<f32>(read_state_in(lane, 0u), read_state_in(lane, 1u));
  let vel_l = vec2<f32>(read_state_in(lane_l, 0u), read_state_in(lane_l, 1u));
  let vel_r = vec2<f32>(read_state_in(lane_r, 0u), read_state_in(lane_r, 1u));
  let vel_t = vec2<f32>(read_state_in(lane_t, 0u), read_state_in(lane_t, 1u));
  let vel_b = vec2<f32>(read_state_in(lane_b, 0u), read_state_in(lane_b, 1u));

  let damping = clamp(read_scalar_param(PARAM_DIVERGENCE_DAMPING_OFFSET, PARAM_DIVERGENCE_DAMPING_LANE_STRIDE, PARAM_DIVERGENCE_DAMPING_COMPONENT_STRIDE, PARAM_DIVERGENCE_DAMPING_FALLBACK), 0.0, 1.0);
  let divergence = ((vel_r.x - vel_l.x) + (vel_b.y - vel_t.y)) * 0.5 * damping;

  write_state_out(lane, 0u, vel.x);
  write_state_out(lane, 1u, vel.y);
  write_state_out(lane, 2u, max(read_state_in(lane, 2u), 0.0));
  write_state_out(lane, 3u, divergence);
}`.trim();
}

function buildPressurePassWgsl(bindings: FluidBindings, plan: FluidRenderPlan): string {
  return `${commonFluidPreamble(bindings, plan)}
@compute @workgroup_size(64, 1, 1)
fn compute_pressure_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane >= ACTIVE_LANES) {
    return;
  }
  let grid_width = resolve_grid_width();
  let grid_height = resolve_grid_height(grid_width);
  let xy = lane_xy(lane, grid_width, grid_height);
  let lane_l = lane_from_xy(xy.x - 1, xy.y, grid_width, grid_height);
  let lane_r = lane_from_xy(xy.x + 1, xy.y, grid_width, grid_height);
  let lane_t = lane_from_xy(xy.x, xy.y - 1, grid_width, grid_height);
  let lane_b = lane_from_xy(xy.x, xy.y + 1, grid_width, grid_height);

  let divergence = read_state_in(lane, 3u);
  let pressure_l = read_state_in(lane_l, 3u);
  let pressure_r = read_state_in(lane_r, 3u);
  let pressure_t = read_state_in(lane_t, 3u);
  let pressure_b = read_state_in(lane_b, 3u);

  let iterations = clamp(read_scalar_param(PARAM_PRESSURE_ITERATIONS_OFFSET, PARAM_PRESSURE_ITERATIONS_LANE_STRIDE, PARAM_PRESSURE_ITERATIONS_COMPONENT_STRIDE, PARAM_PRESSURE_ITERATIONS_FALLBACK), 1.0, 64.0);
  let pressure_strength = max(0.0, read_scalar_param(PARAM_PRESSURE_STRENGTH_OFFSET, PARAM_PRESSURE_STRENGTH_LANE_STRIDE, PARAM_PRESSURE_STRENGTH_COMPONENT_STRIDE, PARAM_PRESSURE_STRENGTH_FALLBACK));
  let pressure = ((pressure_l + pressure_r + pressure_t + pressure_b) - divergence * pressure_strength) / max(iterations, 1.0);

  write_state_out(lane, 0u, read_state_in(lane, 0u));
  write_state_out(lane, 1u, read_state_in(lane, 1u));
  write_state_out(lane, 2u, max(read_state_in(lane, 2u), 0.0));
  write_state_out(lane, 3u, pressure);
}`.trim();
}

function buildGradientSubtractPassWgsl(bindings: FluidBindings, plan: FluidRenderPlan): string {
  return `${commonFluidPreamble(bindings, plan)}
@compute @workgroup_size(64, 1, 1)
fn compute_gradient_subtract_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane >= ACTIVE_LANES) {
    return;
  }
  let grid_width = resolve_grid_width();
  let grid_height = resolve_grid_height(grid_width);
  let xy = lane_xy(lane, grid_width, grid_height);
  let lane_l = lane_from_xy(xy.x - 1, xy.y, grid_width, grid_height);
  let lane_r = lane_from_xy(xy.x + 1, xy.y, grid_width, grid_height);
  let lane_t = lane_from_xy(xy.x, xy.y - 1, grid_width, grid_height);
  let lane_b = lane_from_xy(xy.x, xy.y + 1, grid_width, grid_height);

  let gradient_strength = max(0.0, read_scalar_param(PARAM_GRADIENT_STRENGTH_OFFSET, PARAM_GRADIENT_STRENGTH_LANE_STRIDE, PARAM_GRADIENT_STRENGTH_COMPONENT_STRIDE, PARAM_GRADIENT_STRENGTH_FALLBACK));
  let pressure_l = read_state_in(lane_l, 3u);
  let pressure_r = read_state_in(lane_r, 3u);
  let pressure_t = read_state_in(lane_t, 3u);
  let pressure_b = read_state_in(lane_b, 3u);
  let gradient = vec2<f32>(pressure_r - pressure_l, pressure_b - pressure_t) * 0.5;
  let vel = vec2<f32>(read_state_in(lane, 0u), read_state_in(lane, 1u));
  let corrected_vel = vel - gradient * gradient_strength;

  write_state_out(lane, 0u, corrected_vel.x);
  write_state_out(lane, 1u, corrected_vel.y);
  write_state_out(lane, 2u, max(read_state_in(lane, 2u), 0.0));
  write_state_out(lane, 3u, read_state_in(lane, 3u));
}`.trim();
}

function buildAdvectPassWgsl(bindings: FluidBindings, plan: FluidRenderPlan): string {
  return `${commonFluidPreamble(bindings, plan)}
@compute @workgroup_size(64, 1, 1)
fn compute_advect_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane >= ACTIVE_LANES) {
    return;
  }
  let grid_width = resolve_grid_width();
  let grid_height = resolve_grid_height(grid_width);
  let uv = lane_uv(lane, grid_width, grid_height);
  let vel = vec2<f32>(read_state_in(lane, 0u), read_state_in(lane, 1u));
  let dt = clamp(frame_header.delta_time_seconds, 1.0 / 240.0, 1.0 / 20.0);

  let velocity_dissipation = clamp(read_scalar_param(PARAM_VELOCITY_DISSIPATION_OFFSET, PARAM_VELOCITY_DISSIPATION_LANE_STRIDE, PARAM_VELOCITY_DISSIPATION_COMPONENT_STRIDE, PARAM_VELOCITY_DISSIPATION_FALLBACK), 0.7, 0.9995);
  let dye_dissipation = clamp(read_scalar_param(PARAM_DYE_DISSIPATION_OFFSET, PARAM_DYE_DISSIPATION_LANE_STRIDE, PARAM_DYE_DISSIPATION_COMPONENT_STRIDE, PARAM_DYE_DISSIPATION_FALLBACK), 0.7, 0.9999);
  let advection = clamp(read_scalar_param(PARAM_ADVECTION_OFFSET, PARAM_ADVECTION_LANE_STRIDE, PARAM_ADVECTION_COMPONENT_STRIDE, PARAM_ADVECTION_FALLBACK), 0.1, 3.0);

  let advect_uv = uv - vel * advection * dt;
  let source_lane = sample_lane_from_uv(advect_uv, grid_width, grid_height);
  let source_vel = vec2<f32>(read_state_in(source_lane, 0u), read_state_in(source_lane, 1u));
  let source_dye = max(read_state_in(source_lane, 2u), 0.0);

  let next_vel = source_vel * velocity_dissipation;
  let band = 0.5 + 0.5 * sin(uv.x * 14.0 + frame_header.time_seconds * 0.9) * cos(uv.y * 18.0 - frame_header.time_seconds * 0.8);
  let next_dye = max(0.0, source_dye * dye_dissipation + band * 0.12);

  write_state_out(lane, 0u, next_vel.x);
  write_state_out(lane, 1u, next_vel.y);
  write_state_out(lane, 2u, next_dye);
  write_state_out(lane, 3u, read_state_in(lane, 3u));
}`.trim();
}

function buildPresentPassWgsl(bindings: FluidBindings, plan: FluidRenderPlan): string {
  return `${commonFluidPreamble(bindings, plan)}
const CP_OFFSET: u32 = ${asU32Literal(plan.controlPoints.offset)};
const CP_LANE_STRIDE: u32 = ${asU32Literal(plan.controlPoints.laneStride)};
const CP_COMPONENT_STRIDE: u32 = ${asU32Literal(plan.controlPoints.componentStride)};
const COLOR_OFFSET: u32 = ${asU32Literal(plan.color.offset)};
const COLOR_LANE_STRIDE: u32 = ${asU32Literal(plan.color.laneStride)};
const COLOR_COMPONENT_STRIDE: u32 = ${asU32Literal(plan.color.componentStride)};
const SCALE_OFFSET: u32 = ${asU32Literal(plan.scale.offset)};
const SCALE_LANE_STRIDE: u32 = ${asU32Literal(plan.scale.laneStride)};
const SCALE_COMPONENT_STRIDE: u32 = ${asU32Literal(plan.scale.componentStride)};

fn write_arena(offset: u32, lane_stride: u32, component_stride: u32, lane: u32, component: u32, value: f32) {
  let idx = offset + lane * lane_stride + component * component_stride;
  if (idx >= arrayLength(&arena_out)) {
    return;
  }
  arena_out[idx] = value;
}

fn hash11(v: f32) -> f32 {
  return fract(sin(v * 127.1 + 311.7) * 43758.5453123);
}

@compute @workgroup_size(64, 1, 1)
fn compute_present_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane >= ACTIVE_LANES) {
    return;
  }
  let grid_width = resolve_grid_width();
  let grid_height = resolve_grid_height(grid_width);
  // [LAW:dataflow-not-control-flow] Particle placement is lane-stable but
  // de-gridded using a low-discrepancy sequence to avoid strip collapse.
  let lane_f = f32(lane);
  let base_uv = vec2<f32>(
    fract((lane_f + 0.5) * 0.7548776662466927),
    fract((lane_f + 0.5) * 0.5698402909980532),
  );
  let sample_lane = sample_lane_from_uv(base_uv, grid_width, grid_height);
  let uv = lane_uv(sample_lane, grid_width, grid_height);
  let vel = vec2<f32>(read_state_in(sample_lane, 0u), read_state_in(sample_lane, 1u));
  let dye = max(read_state_in(sample_lane, 2u), 0.0);
  let aux = read_state_in(sample_lane, 3u);

  let particle_scale = clamp(read_scalar_param(PARAM_PARTICLE_SCALE_OFFSET, PARAM_PARTICLE_SCALE_LANE_STRIDE, PARAM_PARTICLE_SCALE_COMPONENT_STRIDE, PARAM_PARTICLE_SCALE_FALLBACK), 0.001, 0.2);
  let color_gain = clamp(read_scalar_param(PARAM_COLOR_GAIN_OFFSET, PARAM_COLOR_GAIN_LANE_STRIDE, PARAM_COLOR_GAIN_COMPONENT_STRIDE, PARAM_COLOR_GAIN_FALLBACK), 0.1, 2.5);

  let lane_jitter = vec2<f32>(
    hash11(lane_f * 1.37 + 0.11),
    hash11(lane_f * 1.91 + 0.73),
  ) - vec2<f32>(0.5, 0.5);
  let jitter_strength = 0.04 + dye * 0.18;
  let swirl = vec2<f32>(
    sin(frame_header.time_seconds * 0.9 + uv.y * 24.0 + lane_f * 0.013),
    cos(frame_header.time_seconds * 0.8 + uv.x * 21.0 - lane_f * 0.017),
  ) * (0.015 + 0.035 * dye);
  let flow = vel * (0.35 + dye * 0.65);
  let pos = fract(base_uv + flow + swirl + lane_jitter * jitter_strength);
  let wave = vec3<f32>(
    abs(sin(6.28318 * (uv.x * 0.95 + frame_header.time_seconds * 0.07 + dye * 0.09))),
    abs(sin(6.28318 * (uv.y * 1.10 + frame_header.time_seconds * 0.11 + aux * 0.07))),
    abs(sin(6.28318 * ((uv.x + uv.y) * 0.6 + frame_header.time_seconds * 0.09))),
  );
  // [LAW:one-source-of-truth] Fluid present writes canonical OKLCH channels into
  // COLOR; renderer is the single OKLCH->RGB conversion boundary.
  let hue = fract(
    uv.x * 0.65 +
    uv.y * 0.85 +
    wave.x * 0.35 +
    wave.z * 0.25 +
    frame_header.time_seconds * 0.06 +
    dye * 0.12
  );
  let saturation = clamp(0.82 + 0.18 * wave.y, 0.75, 1.0);
  let lightness = clamp((0.52 + 0.32 * wave.z + 0.16 * dye) * color_gain, 0.0, 1.0);
  let alpha = clamp(0.92 + dye * 0.08, 0.90, 1.0);
  let scale = clamp(particle_scale * (0.85 + dye * 0.20 + abs(aux) * 0.15), 0.001, 0.2);

  write_arena(CP_OFFSET, CP_LANE_STRIDE, CP_COMPONENT_STRIDE, lane, 0u, pos.x);
  write_arena(CP_OFFSET, CP_LANE_STRIDE, CP_COMPONENT_STRIDE, lane, 1u, pos.y);

  write_arena(COLOR_OFFSET, COLOR_LANE_STRIDE, COLOR_COMPONENT_STRIDE, lane, 0u, hue);
  write_arena(COLOR_OFFSET, COLOR_LANE_STRIDE, COLOR_COMPONENT_STRIDE, lane, 1u, saturation);
  write_arena(COLOR_OFFSET, COLOR_LANE_STRIDE, COLOR_COMPONENT_STRIDE, lane, 2u, lightness);
  write_arena(COLOR_OFFSET, COLOR_LANE_STRIDE, COLOR_COMPONENT_STRIDE, lane, 3u, alpha);
  write_arena(SCALE_OFFSET, SCALE_LANE_STRIDE, SCALE_COMPONENT_STRIDE, lane, 0u, scale);

  write_state_out(lane, 0u, vel.x);
  write_state_out(lane, 1u, vel.y);
  write_state_out(lane, 2u, dye);
  write_state_out(lane, 3u, aux);
}`.trim();
}

function buildFluidPassBundle(
  bindings: FluidBindings,
  plan: FluidRenderPlan,
  stages: readonly FluidPassStage[],
): CompiledGpuPassBundle {
  const passes: CompiledGpuPassArtifact[] = [];
  for (const stage of stages) {
    if (stage === 'splat') {
      passes.push({
        passId: 'fluid.splat',
        stage: 'compute',
        entryPoint: 'compute_splat_main',
        wgsl: buildSplatPassWgsl(bindings, plan),
      });
      continue;
    }
    if (stage === 'curl') {
      passes.push({
        passId: 'fluid.curl',
        stage: 'compute',
        entryPoint: 'compute_curl_main',
        wgsl: buildCurlPassWgsl(bindings, plan),
      });
      continue;
    }
    if (stage === 'vorticity') {
      passes.push({
        passId: 'fluid.vorticity',
        stage: 'compute',
        entryPoint: 'compute_vorticity_main',
        wgsl: buildVorticityPassWgsl(bindings, plan),
      });
      continue;
    }
    if (stage === 'divergence') {
      passes.push({
        passId: 'fluid.divergence',
        stage: 'compute',
        entryPoint: 'compute_divergence_main',
        wgsl: buildDivergencePassWgsl(bindings, plan),
      });
      continue;
    }
    if (stage === 'pressure') {
      passes.push({
        passId: 'fluid.pressure',
        stage: 'compute',
        entryPoint: 'compute_pressure_main',
        wgsl: buildPressurePassWgsl(bindings, plan),
      });
      continue;
    }
    if (stage === 'gradient-subtract') {
      passes.push({
        passId: 'fluid.gradient-subtract',
        stage: 'compute',
        entryPoint: 'compute_gradient_subtract_main',
        wgsl: buildGradientSubtractPassWgsl(bindings, plan),
      });
      continue;
    }
    if (stage === 'advect') {
      passes.push({
        passId: 'fluid.advect',
        stage: 'compute',
        entryPoint: 'compute_advect_main',
        wgsl: buildAdvectPassWgsl(bindings, plan),
      });
      continue;
    }
    passes.push({
      passId: 'fluid.present',
      stage: 'compute',
      entryPoint: 'compute_present_main',
      wgsl: buildPresentPassWgsl(bindings, plan),
    });
  }
  return {
    schemaVersion: 1,
    passes,
  };
}

export function maybeBuildFluidGpuBundle(
  normalizedPatch: NormalizedPatch,
  program: CompiledProgramIR,
): CompiledGpuPassBundle | null {
  const fluidBlockIds = getFluidBlockIds(normalizedPatch);
  if (fluidBlockIds.length === 0) return null;
  const stages = resolveFluidPassStages(normalizedPatch);
  if (stages.length === 0) return null;
  const renderStep = selectFluidRenderStep(program, fluidBlockIds);
  if (!renderStep) return null;
  const plan = buildFluidRenderPlan(program, renderStep);
  if (!plan) return null;
  const bindings = composeFluidBindings(normalizedPatch, program);
  return buildFluidPassBundle(bindings, plan, stages);
}
