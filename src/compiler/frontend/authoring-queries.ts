import {
  getAnyBlockDefinition,
  getBlockCategories,
  getBlockRegistryRevision,
  getBlockTypesByCategory,
  type InputDef,
  type OutputDef,
} from '../../blocks/registry';
import { payloadsEqual, unitsEqual } from '../../core/canonical-types';
import type { CanonicalType } from '../../core/canonical-types';
import type { InferenceCanonicalType } from '../../core/inference-types';
import { isPayloadVar } from '../../core/inference-types';
import { normalizeCanonicalName } from '../../core/canonical-name';
import { PatchBuilder, type Block, type Edge, type Endpoint, type Patch } from '../../graph/Patch';
import { deriveEdgeAlias } from '../../graph/edge-alias';
import type { BlockId, EdgeRole, PortId } from '../../types';
import { addressToString } from '../../types/canonical-address';
import { findAdapterChain, isAssignable } from '../../blocks/adapter-spec';
import {
  analyzeFrontend,
  type FrontendAnalysis,
  type FrontendError,
} from './index';
import { buildFrontendSemanticMaps } from './semantic-snapshot';
import { getPortHint } from './type-facts';
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
  AuthoringQueryMetrics,
  AuthoringQueryOptions,
  AuthoringTargetInput,
  ConnectExistingSourceResult,
  ConnectExistingSourcesQuery,
  ConnectTargetForSourceResult,
  ConnectTargetsForSourceQuery,
} from './authoring-query-types';

type QueryPrecheck = {
  readonly ok: true;
  readonly block: Block;
} | {
  readonly ok: false;
  readonly reasonKind: string;
  readonly reason: string;
};

type RegistryVisiblePort = {
  readonly portId: PortId;
  readonly type: InferenceCanonicalType;
};

type RegistryBlockPorts = {
  readonly blockType: string;
  readonly label: string;
  readonly category: string;
  readonly capability: string;
  readonly inputs: readonly RegistryVisiblePort[];
  readonly outputs: readonly RegistryVisiblePort[];
};

type RegistryCandidateIndex = {
  readonly revision: number;
  readonly blocks: ReadonlyMap<string, RegistryBlockPorts>;
};

type SourceRef = {
  readonly blockId: string;
  readonly portId: string;
};

type TargetRef = {
  readonly blockId: string;
  readonly portId: string;
};

let cachedRegistryIndex: RegistryCandidateIndex | null = null;

function nowMs(): number {
  return performance.now();
}

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

function emptyInsertedArtifacts(): AuthoringInsertedArtifacts {
  return {
    blocks: [],
    edges: [],
    adapterBlocks: [],
    defaultSourceBlocks: [],
  };
}

function emptyMetrics(candidateCount: number): AuthoringQueryMetrics {
  return {
    baselineAnalysisMs: 0,
    prefilterMs: 0,
    candidateCount,
    prefilteredCount: 0,
    exactEvaluationCount: 0,
    exactEvaluationMs: 0,
  };
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

  return {
    ...tempBlock,
    id: blockId,
    displayName: `${tempBlock.displayName} [query]`,
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
  return edges.filter((edge) => {
    if (mode !== 'replaceWriter') return true;
    return !(edge.to.blockId === target.blockId && edge.to.slotId === target.portId);
  });
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

  return {
    blocks: newBlocks.map((block) => block.id),
    edges: newEdges.map((edge) => edge.id),
    adapterBlocks: newBlocks
      .filter((block) => typeof block.origin === 'object' && block.origin.role === 'adapter')
      .map((block) => block.id),
    defaultSourceBlocks: newBlocks
      .filter((block) => typeof block.origin === 'object' && block.origin.role === 'defaultSource')
      .map((block) => block.id),
  };
}

function getRegistryCandidateIndex(): RegistryCandidateIndex {
  const revision = getBlockRegistryRevision();
  if (cachedRegistryIndex && cachedRegistryIndex.revision === revision) {
    return cachedRegistryIndex;
  }

  const blocks = new Map<string, RegistryBlockPorts>();
  for (const category of getBlockCategories()) {
    for (const blockDef of getBlockTypesByCategory(category)) {
      const def = getAnyBlockDefinition(blockDef.type);
      if (!def) continue;
      blocks.set(def.type, {
        blockType: def.type,
        label: def.label || def.type,
        category: def.category,
        capability: def.capability,
        inputs: Object.entries(def.inputs)
          .filter(([, inputDef]) => inputDef.exposedAsPort !== false)
          .map(([portId, inputDef]) => ({
            portId: portId as PortId,
            type: inputDef.type,
          })),
        outputs: Object.entries(def.outputs)
          .filter(([, outputDef]) => !outputDef.hidden)
          .map(([portId, outputDef]) => ({
            portId: portId as PortId,
            type: outputDef.type,
          })),
      });
    }
  }

  cachedRegistryIndex = { revision, blocks };
  return cachedRegistryIndex;
}

function inputAddressKey(blockId: string, portId: string): string {
  return addressToString({
    kind: 'input',
    blockId: blockId as BlockId,
    canonicalName: normalizeCanonicalName(blockId),
    portId: portId as PortId,
  });
}

function outputAddressKey(blockId: string, portId: string): string {
  return addressToString({
    kind: 'output',
    blockId: blockId as BlockId,
    canonicalName: normalizeCanonicalName(blockId),
    portId: portId as PortId,
  });
}

function getDeclaredInputType(patch: Patch, target: TargetRef): InferenceCanonicalType | undefined {
  const block = patch.blocks.get(target.blockId as BlockId);
  const blockDef = block ? getAnyBlockDefinition(block.type) : undefined;
  return blockDef?.inputs[target.portId]?.type;
}

function getDeclaredOutputType(patch: Patch, source: SourceRef): InferenceCanonicalType | undefined {
  const block = patch.blocks.get(source.blockId as BlockId);
  const blockDef = block ? getAnyBlockDefinition(block.type) : undefined;
  return blockDef?.outputs[source.portId]?.type;
}

function isConcretePayload(type: InferenceCanonicalType): boolean {
  return !isPayloadVar(type.payload);
}

function typesContradict(
  sourceType: InferenceCanonicalType,
  targetType: InferenceCanonicalType,
): boolean {
  const sourcePayload = sourceType.payload;
  const targetPayload = targetType.payload;
  const payloadConflict = !isPayloadVar(sourcePayload)
    && !isPayloadVar(targetPayload)
    && !payloadsEqual(
      sourcePayload as Exclude<typeof sourcePayload, { readonly kind: 'var'; readonly id: string }>,
      targetPayload as Exclude<typeof targetPayload, { readonly kind: 'var'; readonly id: string }>,
    );
  if (payloadConflict) return true;

  const sourceUnit = sourceType.unit;
  const targetUnit = targetType.unit;
  const unitConflict = sourceUnit.kind !== 'var'
    && targetUnit.kind !== 'var'
    && !unitsEqual(sourceUnit, targetUnit);
  if (unitConflict) return true;

  const sourceContract = sourceType.contract;
  const targetContract = targetType.contract;
  const contractConflict = sourceContract !== undefined
    && targetContract !== undefined
    && sourceContract.kind !== targetContract.kind;
  if (contractConflict) return true;

  return false;
}

function safeIsAssignable(
  sourceType: InferenceCanonicalType | CanonicalType,
  targetType: InferenceCanonicalType | CanonicalType,
): boolean {
  try {
    return isAssignable(sourceType, targetType);
  } catch {
    return false;
  }
}

function safeFindAdapterChain(
  sourceType: InferenceCanonicalType | CanonicalType,
  targetType: InferenceCanonicalType | CanonicalType,
): boolean {
  try {
    return findAdapterChain(sourceType, targetType) !== null;
  } catch {
    return false;
  }
}

export function maySatisfyConnectionTypes(
  sourceType: InferenceCanonicalType | CanonicalType | undefined,
  targetType: InferenceCanonicalType | CanonicalType | undefined,
): boolean {
  if (!sourceType || !targetType) return true;
  if (safeIsAssignable(sourceType, targetType)) return true;
  if (safeFindAdapterChain(sourceType, targetType)) return true;
  return !typesContradict(sourceType, targetType);
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
    if (current.blockId === targetBlockId && current.portId === targetPortId) {
      return true;
    }

    const nextEdges = analysis.fixpointResult.graph.edges.filter(
      (edge) => edge.from.blockId === current.blockId && edge.from.port === current.portId,
    );
    for (const edge of nextEdges) {
      const nextKey = `${edge.to.blockId}\u0000${edge.to.port}`;
      if (edge.to.blockId === targetBlockId && edge.to.port === targetPortId) {
        return true;
      }
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push({ blockId: edge.to.blockId, portId: edge.to.port });
    }
  }

  return false;
}

function precheckTarget(patch: Patch, target: TargetRef): QueryPrecheck {
  const targetBlock = patch.blocks.get(target.blockId as BlockId);
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

  return { ok: true, block: targetBlock };
}

function precheckSource(patch: Patch, source: SourceRef): QueryPrecheck {
  const sourceBlock = patch.blocks.get(source.blockId as BlockId);
  if (!sourceBlock) {
    return {
      ok: false,
      reasonKind: 'sourceBlockMissing',
      reason: `Source block ${source.blockId} not found`,
    };
  }

  const sourceDef = getAnyBlockDefinition(sourceBlock.type);
  const outputDef = sourceDef?.outputs[source.portId];
  if (!sourceDef || !outputDef) {
    return {
      ok: false,
      reasonKind: 'sourceOutputMissing',
      reason: `Source output ${source.blockId}.${source.portId} not found`,
    };
  }

  return { ok: true, block: sourceBlock };
}

function baseCandidateResult(
  candidateId: string,
  reasonKind: string,
  reason: string,
  status: AuthoringCandidateStatus = 'blocked',
): AuthoringCandidateResultBase {
  return {
    candidateId,
    status,
    reasonKind,
    reason,
    diagnostics: [],
    controlSurface: [],
    insertedArtifacts: emptyInsertedArtifacts(),
  };
}

function pickEffectivePortType(
  analysis: FrontendAnalysis,
  patch: Patch,
  ref: SourceRef | TargetRef,
  dir: 'in' | 'out',
): InferenceCanonicalType | CanonicalType | undefined {
  const hint = getPortHint(analysis.fixpointResult.facts, ref.blockId, ref.portId, dir);
  if (hint.canonical) return hint.canonical;
  if (hint.inference) return hint.inference;
  return dir === 'in'
    ? getDeclaredInputType(patch, ref as TargetRef)
    : getDeclaredOutputType(patch, ref as SourceRef);
}

function resolveCandidateResult(
  baseline: FrontendAnalysis,
  candidate: FrontendAnalysis,
  patch: Patch,
  target: TargetRef,
  source: SourceRef,
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
  const binding = semantics.inputBindings.get(inputAddressKey(target.blockId, target.portId));
  const targetHint = getPortHint(candidate.fixpointResult.facts, target.blockId, target.portId, 'in');
  const sourceHint = getPortHint(candidate.fixpointResult.facts, source.blockId, source.portId, 'out');
  const insertedArtifacts = buildInsertedArtifacts(baseline, candidate);
  const blockingDiagnostics = diagnostics.filter((error) => error.severity === 'error');
  const relevantBlockingDiagnostics = blockingDiagnostics.filter((error) => {
    if (!error.blockId) return false;
    if (insertedArtifacts.blocks.includes(error.blockId)) return true;
    if (error.blockId === target.blockId) return error.portId === target.portId;
    if (error.blockId === source.blockId) return error.portId === source.portId;
    return false;
  });
  const hasConflict = targetHint.status === 'conflict' || sourceHint.status === 'conflict';
  const candidateAppearsInBinding = binding?.sourceBlockId === source.blockId
    && binding?.sourcePortId === source.portId;
  const candidateMaterialized = candidateAppearsInBinding
    || hasPathToTarget(candidate, source.blockId, source.portId, target.blockId, target.portId)
    || insertedArtifacts.blocks.length > 0
    || insertedArtifacts.edges.length > 0;

  let status: AuthoringCandidateStatus;
  let reasonKind: string;
  let reason: string;
  if (!candidateMaterialized) {
    status = 'invalid';
    reasonKind = 'candidateNotMaterialized';
    reason = `Candidate did not materialize a satisfiable authored change for ${target.blockId}.${target.portId}`;
  } else if (hasConflict || relevantBlockingDiagnostics.length > 0) {
    status = 'invalid';
    reasonKind = hasConflict ? 'typeConflict' : 'candidateDiagnostics';
    reason = hasConflict
      ? `Current constraints contradict ${source.blockId}.${source.portId} → ${target.blockId}.${target.portId}`
      : relevantBlockingDiagnostics[0]?.message ?? 'Candidate introduces blocking diagnostics';
  } else if (insertedArtifacts.adapterBlocks.length > 0) {
    status = 'valid';
    reasonKind = 'satisfiedViaAdapter';
    reason = `Connection is satisfiable through ${insertedArtifacts.adapterBlocks.length} adapter block(s)`;
  } else if (targetHint.status === 'ok' && sourceHint.status === 'ok') {
    status = 'valid';
    reasonKind = insertedArtifacts.adapterBlocks.length > 0 ? 'satisfiedViaAdapter' : 'satisfied';
    reason = insertedArtifacts.adapterBlocks.length > 0
      ? `Connection is satisfiable through ${insertedArtifacts.adapterBlocks.length} adapter block(s)`
      : 'Connection is satisfiable';
  } else {
    status = 'deferred';
    reasonKind = 'unresolvedTypes';
    reason = 'Connection remains admissible but depends on unresolved type facts';
  }

  return {
    candidateId,
    status,
    reasonKind,
    reason,
    diagnostics,
    resolvedTargetType: pickEffectivePortType(candidate, patch, target, 'in') as CanonicalType | undefined,
    resolvedSourceType: pickEffectivePortType(candidate, patch, source, 'out') as CanonicalType | undefined,
    binding,
    controlSurface: binding?.controls ?? [],
    insertedArtifacts,
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

type TimingResult<T> = {
  readonly value: T;
  readonly durationMs: number;
};

function time<T>(fn: () => T): TimingResult<T> {
  const start = nowMs();
  return { value: fn(), durationMs: Math.max(0, nowMs() - start) };
}

function buildMetrics(
  baselineAnalysisMs: number,
  prefilterMs: number,
  candidateCount: number,
  prefilteredCount: number,
  exactEvaluationCount: number,
  exactEvaluationMs: number,
): AuthoringQueryMetrics {
  return {
    baselineAnalysisMs,
    prefilterMs,
    candidateCount,
    prefilteredCount,
    exactEvaluationCount,
    exactEvaluationMs,
  };
}

type PrefilterCandidate<T> = {
  readonly candidate: T;
  readonly accepted: boolean;
};

export class AuthoringQuerySession {
  readonly baseline: FrontendAnalysis;
  readonly semantics: ReturnType<typeof buildFrontendSemanticMaps>;
  readonly registryIndex: RegistryCandidateIndex;
  readonly baselineAnalysisMs: number;

  constructor(
    private readonly patch: Patch,
    private readonly options: AuthoringQueryOptions,
  ) {
    const timed = time(() => analyzeFrontend(patch, options.frontendOptions));
    this.baseline = timed.value;
    this.baselineAnalysisMs = timed.durationMs;
    this.semantics = buildFrontendSemanticMaps(
      this.baseline.frontendResult.normalizedPatch,
      this.baseline.frontendResult.typedPatch,
    );
    this.registryIndex = getRegistryCandidateIndex();
  }

  private getTargetType(target: TargetRef): InferenceCanonicalType | CanonicalType | undefined {
    return pickEffectivePortType(this.baseline, this.patch, target, 'in');
  }

  private getSourceType(source: SourceRef): InferenceCanonicalType | CanonicalType | undefined {
    return pickEffectivePortType(this.baseline, this.patch, source, 'out');
  }

  mayConnect(source: SourceRef, target: TargetRef): boolean {
    return maySatisfyConnectionTypes(this.getSourceType(source), this.getTargetType(target));
  }

  queryConnectExistingSources(query: ConnectExistingSourcesQuery): AuthoringBatchResult<ConnectExistingSourceResult> {
    const targetPrecheck = precheckTarget(this.patch, query.target);
    if (!targetPrecheck.ok) {
      return {
        queryKind: query.kind,
        target: query.target,
        mutationMode: this.options.mutationMode,
        baselineStatus: 'blocked',
        baselineReasonKind: targetPrecheck.reasonKind,
        baselineReason: targetPrecheck.reason,
        metrics: emptyMetrics(query.candidates.length),
        results: query.candidates.map((candidate) => ({
          kind: 'connectExistingSources',
          sourceBlockId: candidate.sourceBlockId,
          sourcePortId: candidate.sourcePortId,
          ...baseCandidateResult(candidate.candidateId, targetPrecheck.reasonKind, targetPrecheck.reason),
        })),
      };
    }

    const targetType = this.getTargetType(query.target);
    const timedPrefilter = time(() => query.candidates.map((candidate): PrefilterCandidate<typeof candidate> => {
      const sourcePrecheck = precheckSource(this.patch, {
        blockId: candidate.sourceBlockId,
        portId: candidate.sourcePortId,
      });
      if (!sourcePrecheck.ok) {
        return { candidate, accepted: false };
      }
      const sourceType = this.getSourceType({
        blockId: candidate.sourceBlockId,
        portId: candidate.sourcePortId,
      });
      return {
        candidate,
        accepted: maySatisfyConnectionTypes(sourceType, targetType),
      };
    }));

    let exactEvaluationCount = 0;
    let exactEvaluationMs = 0;
    const results = timedPrefilter.value.map(({ candidate, accepted }): ConnectExistingSourceResult => {
      if (!accepted) {
        return {
          kind: 'connectExistingSources',
          sourceBlockId: candidate.sourceBlockId,
          sourcePortId: candidate.sourcePortId,
          ...baseCandidateResult(
            candidate.candidateId,
            'prefilterRejected',
            `Candidate ${candidate.sourceBlockId}.${candidate.sourcePortId} is provably incompatible with ${query.target.blockId}.${query.target.portId}`,
            'invalid',
          ),
        };
      }

      exactEvaluationCount += 1;
      const timed = time(() => analyzeFrontend(
        addHypotheticalWriter(
          this.patch,
          query.target,
          { kind: 'port', blockId: candidate.sourceBlockId, slotId: candidate.sourcePortId },
          `_aq_edge_${candidate.candidateId}`,
          this.options.mutationMode,
        ),
        this.options.frontendOptions,
      ));
      exactEvaluationMs += timed.durationMs;
      return {
        kind: 'connectExistingSources',
        sourceBlockId: candidate.sourceBlockId,
        sourcePortId: candidate.sourcePortId,
        ...resolveCandidateResult(
          this.baseline,
          timed.value,
          this.patch,
          { blockId: query.target.blockId, portId: query.target.portId },
          { blockId: candidate.sourceBlockId, portId: candidate.sourcePortId },
          candidate.candidateId,
        ),
      };
    });

    return {
      queryKind: query.kind,
      target: query.target,
      mutationMode: this.options.mutationMode,
      baselineStatus: 'ready',
      metrics: buildMetrics(
        this.baselineAnalysisMs,
        timedPrefilter.durationMs,
        query.candidates.length,
        timedPrefilter.value.filter((candidate) => candidate.accepted).length,
        exactEvaluationCount,
        exactEvaluationMs,
      ),
      results,
    };
  }

  queryConnectTargetsForSource(query: ConnectTargetsForSourceQuery): AuthoringBatchResult<ConnectTargetForSourceResult> {
    const sourcePrecheck = precheckSource(this.patch, query.source);
    if (!sourcePrecheck.ok) {
      return {
        queryKind: query.kind,
        source: query.source,
        mutationMode: this.options.mutationMode,
        baselineStatus: 'blocked',
        baselineReasonKind: sourcePrecheck.reasonKind,
        baselineReason: sourcePrecheck.reason,
        metrics: emptyMetrics(query.candidates.length),
        results: query.candidates.map((candidate) => ({
          kind: 'connectTargetsForSource',
          targetBlockId: candidate.targetBlockId,
          targetPortId: candidate.targetPortId,
          ...baseCandidateResult(candidate.candidateId, sourcePrecheck.reasonKind, sourcePrecheck.reason),
        })),
      };
    }

    const sourceType = this.getSourceType(query.source);
    const timedPrefilter = time(() => query.candidates.map((candidate): PrefilterCandidate<typeof candidate> => {
      const targetPrecheck = precheckTarget(this.patch, {
        blockId: candidate.targetBlockId,
        portId: candidate.targetPortId,
      });
      if (!targetPrecheck.ok) {
        return { candidate, accepted: false };
      }
      const targetType = this.getTargetType({
        blockId: candidate.targetBlockId,
        portId: candidate.targetPortId,
      });
      return {
        candidate,
        accepted: maySatisfyConnectionTypes(sourceType, targetType),
      };
    }));

    let exactEvaluationCount = 0;
    let exactEvaluationMs = 0;
    const results = timedPrefilter.value.map(({ candidate, accepted }): ConnectTargetForSourceResult => {
      if (!accepted) {
        return {
          kind: 'connectTargetsForSource',
          targetBlockId: candidate.targetBlockId,
          targetPortId: candidate.targetPortId,
          ...baseCandidateResult(
            candidate.candidateId,
            'prefilterRejected',
            `Candidate ${query.source.blockId}.${query.source.portId} is provably incompatible with ${candidate.targetBlockId}.${candidate.targetPortId}`,
            'invalid',
          ),
        };
      }

      exactEvaluationCount += 1;
      const timed = time(() => analyzeFrontend(
        addHypotheticalWriter(
          this.patch,
          { blockId: candidate.targetBlockId, portId: candidate.targetPortId },
          { kind: 'port', blockId: query.source.blockId, slotId: query.source.portId },
          `_aq_edge_${candidate.candidateId}`,
          this.options.mutationMode,
        ),
        this.options.frontendOptions,
      ));
      exactEvaluationMs += timed.durationMs;
      return {
        kind: 'connectTargetsForSource',
        targetBlockId: candidate.targetBlockId,
        targetPortId: candidate.targetPortId,
        ...resolveCandidateResult(
          this.baseline,
          timed.value,
          this.patch,
          { blockId: candidate.targetBlockId, portId: candidate.targetPortId },
          { blockId: query.source.blockId, portId: query.source.portId },
          candidate.candidateId,
        ),
      };
    });

    return {
      queryKind: query.kind,
      source: query.source,
      mutationMode: this.options.mutationMode,
      baselineStatus: 'ready',
      metrics: buildMetrics(
        this.baselineAnalysisMs,
        timedPrefilter.durationMs,
        query.candidates.length,
        timedPrefilter.value.filter((candidate) => candidate.accepted).length,
        exactEvaluationCount,
        exactEvaluationMs,
      ),
      results,
    };
  }

  queryAddSourceBlocks(query: AddSourceBlocksQuery): AuthoringBatchResult<AddSourceBlockResult> {
    const targetPrecheck = precheckTarget(this.patch, query.target);
    if (!targetPrecheck.ok) {
      return {
        queryKind: query.kind,
        target: query.target,
        mutationMode: this.options.mutationMode,
        baselineStatus: 'blocked',
        baselineReasonKind: targetPrecheck.reasonKind,
        baselineReason: targetPrecheck.reason,
        metrics: emptyMetrics(query.candidates.length),
        results: query.candidates.map((candidate) => ({
          kind: 'addSourceBlocks',
          blockType: candidate.blockType,
          outputs: [],
          ...baseCandidateResult(candidate.candidateId, targetPrecheck.reasonKind, targetPrecheck.reason),
        })),
      };
    }

    const targetType = this.getTargetType(query.target);
    const timedPrefilter = time(() => query.candidates.map((candidate): PrefilterCandidate<typeof candidate> => {
      const block = this.registryIndex.blocks.get(candidate.blockType);
      if (!block) return { candidate, accepted: false };
      const accepted = block.outputs.some((output) => maySatisfyConnectionTypes(output.type, targetType));
      return { candidate, accepted };
    }));

    let exactEvaluationCount = 0;
    let exactEvaluationMs = 0;
    const results = timedPrefilter.value.map(({ candidate, accepted }): AddSourceBlockResult => {
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

      if (!accepted) {
        return {
          kind: 'addSourceBlocks',
          blockType: candidate.blockType,
          outputs: [],
          ...baseCandidateResult(
            candidate.candidateId,
            'prefilterRejected',
            `Candidate block type ${candidate.blockType} has no visible output that can satisfy ${query.target.blockId}.${query.target.portId}`,
            'invalid',
          ),
        };
      }

      const outputs = Object.entries(blockDef.outputs)
        .filter(([, outputDef]) => !outputDef.hidden)
        .map(([outputPortId, outputDef]): [PortId, OutputDef] => [outputPortId as PortId, outputDef]);

      if (outputs.length === 0) {
        return {
          kind: 'addSourceBlocks',
          blockType: candidate.blockType,
          outputs: [],
          ...baseCandidateResult(
            candidate.candidateId,
            'candidateHasNoOutputs',
            `Candidate block type ${candidate.blockType} has no exposed outputs`,
            'invalid',
          ),
        };
      }

      exactEvaluationCount += 1;
      const outputResults = outputs.map(([outputPortId, outputDef]): AddSourceBlockOutputResult => {
        if (!maySatisfyConnectionTypes(outputDef.type, targetType)) {
          return {
            outputPortId,
            ...baseCandidateResult(
              `${candidate.candidateId}:${outputPortId}`,
              'prefilterRejected',
              `Output ${candidate.blockType}.${outputPortId} is provably incompatible with ${query.target.blockId}.${query.target.portId}`,
              'invalid',
            ),
          };
        }

        const timed = time(() => {
          const { patch: hypotheticalPatch, blockId } = addHypotheticalSourceBlock(
            this.patch,
            query.target,
            candidate.blockType,
            outputPortId,
            candidate.candidateId,
            this.options.mutationMode,
          );
          return {
            analysis: analyzeFrontend(hypotheticalPatch, this.options.frontendOptions),
            blockId,
          };
        });
        exactEvaluationMs += timed.durationMs;
        return {
          outputPortId,
          ...resolveCandidateResult(
            this.baseline,
            timed.value.analysis,
            this.patch,
            { blockId: query.target.blockId, portId: query.target.portId },
            { blockId: timed.value.blockId, portId: outputPortId },
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
        insertedArtifacts: bestOutput?.insertedArtifacts ?? emptyInsertedArtifacts(),
        outputs: outputResults,
        bestOutputPortId: bestOutput?.outputPortId,
      };
    });

    return {
      queryKind: query.kind,
      target: query.target,
      mutationMode: this.options.mutationMode,
      baselineStatus: 'ready',
      metrics: buildMetrics(
        this.baselineAnalysisMs,
        timedPrefilter.durationMs,
        query.candidates.length,
        timedPrefilter.value.filter((candidate) => candidate.accepted).length,
        exactEvaluationCount,
        exactEvaluationMs,
      ),
      results,
    };
  }
}

export function createAuthoringQuerySession(
  patch: Patch,
  options: AuthoringQueryOptions,
): AuthoringQuerySession {
  return new AuthoringQuerySession(patch, options);
}

export function runAuthoringQuery(
  patch: Patch,
  query: ConnectExistingSourcesQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<ConnectExistingSourceResult>;
export function runAuthoringQuery(
  patch: Patch,
  query: ConnectTargetsForSourceQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<ConnectTargetForSourceResult>;
export function runAuthoringQuery(
  patch: Patch,
  query: AddSourceBlocksQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<AddSourceBlockResult>;
export function runAuthoringQuery(
  patch: Patch,
  query: AuthoringQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<ConnectExistingSourceResult | ConnectTargetForSourceResult | AddSourceBlockResult> {
  const session = createAuthoringQuerySession(patch, options);
  switch (query.kind) {
    case 'connectExistingSources':
      return session.queryConnectExistingSources(query);
    case 'connectTargetsForSource':
      return session.queryConnectTargetsForSource(query);
    case 'addSourceBlocks':
      return session.queryAddSourceBlocks(query);
  }
}

export function queryConnectExistingSources(
  patch: Patch,
  query: ConnectExistingSourcesQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<ConnectExistingSourceResult> {
  return createAuthoringQuerySession(patch, options).queryConnectExistingSources(query);
}

export function queryConnectTargetsForSource(
  patch: Patch,
  query: ConnectTargetsForSourceQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<ConnectTargetForSourceResult> {
  return createAuthoringQuerySession(patch, options).queryConnectTargetsForSource(query);
}

export function queryAddSourceBlocks(
  patch: Patch,
  query: AddSourceBlocksQuery,
  options: AuthoringQueryOptions,
): AuthoringBatchResult<AddSourceBlockResult> {
  return createAuthoringQuerySession(patch, options).queryAddSourceBlocks(query);
}
