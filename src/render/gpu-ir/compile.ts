/**
 * GPU-IR DSL: Compilation orchestrator.
 *
 * Public API: gpu(), compute(), render(), draw(), drawPrep(), exact(), wg()
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
  readonly cameraRef: string;
}

interface DeferredRenderPass {
  readonly type: 'Render';
  readonly passId: string;
  readonly targets: RenderPassSpec['targets'];
  readonly drawCalls: readonly DeferredDrawCall[];
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
  readonly roster: readonly DeferredRosterEntry[];
}

export function gpu(spec: GpuSpec): PipelineInstallPayload {
  const manifest = expandManifest(spec);
  const roster = spec.roster.map(entry => compileEntry(entry, manifest));
  return { manifest, roster };
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

export function cameraPass(cameraRef: string, bodyFn: Function): DeferredCameraPass {
  return { type: 'System_CameraUpdate', cameraRef, bodyFn };
}

// ---------------------------------------------------------------------------
// defaultCamera() — one-liner camera setup for fixtures
// ---------------------------------------------------------------------------

export interface CameraKit {
  readonly globals: Record<string, string | CompactGlobalSpec>;
  readonly scalars: Record<string, CompactScalarSpec>;
  readonly pass: DeferredCameraPass;
  readonly ref: string;
}

/**
 * Create a default orthographic camera kit.
 * Returns globals (center, zoom), a scalar (VP matrix), and the camera pass.
 * Spread into gpu(): `...cam.globals`, `...cam.scalars`, `cam.pass`, `cam.ref`.
 */
export function defaultCamera(opts?: { vpSymbol?: string }): CameraKit {
  const vpSymbol = opts?.vpSymbol ?? 'sys:view_proj';
  return {
    globals: {
      'cam:center_x': { f32: 0.5, dynamic: true },
      'cam:center_y': { f32: 0.5, dynamic: true },
      'cam:zoom': { f32: 1.0, dynamic: true },
    },
    scalars: { [vpSymbol]: 'mat4x4' },
    pass: cameraPass(vpSymbol, () => {
      // Stubs — parsed from source by the walker, never called
      const res = $global.resolution;
      const aspect = res.x / res.y;
      const cx = $global['cam:center_x'];
      const cy = $global['cam:center_y'];
      const zoom = $global['cam:zoom'];
      // Ortho VP: maps [0,1] → [-1,1] with aspect correction, pan, zoom
      const sx = 2.0 * zoom / max(aspect, 1.0);
      const sy = 2.0 * zoom * min(aspect, 1.0);
      $scalar.view_proj = mat4x4(
        sx,  0.0, 0.0, 0.0,
        0.0, sy,  0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        -sx * cx, -sy * cy, 0.0, 1.0,
      );
    }),
    ref: vpSymbol,
  };
}

// Ambient stubs for defaultCamera body — walker parses fn.toString(), never calls these
declare const $global: any;
declare const $scalar: any;
declare function max(a: any, b: any): any;
declare function min(a: any, b: any): any;
declare function mat4x4(...args: any[]): any;

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
): DeferredRenderPass {
  return { type: 'Render', passId, targets, drawCalls };
}

export function draw(
  intentId: string,
  source: DrawCallSpec['source'],
  pipelineState: PipelineStateSpec,
  shaders: ShaderFns,
  cameraRef: string,
): DeferredDrawCall {
  return {
    intentId,
    source,
    pipelineState,
    vertexFn: shaders.vertex,
    fragmentFn: shaders.fragment,
    constants: shaders.constants,
    domainId: source.type === 'Domain' ? source.domainId : '',
    cameraRef,
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
  return compileRenderEntry(entry as DeferredRenderPass, manifest);
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
    passId: 'camera',
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

function compileRenderEntry(entry: DeferredRenderPass, manifest: MemoryManifest): RenderPassSpec {
  const drawCalls: DrawCallSpec[] = entry.drawCalls.map(dc => {
    const vertexAst = unwrapWalkerResult(compileShaderBody(dc.vertexFn, { stage: 'vertex', manifest, constants: dc.constants }));
    const fragmentAst = unwrapWalkerResult(compileShaderBody(dc.fragmentFn, { stage: 'fragment', manifest, constants: dc.constants }));

    // [LAW:single-enforcer] Auto-inject VP multiply: ReturnVertex.position → vp * position
    // The cameraRef tells us which arena scalar holds the VP matrix.
    // Fixture authors write world-space positions; the camera transform is automatic.
    if (dc.cameraRef) {
      const vpLoad = B.loadScalar(dc.cameraRef);
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

    const deps = inferDrawCallDeps(vertexAst, fragmentAst, manifest, dc.cameraRef);

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
