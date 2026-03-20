import type { Patch, Block } from '../graph/Patch';
import type { BlockId } from '../types';
import { EventHub } from '../events/EventHub';
import { compileFromFrontend, type CompileResult, type CompileFromFrontendOptions } from './compile';
import { convertCompileErrorsToDiagnostics } from './diagnosticConversion';
import { compileFrontend, type FrontendOptions, type FrontendResult } from './frontend';
import { convertFrontendErrorsToDiagnostics } from './frontend/frontendDiagnosticConversion';
import type { Diagnostic } from '../diagnostics/types';

export interface BlockParamOverride {
  readonly blockId: BlockId;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface CompilePartialPatchOptions {
  readonly rootBlockIds: readonly BlockId[];
  readonly blockParamOverrides?: readonly BlockParamOverride[];
  readonly compileId?: string;
  readonly patchRevision?: number;
  readonly frontendOptions?: FrontendOptions;
}

export interface PartialCompileResult {
  readonly fragment: Patch;
  readonly frontendResult: FrontendResult;
  readonly backendResult: CompileResult | null;
  readonly diagnostics: readonly Diagnostic[];
}

function collectConnectedBlockIds(patch: Patch, rootBlockIds: readonly BlockId[]): ReadonlySet<BlockId> {
  const included = new Set<BlockId>(rootBlockIds);
  const stack = [...rootBlockIds];

  // [LAW:dataflow-not-control-flow] Fragment scope is the deterministic connected
  // closure of the requested roots; typing evidence can flow from either direction.
  while (stack.length > 0) {
    const currentBlockId = stack.pop()!;
    for (const edge of patch.edges) {
      if (edge.from.kind !== 'port' || edge.to.kind !== 'port') {
        continue;
      }
      const adjacentBlockId = edge.from.blockId === currentBlockId
        ? edge.to.blockId as BlockId
        : edge.to.blockId === currentBlockId
          ? edge.from.blockId as BlockId
          : null;
      if (!adjacentBlockId || included.has(adjacentBlockId)) {
        continue;
      }
      included.add(adjacentBlockId);
      stack.push(adjacentBlockId);
    }
  }

  return included;
}

function applyBlockOverrides(
  block: Block,
  overridesByBlockId: ReadonlyMap<BlockId, Readonly<Record<string, unknown>>>,
): Block {
  const params = overridesByBlockId.get(block.id as BlockId);
  return params
    ? { ...block, params: { ...block.params, ...params } }
    : block;
}

export function createConnectedPatchFragment(
  patch: Patch,
  rootBlockIds: readonly BlockId[],
  blockParamOverrides: readonly BlockParamOverride[] = [],
): Patch {
  const includedBlockIds = collectConnectedBlockIds(patch, rootBlockIds);
  const overridesByBlockId = new Map(blockParamOverrides.map((override) => [override.blockId, override.params]));

  // [LAW:one-source-of-truth] Partial compilation derives from canonical Patch
  // data by slicing and param override application; it does not invent a second graph model.
  const blocks = new Map(
    Array.from(patch.blocks.entries())
      .filter(([blockId]) => includedBlockIds.has(blockId))
      .map(([blockId, block]) => [blockId, applyBlockOverrides(block, overridesByBlockId)]),
  );

  const edges = patch.edges.filter((edge) => {
    if (edge.from.kind !== 'port' || edge.to.kind !== 'port') {
      return false;
    }
    return includedBlockIds.has(edge.from.blockId as BlockId) && includedBlockIds.has(edge.to.blockId as BlockId);
  });

  return { blocks, edges };
}

export function compilePartialPatch(
  patch: Patch,
  options: CompilePartialPatchOptions,
): PartialCompileResult {
  const fragment = createConnectedPatchFragment(patch, options.rootBlockIds, options.blockParamOverrides);
  const compileId = options.compileId ?? `partial:${options.rootBlockIds.join(',')}`;
  const patchRevision = options.patchRevision ?? 0;
  const frontendResult = compileFrontend(fragment, options.frontendOptions);
  const backendOptions: CompileFromFrontendOptions = {
    allowMissingTimeRoot: true,
    captureInspector: false,
    events: new EventHub(),
    patchId: compileId,
    patchRevision,
  };
  const backendResult = frontendResult.backendReady
    ? compileFromFrontend(frontendResult, backendOptions)
    : null;

  const diagnostics = [
    ...convertFrontendErrorsToDiagnostics(frontendResult.errors, patchRevision, compileId),
    ...(backendResult === null
      ? []
      : backendResult.kind === 'ok'
        ? convertCompileErrorsToDiagnostics(backendResult.warnings, patchRevision, compileId, 'warn')
        : convertCompileErrorsToDiagnostics(backendResult.errors, patchRevision, compileId)),
  ];

  return {
    fragment,
    frontendResult,
    backendResult,
    diagnostics,
  };
}
