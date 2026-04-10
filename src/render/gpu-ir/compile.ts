/**
 * GPU-IR DSL: Compilation orchestrator.
 *
 * Public API: gpu(), compute(), render(), draw(), drawPrep(), exact(), wg(),
 *             ortho(), perspective(), clearTarget(), domainSource(), fsQuadSource()
 * Transforms compact DSL specs + arrow function bodies into PipelineInstallPayload.
 */

import type {
  PipelineInstallPayload,
  ComputePassSpec,
  RenderPassSpec,
  SystemPassSpec,
  SystemCameraUpdateSpec,
  DrawCallSpec,
  StatementIR,
  ExprIR,
  MemoryManifest,
  PipelineStateSpec,
  WgslFunction,
} from '../rust/boundary-contract';
import { expandManifest, type CompactManifest, type CompactGlobalSpec, type CompactScalarSpec } from './manifest';
import { inferComputeDeps, inferDrawCallDeps } from './deps';
import { compileShaderBody, type ShaderContext, type WalkerResult } from './walker';
import * as B from './ir-builders';
import { STDLIB } from './stdlib';

// ---------------------------------------------------------------------------
// Helpers — syntactic sugar returning boundary-contract types directly.
// Users can always write the object literal instead of using a helper.
// ---------------------------------------------------------------------------

/** Dispatch helpers — return ComputePassSpec['dispatch'] */
export const exact = (x: number, y = 1, z = 1): ComputePassSpec['dispatch'] =>
  ({ mode: 'Exact', x, y, z });

export const domain = (domainId: string): ComputePassSpec['dispatch'] =>
  ({ mode: 'Domain', domainId });

export const texDispatch = (textureId: string): ComputePassSpec['dispatch'] =>
  ({ mode: 'Texture', textureId });

/** Workgroup helper — returns ComputePassSpec['workgroupSize'] */
export const wg = (x: number, y = 1, z = 1): ComputePassSpec['workgroupSize'] =>
  [x, y, z];

/** Source helpers — return DrawCallSpec['source'] */
export const domainSource = (
  domainId: string,
  shapeId: string,
  sourceKind: 'Topology' | 'Parametric' | 'Field' | 'SolverResource' = 'Topology',
): DrawCallSpec['source'] =>
  ({ type: 'Domain', domainId, sourceKind, shapeId });

export const fsQuadSource = (): DrawCallSpec['source'] =>
  ({ type: 'FullScreenQuad' });

/** Render target helpers — return RenderPassSpec['targets'] */
export const clearTarget = (clearColor: readonly [number, number, number, number]): RenderPassSpec['targets'] =>
  ({ colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor }] });

export const loadTarget = (): RenderPassSpec['targets'] =>
  ({ colors: [{ textureId: 'canvas', loadOp: 'load' }] });

/** Named texture target helpers */
export const clearTexture = (
  textureId: string,
  clearColor: readonly [number, number, number, number],
): RenderPassSpec['targets'] =>
  ({ colors: [{ textureId, loadOp: 'clear', clearColor }] });

/** Depth-only target — zero color attachments, depth clear to `value` (default 1.0). */
export const depthOnlyTarget = (
  textureId: string,
  opts?: { clearValue?: number },
): RenderPassSpec['targets'] => ({
  colors: [],
  depthStencil: {
    textureId,
    depth: { op: 'clear', value: opts?.clearValue ?? 1.0 },
  },
});

/** Pipeline state presets — named constants, not default-filling logic */
export const OPAQUE: PipelineStateSpec =
  { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' };

export const ALPHA_BLEND: PipelineStateSpec =
  { blendMode: 'alpha', cullMode: 'none', depthWrite: false, depthCompare: 'always' };

export const DEPTH_TEST: PipelineStateSpec =
  { blendMode: 'opaque', cullMode: 'none', depthWrite: true, depthCompare: 'less' };

/** Math constants — available in DSL shader bodies */
import { MATH_CONSTANTS } from './ir-node-rules';
export { MATH_CONSTANTS } from './ir-node-rules';
export const { PI, TAU, HALF_PI, E, SQRT2, PHI } = MATH_CONSTANTS;

// ---------------------------------------------------------------------------
// Camera specs — describe projection type + initial parameters
// ---------------------------------------------------------------------------

export interface CameraSpec {
  readonly type: 'ortho' | 'perspective';
  readonly params: Record<string, number>;
}

/** Orthographic camera (default 2D view). Origin-centered, [-1,1] visible at zoom 1. */
export function ortho(opts?: {
  centerX?: number;
  centerY?: number;
  zoom?: number;
}): CameraSpec {
  return {
    type: 'ortho',
    params: {
      center_x: opts?.centerX ?? 0.0,
      center_y: opts?.centerY ?? 0.0,
      zoom: opts?.zoom ?? 1.0,
    },
  };
}

/** Perspective camera (3D view). */
export function perspective(opts?: {
  fov?: number;
  distance?: number;
  tilt?: number;
  yaw?: number;
  centerX?: number;
  centerY?: number;
}): CameraSpec {
  return {
    type: 'perspective',
    params: {
      fov: opts?.fov ?? 45.0,
      distance: opts?.distance ?? 2.0,
      tilt: opts?.tilt ?? 35.0,
      yaw: opts?.yaw ?? 0.0,
      center_x: opts?.centerX ?? 0.0,
      center_y: opts?.centerY ?? 0.0,
    },
  };
}

// ---------------------------------------------------------------------------
// Deferred types — internal, carry arrow fns until gpu() compiles them
// ---------------------------------------------------------------------------

interface DeferredComputePass {
  readonly type: 'Compute';
  readonly passId: string;
  readonly workgroupSize: readonly [number, number, number];
  readonly dispatch: ComputePassSpec['dispatch'];
  readonly bodyFn: Function;
  readonly constants?: Record<string, number>;
  readonly dispatchDomain?: string;
}

interface DeferredDrawCall {
  readonly intentId: string;
  readonly source: DrawCallSpec['source'];
  readonly pipelineState: DrawCallSpec['pipelineState'];
  readonly transform?: Transform2DSpec;
  readonly vertexFn: Function;
  readonly fragmentFn?: Function;
  readonly constants?: Record<string, number>;
  readonly domainId: string;
}

/** Render pass options — viewport, scissor */
export interface RenderPassOpts {
  readonly viewport?: { x: number; y: number; width: number; height: number; minDepth?: number; maxDepth?: number };
  readonly scissorRect?: { x: number; y: number; width: number; height: number };
}

interface DeferredRenderPass {
  readonly type: 'Render';
  readonly passId: string;
  readonly camera: CameraSpec;
  readonly targets: RenderPassSpec['targets'];
  readonly drawCalls: readonly DeferredDrawCall[];
  readonly viewport?: RenderPassOpts['viewport'];
  readonly scissorRect?: RenderPassOpts['scissorRect'];
}

interface DeferredCompositePass {
  readonly type: 'Composite';
  readonly passId: string;
  readonly targets: RenderPassSpec['targets'];
  readonly drawCalls: readonly DeferredDrawCall[];
}

interface DeferredCameraPass {
  readonly type: 'System_CameraUpdate';
  readonly cameraRef: string;
  readonly bodyFn: Function;
}

type DeferredRosterEntry = DeferredComputePass | DeferredRenderPass | DeferredCompositePass | DeferredCameraPass | SystemPassSpec;

// ---------------------------------------------------------------------------
// gpu()
// ---------------------------------------------------------------------------

export interface GpuSpec extends CompactManifest {
  readonly roster: readonly DeferredRosterEntry[];
  /** Additional WGSL functions to register (merged with stdlib) */
  readonly functions?: readonly WgslFunction[];
}

/** Rendering context — canvas dimensions and MSAA policy, known to the caller. */
export interface GpuContext {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** MSAA sample count for canvas targets (default 4). Named textures always use 1. */
  readonly sampleCount?: number;
}

export function gpu(spec: GpuSpec, ctx?: GpuContext): PipelineInstallPayload {
  // Pre-scan: collect camera globals/scalars from render entries
  const mergedGlobals: Record<string, string | CompactGlobalSpec> = { ...(spec.globals ?? {}) };
  const mergedScalars: Record<string, CompactScalarSpec> = { ...(spec.scalars ?? {}) };
  let hasCamera = false;

  for (const entry of spec.roster) {
    if (entry.type !== 'Render') continue;
    const rp = entry as DeferredRenderPass;
    const prefix = `cam:${rp.passId}`;
    const vpSymbol = `${prefix}:vp`;
    hasCamera = true;

    // Camera parameter globals (initial values from spec)
    for (const [key, value] of Object.entries(rp.camera.params)) {
      mergedGlobals[`${prefix}:${key}`] = { f32: value, dynamic: true };
    }
    // VP matrix scalar output
    mergedScalars[vpSymbol] = 'mat4x4';
  }

  // sys:resolution injected when any camera exists
  if (hasCamera) mergedGlobals['sys:resolution'] = 'vec2';

  const manifest = expandManifest(
    { ...spec, globals: mergedGlobals, scalars: mergedScalars },
    ctx?.canvasWidth,
    ctx?.canvasHeight,
  );

  // Compile roster — render entries produce [cameraPass, renderPass], composite entries pass through
  const roster: PipelineInstallPayload['roster'][number][] = [];
  for (const entry of spec.roster) {
    if (entry.type === 'Render') {
      const [camPass, renderPass] = compileRenderEntry(entry as DeferredRenderPass, manifest, spec, ctx);
      roster.push(camPass, renderPass);
    } else if (entry.type === 'Composite') {
      roster.push(compileCompositeEntry(entry as DeferredCompositePass, manifest, spec, ctx));
    } else {
      roster.push(compileEntry(entry, manifest));
    }
  }

  // Merge stdlib + user-supplied WGSL functions
  const functions: WgslFunction[] = [...STDLIB, ...(spec.functions ?? [])];

  return { manifest, roster, functions };
}

// ---------------------------------------------------------------------------
// Camera body builders — produce Functions with literal symbol references.
// Uses new Function() so fn.toString() contains only literal strings
// (the walker parses fn.toString(); closures with template literals don't work).
// ---------------------------------------------------------------------------

function buildOrthoCameraBody(prefix: string, vpSymbol: string): Function {
  // Construct source with literal strings — no template literals in the output
  const src = `() => {
  const res = $global.resolution;
  const aspect = res.x / res.y;
  const cx = $global['${prefix}:center_x'];
  const cy = $global['${prefix}:center_y'];
  const zoom = $global['${prefix}:zoom'];
  const sx = zoom / max(aspect, 1.0);
  const sy = zoom * min(aspect, 1.0);
  $scalar['${vpSymbol}'] = mat4x4(
    sx,  0.0, 0.0, 0.0,
    0.0, sy,  0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    -sx * cx, -sy * cy, 0.0, 1.0
  );
}`;
  // eslint-disable-next-line no-new-func
  return new Function(`return (${src})`)();
}

function buildPerspectiveCameraBody(prefix: string, vpSymbol: string): Function {
  const src = `() => {
  const res = $global.resolution;
  const aspect = res.x / res.y;
  const cx = $global['${prefix}:center_x'];
  const cy = $global['${prefix}:center_y'];
  const fov_val = $global['${prefix}:fov'];
  const dist = $global['${prefix}:distance'];
  const tilt_deg = $global['${prefix}:tilt'];
  const yaw_deg = $global['${prefix}:yaw'];
  const deg2rad = 3.14159265358979 / 180.0;
  const fov_rad = fov_val * deg2rad;
  const f = 1.0 / tan(fov_rad * 0.5);
  const near_val = 0.01;
  const far_val = 100.0;
  const range_inv = 1.0 / (near_val - far_val);
  const p00 = f / aspect;
  const p11 = f;
  const p22 = far_val * range_inv;
  const p23 = near_val * far_val * range_inv;
  const tilt_r = tilt_deg * deg2rad;
  const yaw_r = yaw_deg * deg2rad;
  const ct = cos(tilt_r);
  const st = sin(tilt_r);
  const cy_r = cos(yaw_r);
  const sy_r = sin(yaw_r);
  const ex = cx + dist * sy_r * ct;
  const ey = cy - dist * st;
  const ez = dist * cy_r * ct;
  $scalar['${vpSymbol}'] = mat4x4(
    p00 * cy_r,  p00 * sy_r * st,  p00 * sy_r * ct,  0.0,
    0.0,         p11 * ct,         -p11 * st,         0.0,
    -sy_r * p22, cy_r * st * p22,  cy_r * ct * p22,   p23,
    -p00 * cy_r * ex + p00 * sy_r * ez,
    -p11 * ct * ey + p11 * st * ez,
    sy_r * p22 * ex - cy_r * st * p22 * ey - cy_r * ct * p22 * ez + p23,
    1.0
  );
}`;
  // eslint-disable-next-line no-new-func
  return new Function(`return (${src})`)();
}

// ---------------------------------------------------------------------------
// compute()
// ---------------------------------------------------------------------------

export function compute(
  passId: string,
  dispatch: ComputePassSpec['dispatch'],
  workgroupSize: ComputePassSpec['workgroupSize'],
  constantsOrBody: Record<string, number> | Function,
  maybeBody?: Function,
): DeferredComputePass {
  const hasConstants = typeof constantsOrBody !== 'function';
  const constants = hasConstants ? constantsOrBody : undefined;
  const bodyFn = hasConstants ? maybeBody! : constantsOrBody;

  return {
    type: 'Compute',
    passId,
    workgroupSize,
    dispatch,
    bodyFn,
    constants,
    dispatchDomain: dispatch.mode === 'Domain' ? dispatch.domainId : undefined,
  };
}

// ---------------------------------------------------------------------------
// drawPrep()
// ---------------------------------------------------------------------------

export function drawPrep(passId: string, activeLanesSymbol: string, vertexCount: number): SystemPassSpec {
  return {
    type: 'System_DrawPrep',
    passId,
    sourceBlockIds: [],
    activeLanesSymbol,
    vertexCount,
  };
}

// ---------------------------------------------------------------------------
// render() + draw()
// ---------------------------------------------------------------------------

/** Per-instance 2D transform declaration — fields are domain field names. */
export interface Transform2DSpec {
  readonly posX: string;
  readonly posY: string;
  readonly rotation?: string;
  readonly scale?: string;
}

export interface ShaderFns {
  readonly transform?: Transform2DSpec;
  readonly vertex: Function;
  readonly fragment?: Function;
  readonly constants?: Record<string, number>;
}

export function render(
  passId: string,
  camera: CameraSpec,
  targets: RenderPassSpec['targets'],
  drawCalls: readonly DeferredDrawCall[],
  opts?: RenderPassOpts,
): DeferredRenderPass {
  return { type: 'Render', passId, camera, targets, drawCalls, viewport: opts?.viewport, scissorRect: opts?.scissorRect };
}

export function composite(
  passId: string,
  targets: RenderPassSpec['targets'],
  drawCalls: readonly DeferredDrawCall[],
): DeferredCompositePass {
  return { type: 'Composite', passId, targets, drawCalls };
}

export function draw(
  intentId: string,
  source: DrawCallSpec['source'],
  pipelineState: PipelineStateSpec,
  shaders: ShaderFns,
): DeferredDrawCall {
  return {
    intentId,
    source,
    pipelineState,
    transform: shaders.transform,
    vertexFn: shaders.vertex,
    fragmentFn: shaders.fragment ?? undefined,
    constants: shaders.constants,
    domainId: source.type === 'Domain' ? source.domainId : '',
  };
}

// ---------------------------------------------------------------------------
// Viewport/scissor/sampleCount resolution
// [LAW:single-enforcer] All render target resolution lives here.
// The Rust renderer reads pre-resolved pixel values — no interpretation.
// ---------------------------------------------------------------------------

/** Resolve the pixel dimensions of a color target from the spec. */
function resolveTargetDims(
  textureId: string,
  spec: GpuSpec,
  ctx: GpuContext | undefined,
): { width: number; height: number } {
  const cw = ctx?.canvasWidth ?? 800;
  const ch = ctx?.canvasHeight ?? 600;
  if (textureId === 'canvas') return { width: cw, height: ch };
  const tex = spec.textures?.[textureId];
  if (!tex) return { width: cw, height: ch }; // missing texture — validator will catch
  const w = typeof tex.width === 'number' ? tex.width : tex.width.scale * cw;
  const h = tex.height == null ? w
    : typeof tex.height === 'number' ? tex.height : tex.height.scale * ch;
  return { width: w, height: h };
}

/** Resolve viewport to pixel coords. Full-target default when omitted. */
function resolveViewport(
  viewport: RenderPassOpts['viewport'] | undefined,
  targetDims: { width: number; height: number },
): RenderPassSpec['viewport'] {
  if (viewport) {
    return {
      x: viewport.x, y: viewport.y,
      width: viewport.width, height: viewport.height,
      minDepth: viewport.minDepth ?? 0, maxDepth: viewport.maxDepth ?? 1,
    };
  }
  return { x: 0, y: 0, width: targetDims.width, height: targetDims.height, minDepth: 0, maxDepth: 1 };
}

/** Resolve scissor rect to pixel coords. Full-target default when omitted. */
function resolveScissorRect(
  scissor: RenderPassOpts['scissorRect'] | undefined,
  targetDims: { width: number; height: number },
): RenderPassSpec['scissorRect'] {
  if (scissor) return scissor;
  return { x: 0, y: 0, width: targetDims.width, height: targetDims.height };
}

/** Resolve MSAA sample count. Canvas uses ctx.sampleCount; textures always 1. */
function resolveSampleCount(textureId: string, ctx: GpuContext | undefined): number {
  if (textureId === 'canvas') return ctx?.sampleCount ?? 4;
  return 1;
}

// ---------------------------------------------------------------------------
// Internal compilation
// ---------------------------------------------------------------------------

function compileEntry(
  entry: DeferredRosterEntry,
  manifest: MemoryManifest,
): ComputePassSpec | SystemPassSpec | SystemCameraUpdateSpec {
  if (entry.type === 'System_DrawPrep') return entry;
  if (entry.type === 'Compute') return compileComputeEntry(entry as DeferredComputePass, manifest);
  if (entry.type === 'System_CameraUpdate') return compileCameraEntry(entry as DeferredCameraPass, manifest);
  throw new Error(`Unexpected roster entry type: ${(entry as { type: string }).type}`);
}

/** Generate passthrough fragment AST: forward each varying as a fragment output. */
function generatePassthroughFragment(vertexAst: readonly StatementIR[]): StatementIR[] {
  // Extract varying names from ReturnVertex statements
  for (const stmt of vertexAst) {
    if (stmt.type === 'ReturnVertex') {
      const outputs: Record<string, ExprIR> = {};
      for (const name of Object.keys(stmt.varyings)) {
        outputs[name] = B.ref(name);
      }
      return [B.returnFragment(outputs)];
    }
  }
  // No ReturnVertex found — empty fragment (shouldn't happen in valid shaders)
  return [B.returnFragment({ color: B.ref('color') })];
}

function unwrapWalkerResult(result: WalkerResult): StatementIR[] {
  if (result.diagnostics.some(d => d.severity === 'error')) {
    const msgs = result.diagnostics.map(d => `${d.line}:${d.column}: ${d.message}`).join('\n');
    throw new Error(`Shader compilation failed:\n${msgs}`);
  }
  return result.stmts;
}

function compileCameraEntry(entry: DeferredCameraPass, manifest: MemoryManifest): SystemCameraUpdateSpec {
  const ctx: ShaderContext = { stage: 'compute', manifest };
  const ast = unwrapWalkerResult(compileShaderBody(entry.bodyFn, ctx));
  return {
    type: 'System_CameraUpdate',
    passId: `camera_${entry.cameraRef}`,
    cameraRef: entry.cameraRef,
    ast,
  };
}

function compileComputeEntry(entry: DeferredComputePass, manifest: MemoryManifest): ComputePassSpec {
  const ctx: ShaderContext = { stage: 'compute', manifest, constants: entry.constants };
  const ast = unwrapWalkerResult(compileShaderBody(entry.bodyFn, ctx));

  // Auto-append active count for domain-dispatched compute
  if (entry.dispatchDomain) {
    const domain = manifest.domains[entry.dispatchDomain];
    if (domain) {
      const alreadyStores = ast.some(
        s => s.type === 'StoreScalar' && s.symbolId === domain.activeLanesSymbol,
      );
      if (!alreadyStores) {
        ast.push(B.storeScalar(domain.activeLanesSymbol, B.litU32(domain.capacity)));
      }
    }
  }

  const deps = inferComputeDeps(ast, manifest);

  return {
    type: 'Compute',
    passId: entry.passId,
    sourceBlockIds: [],
    workgroupSize: entry.workgroupSize,
    dispatch: entry.dispatch,
    dependencies: deps,
    ast,
  };
}

function compileRenderEntry(
  entry: DeferredRenderPass,
  manifest: MemoryManifest,
  spec: GpuSpec,
  ctx: GpuContext | undefined,
): [SystemCameraUpdateSpec, RenderPassSpec] {
  // Derive camera symbols from passId
  const prefix = `cam:${entry.passId}`;
  const vpSymbol = `${prefix}:vp`;

  // Build and compile the camera pass
  const cameraBodyFn = entry.camera.type === 'ortho'
    ? buildOrthoCameraBody(prefix, vpSymbol)
    : buildPerspectiveCameraBody(prefix, vpSymbol);
  const cameraPass = compileCameraEntry(
    { type: 'System_CameraUpdate', cameraRef: vpSymbol, bodyFn: cameraBodyFn },
    manifest,
  );

  // Compile draw calls with VP auto-injection
  const hasColorTargets = entry.targets.colors.length > 0;
  const drawCalls: DrawCallSpec[] = entry.drawCalls.map(dc => {
    const vertexAst = unwrapWalkerResult(compileShaderBody(dc.vertexFn, { stage: 'vertex', manifest, constants: dc.constants }));

    // Depth-only passes (zero color targets) have no fragment shader.
    // Otherwise: default passthrough fragment forwards all varyings as-is.
    const fragmentAst = !hasColorTargets
      ? []
      : dc.fragmentFn
        ? unwrapWalkerResult(compileShaderBody(dc.fragmentFn, { stage: 'fragment', manifest, constants: dc.constants }))
        : generatePassthroughFragment(vertexAst);

    // [LAW:single-enforcer] Auto-inject transforms: local → model (TRS) → clip (VP)
    for (let i = 0; i < vertexAst.length; i++) {
      const stmt = vertexAst[i];
      if (stmt.type !== 'ReturnVertex') continue;

      // Model transform: wrap position with ApplyTransform2D if declared
      let position = stmt.position;
      if (dc.transform) {
        const t = dc.transform;
        const domId = dc.domainId;
        const iid = B.intrinsic('instance_index');
        position = B.applyTransform2D(
          position,
          B.loadField(`${domId}:${t.posX}`, iid),
          B.loadField(`${domId}:${t.posY}`, iid),
          t.rotation ? B.loadField(`${domId}:${t.rotation}`, iid) : B.litF32(0.0),
          t.scale ? B.loadField(`${domId}:${t.scale}`, iid) : B.litF32(1.0),
        );
      }

      // VP projection: wrap with camera transform
      vertexAst[i] = B.returnVertex(
        B.applyVP(vpSymbol, position),
        stmt.varyings,
      );
    }

    const deps = inferDrawCallDeps(vertexAst, fragmentAst, manifest, vpSymbol);

    return {
      intentId: dc.intentId,
      source: dc.source,
      pipelineState: dc.pipelineState,
      dependencies: deps,
      vertexAst,
      fragmentAst,
    };
  });

  // Resolve target dimensions, viewport, scissor, and MSAA from declared spec.
  // Depth-only passes (no color targets) derive dimensions from depth texture and use sampleCount 1.
  const colorTarget = entry.targets.colors[0];
  const primaryTargetId = colorTarget?.textureId
    ?? entry.targets.depthStencil?.textureId
    ?? 'canvas';
  const targetDims = resolveTargetDims(primaryTargetId, spec, ctx);

  const renderPass: RenderPassSpec = {
    type: 'Render',
    passId: entry.passId,
    sourceBlockIds: [],
    sampleCount: colorTarget ? resolveSampleCount(colorTarget.textureId, ctx) : 1,
    targets: entry.targets,
    viewport: resolveViewport(entry.viewport, targetDims),
    scissorRect: resolveScissorRect(entry.scissorRect, targetDims),
    drawCalls,
  };

  return [cameraPass, renderPass];
}

// [LAW:one-type-per-behavior] Composite passes emit `type: 'Render'` on the
// wire — they're just a RenderPass with no depth/stencil and no camera.
// The only compile-time difference is that draw-call vertex AST is *not*
// wrapped with ApplyVP / ApplyTransform2D, and dependencies.cameraRef stays
// empty so the renderer's Render arm treats it as a pass-through.
function compileCompositeEntry(
  entry: DeferredCompositePass,
  manifest: MemoryManifest,
  spec: GpuSpec,
  ctx: GpuContext | undefined,
): RenderPassSpec {
  const hasColorTargets = entry.targets.colors.length > 0;
  const drawCalls: DrawCallSpec[] = entry.drawCalls.map(dc => {
    const vertexAst = unwrapWalkerResult(compileShaderBody(dc.vertexFn, { stage: 'vertex', manifest, constants: dc.constants }));

    const fragmentAst = !hasColorTargets
      ? []
      : dc.fragmentFn
        ? unwrapWalkerResult(compileShaderBody(dc.fragmentFn, { stage: 'fragment', manifest, constants: dc.constants }))
        : generatePassthroughFragment(vertexAst);

    // No ApplyVP, no ApplyTransform2D — clip-space positions pass through directly
    const deps = inferDrawCallDeps(vertexAst, fragmentAst, manifest, '');

    return {
      intentId: dc.intentId,
      source: dc.source,
      pipelineState: dc.pipelineState,
      dependencies: deps,
      vertexAst,
      fragmentAst,
    };
  });

  const colorTarget = entry.targets.colors[0];
  const primaryTargetId = colorTarget?.textureId
    ?? entry.targets.depthStencil?.textureId
    ?? 'canvas';
  const targetDims = resolveTargetDims(primaryTargetId, spec, ctx);

  return {
    type: 'Render',
    passId: entry.passId,
    sourceBlockIds: [],
    sampleCount: colorTarget ? resolveSampleCount(colorTarget.textureId, ctx) : 1,
    targets: entry.targets,
    viewport: resolveViewport(undefined, targetDims),
    scissorRect: resolveScissorRect(undefined, targetDims),
    drawCalls,
  };
}
