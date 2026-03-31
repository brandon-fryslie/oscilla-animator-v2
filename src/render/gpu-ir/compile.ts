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
  DrawCallSpec,
  MemoryManifest,
  PipelineStateSpec,
  WgslType,
} from '../rust/boundary-contract';
import { expandManifest, type CompactManifest } from './manifest';
import { inferComputeDeps, inferDrawCallDeps } from './deps';
import { compileShaderBody, type ShaderContext } from './walker';
import * as B from './ir-builders';

// ---------------------------------------------------------------------------
// Dispatch / workgroup helpers
// ---------------------------------------------------------------------------

export interface ExactDispatch {
  readonly _tag: 'exact';
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface WorkgroupSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const exact = (x: number, y = 1, z = 1): ExactDispatch =>
  ({ _tag: 'exact', x, y, z });

export const wg = (x: number, y = 1, z = 1): WorkgroupSize =>
  ({ x, y, z });

// ---------------------------------------------------------------------------
// Deferred types — internal, carry arrow fns until gpu() compiles them
// ---------------------------------------------------------------------------

interface DeferredComputePass {
  readonly type: 'Compute';
  readonly passId: string;
  readonly workgroupSize: readonly [number, number, number];
  readonly dispatch: ComputePassSpec['dispatch'];
  readonly bodyFn: Function;
  readonly dispatchDomain?: string;
}

interface DeferredDrawCall {
  readonly intentId: string;
  readonly source: DrawCallSpec['source'];
  readonly pipelineState: DrawCallSpec['pipelineState'];
  readonly vertexFn: Function;
  readonly fragmentFn: Function;
  readonly domainId: string;
}

interface DeferredRenderPass {
  readonly type: 'Render';
  readonly passId: string;
  readonly targets: RenderPassSpec['targets'];
  readonly drawCalls: readonly DeferredDrawCall[];
}

type DeferredRosterEntry = DeferredComputePass | DeferredRenderPass | SystemPassSpec;

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
  dispatch: string | ExactDispatch,
  workgroup: WorkgroupSize,
  body: Function,
): DeferredComputePass {
  return {
    type: 'Compute',
    passId,
    workgroupSize: [workgroup.x, workgroup.y, workgroup.z],
    dispatch: typeof dispatch === 'string'
      ? { mode: 'Domain', domainId: dispatch }
      : { mode: 'Exact', x: dispatch.x, y: dispatch.y, z: dispatch.z },
    bodyFn: body,
    dispatchDomain: typeof dispatch === 'string' ? dispatch : undefined,
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

export interface RenderTargets {
  readonly clear: readonly [number, number, number, number];
}

export function render(
  passId: string,
  targets: RenderTargets,
  drawCalls: readonly DeferredDrawCall[],
): DeferredRenderPass {
  return {
    type: 'Render',
    passId,
    targets: {
      colors: [{ textureId: 'canvas', loadOp: 'clear' as const, clearColor: targets.clear }],
    },
    drawCalls,
  };
}

export interface CompactPipelineState {
  readonly blend?: PipelineStateSpec['blendMode'];
  readonly cull?: PipelineStateSpec['cullMode'];
  readonly depthWrite?: boolean;
  readonly depthCompare?: PipelineStateSpec['depthCompare'];
}

export interface ShaderFns {
  readonly vertex: Function;
  readonly fragment: Function;
}

export function draw(
  intentId: string,
  domainId: string,
  shapeId: string,
  state: CompactPipelineState,
  shaders: ShaderFns,
): DeferredDrawCall {
  return {
    intentId,
    source: { type: 'Domain', domainId, sourceKind: 'Topology', shapeId },
    pipelineState: {
      blendMode: state.blend ?? 'opaque',
      cullMode: state.cull ?? 'none',
      depthWrite: state.depthWrite ?? false,
      depthCompare: state.depthCompare ?? 'always',
    },
    vertexFn: shaders.vertex,
    fragmentFn: shaders.fragment,
    domainId,
  };
}

// ---------------------------------------------------------------------------
// Internal compilation
// ---------------------------------------------------------------------------

function compileEntry(
  entry: DeferredRosterEntry,
  manifest: MemoryManifest,
): ComputePassSpec | RenderPassSpec | SystemPassSpec {
  if (entry.type === 'System_DrawPrep') return entry;
  if (entry.type === 'Compute') return compileComputeEntry(entry as DeferredComputePass, manifest);
  return compileRenderEntry(entry as DeferredRenderPass, manifest);
}

function compileComputeEntry(entry: DeferredComputePass, manifest: MemoryManifest): ComputePassSpec {
  const ctx: ShaderContext = { stage: 'compute', manifest };
  const ast = compileShaderBody(entry.bodyFn, ctx);

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
    const vertexAst = compileShaderBody(dc.vertexFn, { stage: 'vertex', manifest });
    const fragmentAst = compileShaderBody(dc.fragmentFn, { stage: 'fragment', manifest });

    const deps = inferDrawCallDeps(vertexAst, fragmentAst, manifest);

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
