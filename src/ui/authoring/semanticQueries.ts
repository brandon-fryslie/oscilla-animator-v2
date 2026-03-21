import {
  getBlockCategories,
  getBlockTypesByCategory,
  requireAnyBlockDef,
  type OutputDef,
} from '../../blocks/registry';
import {
  queryAddSourceBlocks,
  queryConnectExistingSources,
} from '../../compiler/frontend/authoring-queries';
import type {
  AuthoringCandidateStatus,
  AuthoringMutationMode,
} from '../../compiler/frontend/authoring-query-types';
import { validateCombineMode } from '../../compiler/backend/combine-utils';
import type { InferenceCanonicalType, InferencePayloadType } from '../../core/inference-types';
import { isPayloadVar } from '../../core/inference-types';
import type { FrontendResultStore } from '../../stores/FrontendResultStore';
import type { BlockId, CombineMode, PortId } from '../../types';
import { COMBINE_MODE_CATEGORY } from '../../types';
import type { Patch } from '../../types';
import {
  findCompatibleLenses,
  type LensTypeInfo,
} from '../reactFlowEditor/lensUtils';
import type {
  ConnectionValidationResult,
  PortTypeLookupFn,
  TypeValidationIssue,
} from '../reactFlowEditor/typeValidation';

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

function getAllBlockDefs() {
  return getBlockCategories().flatMap((category) => getBlockTypesByCategory(category));
}

function getVisibleOutputs(blockType: string): readonly OutputDef[] {
  const def = requireAnyBlockDef(blockType);
  return Object.values(def.outputs).filter((output) => !output.hidden);
}

function getStaticPortType(
  patch: Patch,
  blockId: BlockId,
  portId: PortId,
  direction: 'input' | 'output',
): InferenceCanonicalType | undefined {
  const block = patch.blocks.get(blockId);
  if (!block) return undefined;

  const blockDef = requireAnyBlockDef(block.type);
  const portDef = direction === 'input'
    ? blockDef.inputs[portId]
    : blockDef.outputs[portId];
  return portDef?.type;
}

function resolvePortType(
  patch: Patch,
  frontend: FrontendResultStore,
  blockId: BlockId,
  portId: PortId,
  direction: 'input' | 'output',
): InferenceCanonicalType | undefined {
  const resolved = frontend.getResolvedPortTypeByIds(
    blockId,
    portId,
    direction === 'input' ? 'in' : 'out',
  );
  return resolved ?? getStaticPortType(patch, blockId, portId, direction);
}

export function createResolvedPortTypeLookup(frontend: FrontendResultStore): PortTypeLookupFn {
  return (blockIdValue, portIdValue, direction) =>
    frontend.getResolvedPortTypeByIds(
      blockIdValue as BlockId,
      portIdValue as PortId,
      direction === 'input' ? 'in' : 'out',
    );
}

export function validateSemanticConnection(
  patch: Patch,
  sourceBlockId: string,
  sourcePortId: string,
  targetBlockId: string,
  targetPortId: string,
  _options?: {
    readonly frontend?: FrontendResultStore;
    readonly resolvedPortTypeLookup?: PortTypeLookupFn;
    readonly issueReporter?: (issue: TypeValidationIssue) => void;
    readonly mutationMode?: AuthoringMutationMode;
  },
): ConnectionValidationResult {
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
    { mutationMode: _options?.mutationMode ?? 'addWriter' },
  ).results[0];

  return {
    valid: isSuggested(result.status),
    reason: isSuggested(result.status) ? undefined : result.reason,
  };
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
      });
  }

  return Array.from(patch.blocks.entries())
    .flatMap(([otherBlockId, otherBlock]) => {
      if (otherBlockId === blockId) return [];
      const otherBlockDef = requireAnyBlockDef(otherBlock.type);
      return Object.entries(otherBlockDef.inputs)
        .filter(([, inputDef]) => inputDef.exposedAsPort !== false)
        .map(([otherPortId, inputDef]) => {
          const result = queryConnectExistingSources(
            patch,
            {
              kind: 'connectExistingSources',
              target: {
                blockId: otherBlockId,
                portId: otherPortId as PortId,
              },
              candidates: [
                {
                  candidateId: `${blockId}:${portId}`,
                  sourceBlockId: blockId,
                  sourcePortId: portId,
                },
              ],
            },
            { mutationMode: 'addWriter' },
          ).results[0];

          if (!isSuggested(result.status)) {
            return null;
          }

          return {
            blockId: otherBlockId,
            portId: otherPortId as PortId,
            blockLabel: otherBlock.displayName || otherBlockDef.label || otherBlock.type,
            portLabel: inputDef.label || otherPortId,
            status: result.status,
          };
        })
        .filter((candidate): candidate is CompatiblePortCandidate => candidate !== null);
    });
}

export function getCompatibleBlockTypesForPort(
  patch: Patch,
  frontend: FrontendResultStore,
  blockId: BlockId,
  portId: PortId,
  isInput: boolean,
): CompatibleBlockTypeCandidate[] {
  if (!isInput) {
    const targetType = resolvePortType(patch, frontend, blockId, portId, 'output');
    if (!targetType) return [];

    return getAllBlockDefs()
      .flatMap((blockDef) =>
        Object.entries(blockDef.inputs)
          .filter(([, inputDef]) => inputDef.exposedAsPort !== false)
          .filter(([, inputDef]) => {
            const candidateType = inputDef.type;
            const sourcePayload = targetType.payload;
            const targetPayload = candidateType.payload;
            return isPayloadVar(sourcePayload)
              || isPayloadVar(targetPayload)
              || sourcePayload.kind === targetPayload.kind;
          })
          .map(([candidatePortId]) => ({
            blockType: blockDef.type,
            blockLabel: blockDef.label || blockDef.type,
            portId: candidatePortId,
            status: 'deferred' as const,
          })),
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
    });
}

export function getCompatibleLensesForConnection(
  patch: Patch,
  frontend: FrontendResultStore,
  sourceBlockId: BlockId,
  sourcePortId: PortId,
  targetBlockId: BlockId,
  targetPortId: PortId,
): LensTypeInfo[] {
  const sourceType = resolvePortType(patch, frontend, sourceBlockId, sourcePortId, 'output');
  const targetType = resolvePortType(patch, frontend, targetBlockId, targetPortId, 'input');
  if (!sourceType || !targetType) return [];
  return findCompatibleLenses(sourceType, targetType);
}

export function getValidCombineModesForType(type: InferenceCanonicalType | undefined): CombineMode[] {
  if (!type) return ['last'];

  const payloadType: InferencePayloadType = type.payload;
  const payloadKind = isPayloadVar(payloadType) ? 'float' : payloadType.kind;
  return (Object.entries(COMBINE_MODE_CATEGORY) as [CombineMode, string][])
    .filter(([mode]) => validateCombineMode(mode, 'one', payloadKind).valid)
    .map(([mode]) => mode);
}

export function getValidCombineModesForInput(
  patch: Patch,
  frontend: FrontendResultStore,
  blockId: BlockId,
  portId: PortId,
): CombineMode[] {
  const type = resolvePortType(patch, frontend, blockId, portId, 'input');
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
    .sort((a, b) => a.label.localeCompare(b.label));
}
