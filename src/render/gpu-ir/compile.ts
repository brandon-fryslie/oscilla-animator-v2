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
  MemoryManifest,
  PipelineStateSpec,
} from '../rust/boundary-contract';
import { expandManifest, type CompactManifest, type CompactGlobalSpec, type CompactScalarSpec } from './manifest';
import { inferComputeDeps, inferDrawCallDeps } from './deps';
import { compileShaderBody, type ShaderContext, type WalkerResult } from './walker';
import * as B from './ir-builders';

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

/** Render target helper — returns RenderPassSpec['targets'] */
export const clearTarget = (clearColor: readonly [number, number, number, number]): RenderPassSpec['targets'] =>
  ({ colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor }] });

/** Pipeline state presets — named constants, not default-filling logic */
export const OPAQUE: PipelineStateSpec =
  { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' };

export const ALPHA_BLEND: PipelineStateSpec =
  { blendMode: 'alpha', cullMode: 'none', depthWrite: false, depthCompare: 'always' };

export const DEPTH_TEST: PipelineStateSpec =
  { blendMode: 'opaque', cullMode: 'none', depthWrite: true, depthCompare: 'less' };

// ---------------------------------------------------------------------------
// Camera specs — describe projection type + initial parameters
// ---------------------------------------------------------------------------

export interface CameraSpec {
  readonly type: 'ortho' | 'perspective';
  readonly params: Record<string, number>;
}

/** Orthographic camera (default 2D view). Maps world [0,1] to clip [-1,1]. */
export function ortho(opts?: {
  centerX?: number;
  centerY?: number;
  zoom?: number;
}): CameraSpec {
  return {
    type: 'ortho',
    params: {
      center_x: opts?.centerX ?? 0.5,
      center_y: opts?.centerY ?? 0.5,
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
      center_x: opts?.centerX ?? 0.5,
      center_y: opts?.centerY ?? 0.5,
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
  readonly vertexFn: Function;
  readonly fragmentFn: Function;
  readonly constants?: Record<string, number>;
  readonly domainId: string;
}

interface DeferredRenderPass {
  readonly type: 'Render';
  readonly passId: string;
  readonly targets: RenderPassSpec['targets'];
  readonly drawCalls: readonly DeferredDrawCall[];
  readonly cameraName?: string;
}

interface DeferredCameraPass {
  readonly type: 'System_CameraUpdate';
  readonly cameraRef: string;
  readonly bodyFn: Function;
}

type DeferredRosterEntry = DeferredComputePass | DeferredRenderPass | DeferredCameraPass | SystemPassSpec;

// ---------------------------------------------------------------------------
// gpu()
// ---------------------------------------------------------------------------

export interface GpuSpec extends CompactManifest {
  readonly camera?: CameraSpec;
  readonly cameras?: Record<string, CameraSpec>;
  readonly roster: readonly DeferredRosterEntry[];
}

/** Resolved camera: name → VP symbol + spec */
interface ResolvedCamera {
  readonly name: string;
  readonly vpSymbol: string;
  readonly spec: CameraSpec;
  readonly globals: Record<string, CompactGlobalSpec>;
  readonly scalars: Record<string, CompactScalarSpec>;
  readonly pass: DeferredCameraPass;
}

export function gpu(spec: GpuSpec): PipelineInstallPayload {
  // Resolve cameras
  const cameras = resolveCameras(spec);
  const cameraMap = new Map(cameras.map(c => [c.name, c]));

  // Merge camera globals/scalars into the manifest
  const mergedGlobals: Record<string, string | CompactGlobalSpec> = {
    ...(spec.globals ?? {}),
    // sys:resolution always injected when cameras exist
    ...(cameras.length > 0 ? { 'sys:resolution': 'vec2' } : {}),
  };
  const mergedScalars: Record<string, CompactScalarSpec> = { ...(spec.scalars ?? {}) };
  for (const cam of cameras) {
    Object.assign(mergedGlobals, cam.globals);
    Object.assign(mergedScalars, cam.scalars);
  }

  const mergedSpec: CompactManifest = {
    ...spec,
    globals: mergedGlobals,
    scalars: mergedScalars,
  };
  const manifest = expandManifest(mergedSpec);

  // Compile camera passes, then roster entries
  const cameraPasses = cameras.map(cam =>
    compileCameraEntry(cam.pass, manifest),
  );

  const compiledRoster = spec.roster.map(entry => {
    // Resolve camera name for render passes
    if (entry.type === 'Render') {
      const renderEntry = entry as DeferredRenderPass;
      const cameraRef = resolveRenderPassCamera(renderEntry, cameras, cameraMap);
      return compileRenderEntry(renderEntry, manifest, cameraRef);
    }
    return compileEntry(entry, manifest);
  });

  const roster = [...cameraPasses, ...compiledRoster];
  return { manifest, roster };
}

// ---------------------------------------------------------------------------
// Camera resolution helpers
// ---------------------------------------------------------------------------

function resolveCameras(spec: GpuSpec): ResolvedCamera[] {
  if (spec.camera && spec.cameras) {
    throw new Error('gpu(): specify either `camera` or `cameras`, not both');
  }

  const cameraEntries: [string, CameraSpec][] = [];
  if (spec.camera) {
    cameraEntries.push(['default', spec.camera]);
  } else if (spec.cameras) {
    for (const [name, camSpec] of Object.entries(spec.cameras)) {
      cameraEntries.push([name, camSpec]);
    }
  }

  return cameraEntries.map(([name, camSpec]) => {
    const prefix = cameraEntries.length === 1 ? 'cam' : `cam:${name}`;
    const vpSymbol = `${prefix}:vp`;

    // Camera parameter globals (initial values from spec)
    const globals: Record<string, CompactGlobalSpec> = {};
    for (const [key, value] of Object.entries(camSpec.params)) {
      globals[`${prefix}:${key}`] = { f32: value, dynamic: true };
    }

    // VP matrix scalar output
    const scalars: Record<string, CompactScalarSpec> = { [vpSymbol]: 'mat4x4' };

    // Camera compute pass body
    const pass = buildCameraPass(camSpec, prefix, vpSymbol);

    return { name, vpSymbol, spec: camSpec, globals, scalars, pass };
  });
}

function resolveRenderPassCamera(
  entry: DeferredRenderPass,
  cameras: ResolvedCamera[],
  cameraMap: Map<string, ResolvedCamera>,
): string {
  if (cameras.length === 0) return '';

  if (entry.cameraName) {
    const cam = cameraMap.get(entry.cameraName);
    if (!cam) throw new Error(`render('${entry.passId}'): camera '${entry.cameraName}' not found. Available: ${cameras.map(c => c.name).join(', ')}`);
    return cam.vpSymbol;
  }

  // No explicit camera name — if only one camera, use it implicitly
  if (cameras.length === 1) return cameras[0].vpSymbol;

  throw new Error(`render('${entry.passId}'): multiple cameras defined but no { camera: '...' } specified`);
}



/**
 * Build a camera pass with literal symbol references (no template literals).
 * Uses new Function() to construct a function whose toString() contains
 * only literal strings — the walker parses fn.toString(), so closures
 * with template literals don't work.
 */
function buildCameraPass(spec: CameraSpec, prefix: string, vpSymbol: string): DeferredCameraPass {
  const body = spec.type === 'ortho'
    ? buildOrthoCameraBody(prefix, vpSymbol)
    : buildPerspectiveCameraBody(prefix, vpSymbol);

  return { type: 'System_CameraUpdate', cameraRef: vpSymbol, bodyFn: body };
}

function buildOrthoCameraBody(prefix: string, vpSymbol: string): Function {
  // Construct source with literal strings — no template literals in the output
  const src = `() => {
  const res = $global.resolution;
  const aspect = res.x / res.y;
  const cx = $global['${prefix}:center_x'];
  const cy = $global['${prefix}:center_y'];
  const zoom = $global['${prefix}:zoom'];
  const sx = 2.0 * zoom / max(aspect, 1.0);
  const sy = 2.0 * zoom * min(aspect, 1.0);
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

export interface ShaderFns {
  readonly vertex: Function;
  readonly fragment: Function;
  readonly constants?: Record<string, number>;
}

export function render(
  passId: string,
  targets: RenderPassSpec['targets'],
  drawCalls: readonly DeferredDrawCall[],
  opts?: { camera?: string },
): DeferredRenderPass {
  return { type: 'Render', passId, targets, drawCalls, cameraName: opts?.camera };
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
    vertexFn: shaders.vertex,
    fragmentFn: shaders.fragment,
    constants: shaders.constants,
    domainId: source.type === 'Domain' ? source.domainId : '',
  };
}

// ---------------------------------------------------------------------------
// Internal compilation
// ---------------------------------------------------------------------------

function compileEntry(
  entry: DeferredRosterEntry,
  manifest: MemoryManifest,
): ComputePassSpec | RenderPassSpec | SystemPassSpec | SystemCameraUpdateSpec {
  if (entry.type === 'System_DrawPrep') return entry;
  if (entry.type === 'Compute') return compileComputeEntry(entry as DeferredComputePass, manifest);
  if (entry.type === 'System_CameraUpdate') return compileCameraEntry(entry as DeferredCameraPass, manifest);
  return compileRenderEntry(entry as DeferredRenderPass, manifest, '');
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
  cameraRef: string,
): RenderPassSpec {
  const drawCalls: DrawCallSpec[] = entry.drawCalls.map(dc => {
    const vertexAst = unwrapWalkerResult(compileShaderBody(dc.vertexFn, { stage: 'vertex', manifest, constants: dc.constants }));
    const fragmentAst = unwrapWalkerResult(compileShaderBody(dc.fragmentFn, { stage: 'fragment', manifest, constants: dc.constants }));

    // [LAW:single-enforcer] Auto-inject VP multiply: ReturnVertex.position → vp * position
    // Camera association comes from the render pass, not the draw call.
    // Fixture authors write world-space positions; the camera transform is automatic.
    if (cameraRef) {
      const vpLoad = B.loadScalar(cameraRef);
      for (let i = 0; i < vertexAst.length; i++) {
        const stmt = vertexAst[i];
        if (stmt.type === 'ReturnVertex') {
          vertexAst[i] = B.returnVertex(
            B.binop('*', vpLoad, stmt.position),
            stmt.varyings,
          );
        }
      }
    }

    const deps = inferDrawCallDeps(vertexAst, fragmentAst, manifest, cameraRef);

    return {
      intentId: dc.intentId,
      source: dc.source,
      pipelineState: dc.pipelineState,
      dependencies: deps,
      vertexAst,
      fragmentAst,
    };
  });

  return {
    type: 'Render',
    passId: entry.passId,
    sourceBlockIds: [],
    targets: entry.targets,
    drawCalls,
  };
}
