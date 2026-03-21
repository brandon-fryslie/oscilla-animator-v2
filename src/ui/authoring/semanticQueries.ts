import {
  getBlockCategories,
  getBlockTypesByCategory,
  requireAnyBlockDef,
  type OutputDef,
} from '../../blocks/registry';
import {
  maySatisfyConnectionTypes,
  queryAddConsumerBlocks,
  queryAddSourceBlocks,
  queryConnectExistingSources,
  queryConnectTargetsForSource,
} from '../../compiler/frontend/authoring-queries';
import type {
  AuthoringCandidateStatus,
  AuthoringMutationMode,
} from '../../compiler/frontend/authoring-query-types';
import { validateCombineMode } from '../../compiler/backend/combine-utils';
import type { InferenceCanonicalType } from '../../core/inference-types';
import type { FrontendResultStore } from '../../stores/FrontendResultStore';
import type { BlockId, CombineMode, PortId } from '../../types';
import { COMBINE_MODE_CATEGORY } from '../../types';
import type { Patch } from '../../types';
import {
  findCompatibleLenses,
  type LensTypeInfo,
} from '../reactFlowEditor/lensUtils';
import type { ConnectionValidationResult } from '../reactFlowEditor/typeValidation';

export interface CompatiblePortCandidate {
  readonly blockId: BlockId;
  readonly portId: PortId;
  readonly blockLabel: string;
  readonly portLabel: string;
  readonly status: AuthoringCandidateStatus;
}

export interface CompatibleBlockTypeCandidate {
  readonly blockType: string;
  readonly blockLabel: string;
  readonly portId: string;
  readonly status: AuthoringCandidateStatus;
}

export interface DefaultSourceBlockTypeCandidate {
  readonly blockType: string;
  readonly label: string;
  readonly outputs: readonly OutputDef[];
  readonly status: AuthoringCandidateStatus;
}

function isSuggested(status: AuthoringCandidateStatus): boolean {
  return status === 'valid' || status === 'deferred';
}

function statusRank(status: AuthoringCandidateStatus): number {
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

function getAllBlockDefs() {
  return getBlockCategories().flatMap((category) => getBlockTypesByCategory(category));
}

function getVisibleOutputs(blockType: string): readonly OutputDef[] {
  const def = requireAnyBlockDef(blockType);
  return Object.values(def.outputs).filter((output) => !output.hidden);
}

function resolvePortType(
  frontend: FrontendResultStore | null | undefined,
  blockId: BlockId,
  portId: PortId,
  direction: 'input' | 'output',
): InferenceCanonicalType | undefined {
  return frontend?.getResolvedPortTypeByIds(
    blockId,
    portId,
    direction === 'input' ? 'in' : 'out',
  );
}

export function validateSemanticConnection(
  patch: Patch,
  sourceBlockId: string,
  sourcePortId: string,
  targetBlockId: string,
  targetPortId: string,
  options?: {
    readonly frontend?: FrontendResultStore;
    readonly mutationMode?: AuthoringMutationMode;
    readonly exact?: boolean;
  },
): ConnectionValidationResult {
  if (!options?.exact) {
    const frontend = options?.frontend;
    const sourceType = resolvePortType(
      frontend,
      sourceBlockId as BlockId,
      sourcePortId as PortId,
      'output',
    );
    const targetType = resolvePortType(
      frontend,
      targetBlockId as BlockId,
      targetPortId as PortId,
      'input',
    );
    // [LAW:one-source-of-truth] Cheap validation must use frontend-resolved semantics or fail closed.
    if (!sourceType || !targetType) {
      return {
        valid: false,
        reason: 'Frontend-resolved port types unavailable',
      };
    }
    if (!maySatisfyConnectionTypes(sourceType, targetType)) {
      return {
        valid: false,
        reason: 'Connection is statically incompatible',
      };
    }
    return { valid: true };
  }

  const result = queryConnectExistingSources(
    patch,
    {
      kind: 'connectExistingSources',
      target: {
        blockId: targetBlockId as BlockId,
        portId: targetPortId as PortId,
      },
      candidates: [
        {
          candidateId: `${sourceBlockId}:${sourcePortId}`,
          sourceBlockId: sourceBlockId as BlockId,
          sourcePortId: sourcePortId as PortId,
        },
      ],
    },
    { mutationMode: options.mutationMode ?? 'addWriter' },
  ).results[0];

  return {
    valid: isSuggested(result.status),
    reason: isSuggested(result.status) ? undefined : result.reason,
  };
}

export function getHoverCompatiblePortsForPort(
  patch: Patch,
  frontend: FrontendResultStore,
  blockId: BlockId,
  portId: PortId,
  isInput: boolean,
): CompatiblePortCandidate[] {
  const sourceType = resolvePortType(frontend, blockId, portId, isInput ? 'input' : 'output');
  if (!sourceType) return [];

  if (isInput) {
    return Array.from(patch.blocks.entries())
      .flatMap(([otherBlockId, otherBlock]) => {
        if (otherBlockId === blockId) return [];
        const otherBlockDef = requireAnyBlockDef(otherBlock.type);
        return Object.entries(otherBlockDef.outputs)
          .filter(([, outputDef]) => !outputDef.hidden)
          .map(([otherPortId, outputDef]) => {
            const candidateType = resolvePortType(
              frontend,
              otherBlockId,
              otherPortId as PortId,
              'output',
            );
            return {
            blockId: otherBlockId,
            portId: otherPortId as PortId,
            blockLabel: otherBlock.displayName || otherBlockDef.label || otherBlock.type,
            portLabel: outputDef.label || otherPortId,
            status: maySatisfyConnectionTypes(candidateType, sourceType) ? 'deferred' : 'invalid' as AuthoringCandidateStatus,
          };
          })
          .filter((candidate) => candidate.status !== 'invalid');
      })
      .sort((a, b) =>
        statusRank(a.status) - statusRank(b.status)
        || a.blockLabel.localeCompare(b.blockLabel)
        || a.portLabel.localeCompare(b.portLabel),
      );
  }

  return Array.from(patch.blocks.entries())
    .flatMap(([otherBlockId, otherBlock]) => {
      if (otherBlockId === blockId) return [];
      const otherBlockDef = requireAnyBlockDef(otherBlock.type);
      return Object.entries(otherBlockDef.inputs)
        .filter(([, inputDef]) => inputDef.exposedAsPort !== false)
        .map(([otherPortId, inputDef]) => {
          const candidateType = resolvePortType(
            frontend,
            otherBlockId,
            otherPortId as PortId,
            'input',
          );
          return {
          blockId: otherBlockId,
          portId: otherPortId as PortId,
          blockLabel: otherBlock.displayName || otherBlockDef.label || otherBlock.type,
          portLabel: inputDef.label || otherPortId,
          status: maySatisfyConnectionTypes(sourceType, candidateType) ? 'deferred' : 'invalid' as AuthoringCandidateStatus,
        };
        })
        .filter((candidate) => candidate.status !== 'invalid');
    })
    .sort((a, b) =>
      statusRank(a.status) - statusRank(b.status)
      || a.blockLabel.localeCompare(b.blockLabel)
      || a.portLabel.localeCompare(b.portLabel),
    );
}

export function getCompatiblePortsForPort(
  patch: Patch,
  _frontend: FrontendResultStore,
  blockId: BlockId,
  portId: PortId,
  isInput: boolean,
): CompatiblePortCandidate[] {
  if (isInput) {
    const sourceCandidates = Array.from(patch.blocks.entries())
      .flatMap(([otherBlockId, otherBlock]) => {
        if (otherBlockId === blockId) return [];
        const otherBlockDef = requireAnyBlockDef(otherBlock.type);
        return Object.entries(otherBlockDef.outputs)
          .filter(([, outputDef]) => !outputDef.hidden)
          .map(([otherPortId]) => ({
            candidateId: `${otherBlockId}:${otherPortId}`,
            sourceBlockId: otherBlockId,
            sourcePortId: otherPortId as PortId,
          }));
      });

    const results = queryConnectExistingSources(
      patch,
      {
        kind: 'connectExistingSources',
        target: { blockId, portId },
        candidates: sourceCandidates,
      },
      { mutationMode: 'addWriter' },
    );

    return results.results
      .filter((candidate) => isSuggested(candidate.status))
      .map((candidate) => {
        const block = patch.blocks.get(candidate.sourceBlockId)!;
        const blockDef = requireAnyBlockDef(block.type);
        const portDef = blockDef.outputs[candidate.sourcePortId];
        return {
          blockId: candidate.sourceBlockId,
          portId: candidate.sourcePortId,
          blockLabel: block.displayName || blockDef.label || block.type,
          portLabel: portDef?.label || candidate.sourcePortId,
          status: candidate.status,
        };
      })
      .sort((a, b) =>
        statusRank(a.status) - statusRank(b.status)
        || a.blockLabel.localeCompare(b.blockLabel)
        || a.portLabel.localeCompare(b.portLabel),
      );
  }

  const targetCandidates = Array.from(patch.blocks.entries())
    .flatMap(([otherBlockId, otherBlock]) => {
      if (otherBlockId === blockId) return [];
      const otherBlockDef = requireAnyBlockDef(otherBlock.type);
      return Object.entries(otherBlockDef.inputs)
        .filter(([, inputDef]) => inputDef.exposedAsPort !== false)
        .map(([otherPortId]) => ({
          candidateId: `${otherBlockId}:${otherPortId}`,
          targetBlockId: otherBlockId,
          targetPortId: otherPortId as PortId,
        }));
    });

  const results = queryConnectTargetsForSource(
    patch,
    {
      kind: 'connectTargetsForSource',
      source: { blockId, portId },
      candidates: targetCandidates,
    },
    { mutationMode: 'addWriter' },
  );

  return results.results
    .filter((candidate) => isSuggested(candidate.status))
    .map((candidate) => {
      const block = patch.blocks.get(candidate.targetBlockId)!;
      const blockDef = requireAnyBlockDef(block.type);
      const inputDef = blockDef.inputs[candidate.targetPortId];
      return {
        blockId: candidate.targetBlockId,
        portId: candidate.targetPortId,
        blockLabel: block.displayName || blockDef.label || block.type,
        portLabel: inputDef?.label || candidate.targetPortId,
        status: candidate.status,
      };
    })
    .sort((a, b) =>
      statusRank(a.status) - statusRank(b.status)
      || a.blockLabel.localeCompare(b.blockLabel)
      || a.portLabel.localeCompare(b.portLabel),
    );
}

export function getCompatibleBlockTypesForPort(
  patch: Patch,
  _frontend: FrontendResultStore,
  blockId: BlockId,
  portId: PortId,
  isInput: boolean,
): CompatibleBlockTypeCandidate[] {
  if (!isInput) {
    const results = queryAddConsumerBlocks(
      patch,
      {
        kind: 'addConsumerBlocks',
        target: { blockId, portId },
        candidates: getAllBlockDefs().map((blockDef) => ({
          candidateId: blockDef.type,
          blockType: blockDef.type,
        })),
      },
      { mutationMode: 'addWriter' },
    );

    return results.results
      .filter((candidate) => isSuggested(candidate.status) && candidate.bestInputPortId)
      .map((candidate) => {
        const def = requireAnyBlockDef(candidate.blockType);
        return {
          blockType: candidate.blockType,
          blockLabel: def.label || def.type,
          portId: candidate.bestInputPortId!,
          status: candidate.status,
        };
      })
      .sort((a, b) =>
        statusRank(a.status) - statusRank(b.status)
        || a.blockLabel.localeCompare(b.blockLabel)
        || a.blockType.localeCompare(b.blockType),
      );
  }

  const results = queryAddSourceBlocks(
    patch,
    {
      kind: 'addSourceBlocks',
      target: { blockId, portId },
      candidates: getAllBlockDefs().map((blockDef) => ({
        candidateId: blockDef.type,
        blockType: blockDef.type,
      })),
    },
    { mutationMode: 'addWriter' },
  );

  return results.results
    .filter((candidate) => isSuggested(candidate.status) && candidate.bestOutputPortId)
    .map((candidate) => {
      const def = requireAnyBlockDef(candidate.blockType);
      return {
        blockType: candidate.blockType,
        blockLabel: def.label || def.type,
        portId: candidate.bestOutputPortId!,
        status: candidate.status,
      };
    })
    .sort((a, b) =>
      statusRank(a.status) - statusRank(b.status)
      || a.blockLabel.localeCompare(b.blockLabel)
      || a.blockType.localeCompare(b.blockType),
    );
}

export function getValidCombineModesForType(type: InferenceCanonicalType | undefined): CombineMode[] {
  if (!type) return [];

  const payloadType = type.payload;
  if (payloadType.kind === 'var') return [];
  const payloadKind = payloadType.kind;
  return (Object.entries(COMBINE_MODE_CATEGORY) as [CombineMode, string][])
    .filter(([mode]) => validateCombineMode(mode, 'one', payloadKind).valid)
    .map(([mode]) => mode);
}

export function getValidCombineModesForInput(
  _patch: Patch,
  frontend: FrontendResultStore,
  blockId: BlockId,
  portId: PortId,
): CombineMode[] {
  const type = resolvePortType(frontend, blockId, portId, 'input');
  return getValidCombineModesForType(type);
}

export function getValidDefaultSourceBlockTypes(
  patch: Patch,
  blockId: BlockId,
  portId: PortId,
): DefaultSourceBlockTypeCandidate[] {
  const results = queryAddSourceBlocks(
    patch,
    {
      kind: 'addSourceBlocks',
      target: { blockId, portId },
      candidates: getAllBlockDefs().map((blockDef) => ({
        candidateId: blockDef.type,
        blockType: blockDef.type,
      })),
    },
    { mutationMode: 'replaceWriter' },
  );

  return results.results
    .filter((candidate) => isSuggested(candidate.status))
    .map((candidate) => ({
      blockType: candidate.blockType,
      label: requireAnyBlockDef(candidate.blockType).label || candidate.blockType,
      outputs: getVisibleOutputs(candidate.blockType),
      status: candidate.status,
    }))
    .sort((a, b) =>
      statusRank(a.status) - statusRank(b.status)
      || a.label.localeCompare(b.label)
      || a.blockType.localeCompare(b.blockType),
    );
}

export function getCompatibleLensesForConnection(
  patch: Patch,
  frontend: FrontendResultStore,
  sourceBlockId: BlockId,
  sourcePortId: PortId,
  targetBlockId: BlockId,
  targetPortId: PortId,
): LensTypeInfo[] {
  const sourceType = resolvePortType(frontend, sourceBlockId, sourcePortId, 'output');
  const targetType = resolvePortType(frontend, targetBlockId, targetPortId, 'input');
  if (!sourceType || !targetType) return [];
  return findCompatibleLenses(sourceType, targetType);
}
