import { getAnyBlockDefinition, type OutputDef } from '../../blocks/registry';
import { PatchBuilder, type Block, type Edge, type Endpoint, type Patch } from '../../graph/Patch';
import { deriveEdgeAlias } from '../../graph/edge-alias';
import type { BlockId, EdgeRole, PortId } from '../../types';
import { addressToString } from '../../types/canonical-address';
import { normalizeCanonicalName } from '../../core/canonical-name';
import {
  analyzeFrontend,
  type FrontendAnalysis,
  type FrontendError,
} from './index';
import { getPortHint } from './type-facts';
import { buildFrontendSemanticMaps } from './semantic-snapshot';
import type {
  AddSourceBlockOutputResult,
  AddSourceBlockResult,
  AddSourceBlocksQuery,
  AuthoringBatchResult,
  AuthoringCandidateResultBase,
  AuthoringCandidateStatus,
  AuthoringInsertedArtifacts,
  AuthoringMutationMode,
  AuthoringQuery,
  AuthoringQueryOptions,
  AuthoringTargetInput,
  ConnectExistingSourceResult,
  ConnectExistingSourcesQuery,
} from './authoring-query-types';

type QueryPrecheck = {
  readonly ok: true;
  readonly targetBlock: Block;
} | {
  readonly ok: false;
  readonly reasonKind: string;
  readonly reason: string;
};

function sanitizeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9:_-]/g, '_');
}

function makeUniqueBlockId(patch: Patch, seed: string): BlockId {
  const base = sanitizeIdPart(seed);
  let index = 0;
  let id = base as BlockId;
  while (patch.blocks.has(id)) {
    index += 1;
    id = `${base}_${index}` as BlockId;
  }
  return id;
}

function makeUniqueEdgeId(patch: Patch, seed: string): string {
  const base = sanitizeIdPart(seed);
  const existing = new Set(patch.edges.map((edge) => edge.id));
  let index = 0;
  let id = base;
  while (existing.has(id)) {
    index += 1;
    id = `${base}_${index}`;
  }
  return id;
}

function cloneInputPortsWithOwnerIds(blockId: BlockId, block: Block): Block['inputPorts'] {
  return new Map(
    Array.from(block.inputPorts.entries(), ([portId, port]) => [
      portId,
      port.authoredControl
        ? {
            ...port,
            authoredControl: {
              ...port.authoredControl,
              ownerId: `${blockId}:${portId as PortId}` as `${BlockId}:${PortId}`,
            },
          }
        : port,
    ]),
  );
}

function buildHypotheticalBlock(patch: Patch, blockType: string, candidateId: string): Block {
  const builder = new PatchBuilder();
  const tempId = builder.addBlock(blockType);
  const tempBlock = builder.build().blocks.get(tempId)!;
  const blockId = makeUniqueBlockId(patch, `_aq_${candidateId}_${blockType}`);
  const displayName = `${tempBlock.displayName} [query]`;

  return {
    ...tempBlock,
    id: blockId,
    displayName,
    inputPorts: cloneInputPortsWithOwnerIds(blockId, tempBlock),
    outputPorts: new Map(tempBlock.outputPorts),
  };
}

function createHypotheticalEdge(
  patchBlocks: ReadonlyMap<BlockId, Block>,
  from: Endpoint,
  to: Endpoint,
  seed: string,
): Edge {
  const edgePatch: Patch = { blocks: patchBlocks, edges: [] };
  const role: EdgeRole = { kind: 'user', meta: {} as Record<string, never> };
  return {
    id: sanitizeIdPart(seed),
    from,
    to,
    enabled: true,
    sortKey: 0,
    role,
    alias: deriveEdgeAlias(from, edgePatch.blocks),
  };
}

function removeIncomingWriters(
  edges: readonly Edge[],
  target: AuthoringTargetInput,
  mode: AuthoringMutationMode,
): Edge[] {
  const shouldKeepEdge = (edge: Edge) => {
    if (mode !== 'replaceWriter') return true;
    return !(edge.to.blockId === target.blockId && edge.to.slotId === target.portId);
  };
  return edges.filter(shouldKeepEdge);
}

function addHypotheticalWriter(
  patch: Patch,
  target: AuthoringTargetInput,
  from: Endpoint,
  edgeSeed: string,
  mode: AuthoringMutationMode,
): Patch {
  const keptEdges = removeIncomingWriters(patch.edges, target, mode);
  const blocks = new Map(patch.blocks);
  const edgeId = makeUniqueEdgeId({ blocks, edges: keptEdges }, edgeSeed);
  const newEdge = {
    ...createHypotheticalEdge(
      blocks,
      from,
      { kind: 'port', blockId: target.blockId, slotId: target.portId },
      edgeId,
    ),
    id: edgeId,
    sortKey: keptEdges.length,
  };
  return {
    blocks,
    edges: [...keptEdges, newEdge],
  };
}

function addHypotheticalSourceBlock(
  patch: Patch,
  target: AuthoringTargetInput,
  blockType: string,
  outputPortId: PortId,
  candidateId: string,
  mode: AuthoringMutationMode,
): { readonly patch: Patch; readonly blockId: BlockId } {
  const block = buildHypotheticalBlock(patch, blockType, candidateId);
  const blocks = new Map(patch.blocks);
  blocks.set(block.id, block);
  const patchWithBlock: Patch = { blocks, edges: patch.edges };
  return {
    blockId: block.id,
    patch: addHypotheticalWriter(
      patchWithBlock,
      target,
      { kind: 'port', blockId: block.id, slotId: outputPortId },
      `_aq_edge_${candidateId}_${outputPortId}`,
      mode,
    ),
  };
}

function errorKey(error: FrontendError): string {
  return [
    error.kind,
    error.message,
    error.blockId ?? '',
    error.portId ?? '',
    error.severity,
  ].join('|');
}

function diffDiagnostics(
  baseline: readonly FrontendError[],
  candidate: readonly FrontendError[],
): FrontendError[] {
  const baselineKeys = new Set(baseline.map(errorKey));
  return candidate.filter((error) => !baselineKeys.has(errorKey(error)));
}

function buildInsertedArtifacts(
  baseline: FrontendAnalysis,
  candidate: FrontendAnalysis,
): AuthoringInsertedArtifacts {
  const baselineBlockIds = new Set(baseline.fixpointResult.graph.blocks.map((block) => block.id));
  const baselineEdgeIds = new Set(baseline.fixpointResult.graph.edges.map((edge) => edge.id));

  const newBlocks = candidate.fixpointResult.graph.blocks.filter((block) => !baselineBlockIds.has(block.id));
  const newEdges = candidate.fixpointResult.graph.edges.filter((edge) => !baselineEdgeIds.has(edge.id));

  const adapterBlocks = newBlocks
    .filter((block) => typeof block.origin === 'object' && block.origin.role === 'adapter')
    .map((block) => block.id);
  const defaultSourceBlocks = newBlocks
    .filter((block) => typeof block.origin === 'object' && block.origin.role === 'defaultSource')
    .map((block) => block.id);

  return {
    blocks: newBlocks.map((block) => block.id),
    edges: newEdges.map((edge) => edge.id),
    adapterBlocks,
    defaultSourceBlocks,
  };
}

function hasPathToTarget(
  analysis: FrontendAnalysis,
  sourceBlockId: string,
  sourcePortId: string,
  targetBlockId: string,
  targetPortId: string,
): boolean {
  const queue: Array<{ readonly blockId: string; readonly portId: string }> = [
    { blockId: sourceBlockId, portId: sourcePortId },
  ];
  const visited = new Set([`${sourceBlockId}\u0000${sourcePortId}`]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const directHit = current.blockId === targetBlockId && current.portId === targetPortId;
    if (directHit) {
      return true;
    }

    const nextEdges = analysis.fixpointResult.graph.edges.filter(
      (edge) => edge.from.blockId === current.blockId && edge.from.port === current.portId,
    );
    for (const edge of nextEdges) {
      const nextKey = `${edge.to.blockId}\u0000${edge.to.port}`;
      const hitsTarget = edge.to.blockId === targetBlockId && edge.to.port === targetPortId;
      if (hitsTarget) {
        return true;
      }
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push({ blockId: edge.to.blockId, portId: edge.to.port });
    }
  }

  return false;
}

function precheckTarget(patch: Patch, target: AuthoringTargetInput): QueryPrecheck {
  const targetBlock = patch.blocks.get(target.blockId);
  if (!targetBlock) {
    return {
      ok: false,
      reasonKind: 'targetBlockMissing',
      reason: `Target block ${target.blockId} not found`,
    };
  }

  const targetDef = getAnyBlockDefinition(targetBlock.type);
  const inputDef = targetDef?.inputs[target.portId];
  if (!targetDef || !inputDef) {
    return {
      ok: false,
      reasonKind: 'targetInputMissing',
      reason: `Target input ${target.blockId}.${target.portId} not found`,
    };
  }

  if (inputDef.exposedAsPort === false) {
    return {
      ok: false,
      reasonKind: 'targetNotBindable',
      reason: `Target input ${target.blockId}.${target.portId} is config-only`,
    };
  }

  return { ok: true, targetBlock };
}

function baseCandidateResult(
  candidateId: string,
  reasonKind: string,
  reason: string,
): AuthoringCandidateResultBase {
  return {
    candidateId,
    status: 'blocked',
    reasonKind,
    reason,
    diagnostics: [],
    controlSurface: [],
    insertedArtifacts: {
      blocks: [],
      edges: [],
      adapterBlocks: [],
      defaultSourceBlocks: [],
    },
  };
}

function resolveCandidateResult(
  baseline: FrontendAnalysis,
  candidate: FrontendAnalysis,
  target: AuthoringTargetInput,
  sourceRef: { readonly blockId: string; readonly portId: string },
  candidateId: string,
): AuthoringCandidateResultBase {
  const diagnostics = diffDiagnostics(
    baseline.frontendResult.errors,
    candidate.frontendResult.errors,
  );
  const semantics = buildFrontendSemanticMaps(
    candidate.frontendResult.normalizedPatch,
    candidate.frontendResult.typedPatch,
  );
  const targetAddress = addressToString({
    kind: 'input',
    blockId: target.blockId,
    canonicalName: normalizeCanonicalName(target.blockId),
    portId: target.portId,
  });
  const binding = semantics.inputBindings.get(targetAddress);
  const targetHint = getPortHint(candidate.fixpointResult.facts, target.blockId, target.portId, 'in');
  const sourceHint = getPortHint(candidate.fixpointResult.facts, sourceRef.blockId, sourceRef.portId, 'out');
  const insertedArtifacts = buildInsertedArtifacts(baseline, candidate);

  const blockingDiagnostics = diagnostics.filter((error) => error.severity === 'error');
  const hasConflict = targetHint.status === 'conflict' || sourceHint.status === 'conflict';
  const candidateAppearsInBinding = binding?.sourceBlockId === sourceRef.blockId
    && binding?.sourcePortId === sourceRef.portId;
  const candidateMaterialized = candidateAppearsInBinding
    || hasPathToTarget(candidate, sourceRef.blockId, sourceRef.portId, target.blockId, target.portId)
    || insertedArtifacts.blocks.length > 0
    || insertedArtifacts.edges.length > 0;

  let status: AuthoringCandidateStatus;
  let reasonKind: string;
  let reason: string;
  if (!candidateMaterialized) {
    status = 'invalid';
    reasonKind = 'candidateNotMaterialized';
    reason = `Candidate did not materialize a satisfiable authored change for ${target.blockId}.${target.portId}`;
  } else if (hasConflict || blockingDiagnostics.length > 0) {
    status = 'invalid';
    reasonKind = hasConflict ? 'typeConflict' : 'candidateDiagnostics';
    reason = hasConflict
      ? `Current constraints contradict ${sourceRef.blockId}.${sourceRef.portId} → ${target.blockId}.${target.portId}`
      : blockingDiagnostics[0]?.message ?? 'Candidate introduces blocking diagnostics';
  } else if (targetHint.status === 'ok' && sourceHint.status === 'ok') {
    status = 'valid';
    reasonKind = insertedArtifacts.adapterBlocks.length > 0 ? 'satisfiedViaAdapter' : 'satisfied';
    reason = insertedArtifacts.adapterBlocks.length > 0
      ? `Connection is satisfiable through ${insertedArtifacts.adapterBlocks.length} adapter block(s)`
      : `Connection is satisfiable`;
  } else {
    status = 'deferred';
    reasonKind = 'unresolvedTypes';
    reason = `Connection remains admissible but depends on unresolved type facts`;
  }

  return {
    candidateId,
    status,
    reasonKind,
    reason,
    diagnostics,
    resolvedTargetType: targetHint.canonical,
    resolvedSourceType: sourceHint.canonical,
    binding,
    controlSurface: binding?.controls ?? [],
    insertedArtifacts,
  };
}

function connectExistingSources(
  patch: Patch,
  query: ConnectExistingSourcesQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<ConnectExistingSourceResult> {
  const baseline = analyzeFrontend(patch, options.frontendOptions);
  const targetPrecheck = precheckTarget(patch, query.target);
  if (!targetPrecheck.ok) {
    return {
      queryKind: query.kind,
      target: query.target,
      mutationMode: options.mutationMode,
      baselineStatus: 'blocked',
      baselineReasonKind: targetPrecheck.reasonKind,
      baselineReason: targetPrecheck.reason,
      results: query.candidates.map((candidate) => ({
        kind: 'connectExistingSources',
        sourceBlockId: candidate.sourceBlockId,
        sourcePortId: candidate.sourcePortId,
        ...baseCandidateResult(candidate.candidateId, targetPrecheck.reasonKind, targetPrecheck.reason),
      })),
    };
  }

  const results: ConnectExistingSourceResult[] = query.candidates.map((candidate) => {
    const sourceBlock = patch.blocks.get(candidate.sourceBlockId);
    const sourceDef = sourceBlock ? getAnyBlockDefinition(sourceBlock.type) : undefined;
    const sourceOutput = sourceDef?.outputs[candidate.sourcePortId];
    if (!sourceBlock || !sourceOutput) {
      return {
        kind: 'connectExistingSources',
        sourceBlockId: candidate.sourceBlockId,
        sourcePortId: candidate.sourcePortId,
        ...baseCandidateResult(
          candidate.candidateId,
          'sourceOutputMissing',
          `Source output ${candidate.sourceBlockId}.${candidate.sourcePortId} not found`,
        ),
      };
    }

    const hypotheticalPatch = addHypotheticalWriter(
      patch,
      query.target,
      { kind: 'port', blockId: candidate.sourceBlockId, slotId: candidate.sourcePortId },
      `_aq_edge_${candidate.candidateId}`,
      options.mutationMode,
    );
    const candidateAnalysis = analyzeFrontend(hypotheticalPatch, options.frontendOptions);
    return {
      kind: 'connectExistingSources',
      sourceBlockId: candidate.sourceBlockId,
      sourcePortId: candidate.sourcePortId,
      ...resolveCandidateResult(
        baseline,
        candidateAnalysis,
        query.target,
        { blockId: candidate.sourceBlockId, portId: candidate.sourcePortId },
        candidate.candidateId,
      ),
    };
  });

  return {
    queryKind: query.kind,
    target: query.target,
    mutationMode: options.mutationMode,
    baselineStatus: 'ready',
    results,
  };
}

function outputRanking(status: AuthoringCandidateStatus): number {
  switch (status) {
    case 'valid':
      return 0;
    case 'deferred':
      return 1;
    case 'invalid':
      return 2;
    case 'blocked':
      return 3;
    default:
      return 99;
  }
}

function pickBestOutput(outputs: readonly AddSourceBlockOutputResult[]): AddSourceBlockOutputResult | undefined {
  return [...outputs].sort((a, b) => {
    const rankDiff = outputRanking(a.status) - outputRanking(b.status);
    if (rankDiff !== 0) return rankDiff;
    return String(a.outputPortId).localeCompare(String(b.outputPortId));
  })[0];
}

function addSourceBlocks(
  patch: Patch,
  query: AddSourceBlocksQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<AddSourceBlockResult> {
  const baseline = analyzeFrontend(patch, options.frontendOptions);
  const targetPrecheck = precheckTarget(patch, query.target);
  if (!targetPrecheck.ok) {
    return {
      queryKind: query.kind,
      target: query.target,
      mutationMode: options.mutationMode,
      baselineStatus: 'blocked',
      baselineReasonKind: targetPrecheck.reasonKind,
      baselineReason: targetPrecheck.reason,
      results: query.candidates.map((candidate) => ({
        kind: 'addSourceBlocks',
        blockType: candidate.blockType,
        outputs: [],
        ...baseCandidateResult(candidate.candidateId, targetPrecheck.reasonKind, targetPrecheck.reason),
      })),
    };
  }

  const results: AddSourceBlockResult[] = query.candidates.map((candidate) => {
    const blockDef = getAnyBlockDefinition(candidate.blockType);
    if (!blockDef) {
      return {
        kind: 'addSourceBlocks',
        blockType: candidate.blockType,
        outputs: [],
        ...baseCandidateResult(
          candidate.candidateId,
          'candidateBlockUnknown',
          `Candidate block type ${candidate.blockType} not found`,
        ),
      };
    }

    const outputs = Object.entries(blockDef.outputs)
      .filter(([, outputDef]) => !outputDef.hidden)
      .map(([outputPortId, _outputDef]): [PortId, OutputDef] => [outputPortId as PortId, _outputDef]);

    if (outputs.length === 0) {
      return {
        kind: 'addSourceBlocks',
        blockType: candidate.blockType,
        outputs: [],
        ...{
          ...baseCandidateResult(
            candidate.candidateId,
            'candidateHasNoOutputs',
            `Candidate block type ${candidate.blockType} has no exposed outputs`,
          ),
          status: 'invalid' as const,
        },
      };
    }

    const outputResults: AddSourceBlockOutputResult[] = outputs.map(([outputPortId]) => {
      const { patch: hypotheticalPatch, blockId } = addHypotheticalSourceBlock(
        patch,
        query.target,
        candidate.blockType,
        outputPortId,
        candidate.candidateId,
        options.mutationMode,
      );
      const candidateAnalysis = analyzeFrontend(hypotheticalPatch, options.frontendOptions);
      return {
        outputPortId,
        ...resolveCandidateResult(
          baseline,
          candidateAnalysis,
          query.target,
          { blockId, portId: outputPortId },
          candidate.candidateId,
        ),
      };
    });

    const bestOutput = pickBestOutput(outputResults);
    return {
      kind: 'addSourceBlocks',
      candidateId: candidate.candidateId,
      blockType: candidate.blockType,
      status: bestOutput?.status ?? 'invalid',
      reasonKind: bestOutput?.reasonKind ?? 'candidateHasNoOutputs',
      reason: bestOutput?.reason ?? `Candidate block type ${candidate.blockType} has no exposed outputs`,
      diagnostics: bestOutput?.diagnostics ?? [],
      resolvedTargetType: bestOutput?.resolvedTargetType,
      resolvedSourceType: bestOutput?.resolvedSourceType,
      binding: bestOutput?.binding,
      controlSurface: bestOutput?.controlSurface ?? [],
      insertedArtifacts: bestOutput?.insertedArtifacts ?? {
        blocks: [],
        edges: [],
        adapterBlocks: [],
        defaultSourceBlocks: [],
      },
      outputs: outputResults,
      bestOutputPortId: bestOutput?.outputPortId,
    };
  });

  return {
    queryKind: query.kind,
    target: query.target,
    mutationMode: options.mutationMode,
    baselineStatus: 'ready',
    results,
  };
}

export function runAuthoringQuery(
  patch: Patch,
  query: ConnectExistingSourcesQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<ConnectExistingSourceResult>;
export function runAuthoringQuery(
  patch: Patch,
  query: AddSourceBlocksQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<AddSourceBlockResult>;
export function runAuthoringQuery(
  patch: Patch,
  query: AuthoringQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<ConnectExistingSourceResult | AddSourceBlockResult> {
  if (query.kind === 'connectExistingSources') {
    return connectExistingSources(patch, query, options);
  }
  return addSourceBlocks(patch, query, options);
}

export function queryConnectExistingSources(
  patch: Patch,
  query: ConnectExistingSourcesQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<ConnectExistingSourceResult> {
  return connectExistingSources(patch, query, options);
}

export function queryAddSourceBlocks(
  patch: Patch,
  query: AddSourceBlocksQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<AddSourceBlockResult> {
  return addSourceBlocks(patch, query, options);
}
