import type { CanonicalType } from '../../core/canonical-types';
import type { NormalizedPatch } from './normalize-indexing';
import type { TypedPatch } from '../ir/patches';
import { getAnyBlockDefinition } from '../../blocks/registry';
import { getEditableConfigParams, getPreferredInlineSourceParam } from '../../blocks/editable-config';
import type { BlockId, DefaultSource, PortId, TransformStep, UIControlHint } from '../../types';
import { addressToString } from '../../types/canonical-address';
import type { ControlMutationTarget } from '../../types/control-target';
import { normalizeCanonicalName } from '../../core/canonical-name';

export type PortProvenance =
  | {
      readonly kind: 'userEdge';
      readonly sourceType: CanonicalType | undefined;
      readonly targetType: CanonicalType | undefined;
      readonly chain: readonly TransformStep[];
    }
  | {
      readonly kind: 'defaultSource';
      readonly source: DefaultSource;
      readonly sourceType: CanonicalType | undefined;
      readonly targetType: CanonicalType | undefined;
      readonly chain: readonly TransformStep[];
    }
  | {
      readonly kind: 'adapter';
      readonly adapterType: string;
      readonly sourceType: CanonicalType | undefined;
      readonly targetType: CanonicalType | undefined;
      readonly chain: readonly TransformStep[];
    }
  | { readonly kind: 'unresolved' };

export interface BindingControlDescriptor {
  readonly id: string;
  readonly label: string;
  readonly value: unknown;
  readonly hint?: UIControlHint;
  readonly target: ControlMutationTarget;
}

export interface InputBindingSummary {
  readonly kind: 'resolved' | 'unresolved';
  readonly writerCount: number;
  readonly sourceKind?: PortProvenance['kind'];
  readonly sourceBlockId?: string;
  readonly sourceBlockType?: string;
  readonly sourcePortId?: string;
  readonly sourceType?: CanonicalType;
  readonly targetType?: CanonicalType;
  readonly chain: readonly TransformStep[];
  readonly controls: readonly BindingControlDescriptor[];
}

export interface FrontendSemanticMaps {
  readonly resolvedPortTypes: ReadonlyMap<string, CanonicalType>;
  readonly portProvenance: ReadonlyMap<string, PortProvenance>;
  readonly inputBindings: ReadonlyMap<string, InputBindingSummary>;
}

function blockCanonicalName(blockId: string): string {
  return normalizeCanonicalName(blockId);
}

function inputAddressKey(blockId: string, portId: string): string {
  return addressToString({
    kind: 'input',
    blockId: blockId as BlockId,
    canonicalName: blockCanonicalName(blockId),
    portId: portId as PortId,
  });
}

function outputAddressKey(blockId: string, portId: string): string {
  return addressToString({
    kind: 'output',
    blockId: blockId as BlockId,
    canonicalName: blockCanonicalName(blockId),
    portId: portId as PortId,
  });
}

function buildControlDescriptors(
  blockId: string,
  blockType: string,
  params: Readonly<Record<string, unknown>>,
  buildTarget: (paramId: string) => ControlMutationTarget,
  preferredValuePresentation?: { readonly label: string; readonly hint?: UIControlHint },
): BindingControlDescriptor[] {
  const preferredParam = preferredValuePresentation
    ? getPreferredInlineSourceParam(blockType, params)
    : null;

  return getEditableConfigParams(blockType, params).map((param) => {
    const preferred = preferredParam?.paramId === param.paramId
      ? preferredValuePresentation
      : undefined;
    return {
      id: param.paramId,
      label: preferred?.label ?? param.label,
      value: param.value,
      hint: preferred?.hint ?? param.hint,
      target: buildTarget(param.paramId),
    };
  });
}

function buildLensControlDescriptors(
  targetBlockId: string,
  targetPortId: string,
  lensId: string,
  lensType: string,
  params: Readonly<Record<string, unknown>>,
): BindingControlDescriptor[] {
  const def = getAnyBlockDefinition(lensType);
  if (!def) return [];

  const descriptors: BindingControlDescriptor[] = [];
  for (const [inputId, inputDef] of Object.entries(def.inputs)) {
    if (inputId === 'in') continue;
    const value = params[inputId] ?? inputDef.defaultValue;
    if (value === undefined) continue;

    descriptors.push({
      id: `${lensId}:${inputId}`,
      label: inputDef.label ?? inputId,
      value,
      hint: inputDef.uiHint,
      target: {
        kind: 'bindingLensParam',
        blockId: targetBlockId as BlockId,
        portId: targetPortId as PortId,
        lensId,
        paramId: inputId,
      },
    });
  }
  return descriptors;
}

function buildResolvedPortTypes(
  typedPatch: TypedPatch | null,
  normalizedPatch: NormalizedPatch,
): ReadonlyMap<string, CanonicalType> {
  const map = new Map<string, CanonicalType>();

  if (!typedPatch?.portTypes) {
    return map;
  }

  for (const [portKey, type] of typedPatch.portTypes) {
    const [blockIndexStr, portName, dir] = portKey.split(':');
    const blockIndex = parseInt(blockIndexStr, 10);
    const block = normalizedPatch.blocks[blockIndex];

    if (!block) continue;

    const addr = dir === 'in'
      ? inputAddressKey(block.id as string, portName as string)
      : outputAddressKey(block.id as string, portName as string);

    map.set(addr, type);
  }

  return map;
}

function buildBindingTracer(
  normalizedPatch: NormalizedPatch,
  typedPatch: TypedPatch | null,
): (targetBlockId: string, targetPortId: string) => {
  readonly writerCount: number;
  readonly rootEdge?: typeof normalizedPatch.graph.edges[number];
  readonly rootBlock?: typeof normalizedPatch.blocks[number];
  readonly chain: readonly TransformStep[];
  readonly controls: readonly BindingControlDescriptor[];
} {
  const blocksById = new Map<string, typeof normalizedPatch.blocks[number]>();
  for (const block of normalizedPatch.blocks) {
    blocksById.set(block.id as string, block);
  }

  const resolvePortType = (blockId: string, portName: string, dir: 'in' | 'out'): CanonicalType | undefined => {
    if (!typedPatch?.portTypes) return undefined;
    const idx = normalizedPatch.blockIndex.get(blockId as never);
    if (idx === undefined) return undefined;
    const key = `${idx}:${portName}:${dir}`;
    return typedPatch.portTypes.get(key as never);
  };

  return (targetBlockId: string, targetPortId: string) => {
    const incomingEdges = normalizedPatch.graph.edges.filter(
      (edge) => edge.toBlockId === targetBlockId && edge.toPort === targetPortId,
    );
    if (incomingEdges.length !== 1) {
      return { writerCount: incomingEdges.length, chain: [], controls: [] };
    }

    const chain: TransformStep[] = [];
    const chainControls: BindingControlDescriptor[] = [];
    let currentEdge = incomingEdges[0];
    const maxDepth = 16;

    for (let depth = 0; depth < maxDepth; depth++) {
      const sourceBlock = blocksById.get(currentEdge.fromBlockId);
      if (!sourceBlock) {
        return {
          writerCount: incomingEdges.length,
          rootEdge: currentEdge,
          chain: chain.reverse(),
          controls: chainControls.reverse(),
        };
      }

      const sourceDef = getAnyBlockDefinition(sourceBlock.type);
      const lensPrefix = `_lens_${targetPortId}_`;
      const isLens = sourceBlock.id.startsWith(lensPrefix);
      const isAdapter = sourceDef?.category === 'adapter';

      if (!isLens && !isAdapter) {
        return {
          writerCount: incomingEdges.length,
          rootEdge: currentEdge,
          rootBlock: sourceBlock,
          chain: chain.reverse(),
          controls: chainControls.reverse(),
        };
      }

      const upstreamEdges = normalizedPatch.graph.edges.filter((edge) => edge.toBlockId === sourceBlock.id);
      const upstreamEdge = upstreamEdges.length === 1 ? upstreamEdges[0] : undefined;
      if (isLens) {
        const lensId = sourceBlock.id.slice(lensPrefix.length);
        chain.push({
          kind: 'lens',
          lens: {
            lensId: sourceBlock.type,
            params: Object.fromEntries(
              Object.entries(sourceBlock.params).map(([key, value]) => [key, { kind: 'literal', value }]),
            ),
          },
        });
        chainControls.push(
          ...buildLensControlDescriptors(targetBlockId, targetPortId, lensId, sourceBlock.type, sourceBlock.params),
        );
      } else if (upstreamEdge) {
        const from = resolvePortType(upstreamEdge.fromBlockId, upstreamEdge.fromPort, 'out');
        const to = resolvePortType(sourceBlock.id as string, upstreamEdge.toPort as string, 'in');
        if (from && to) {
          chain.push({
            kind: 'adapter',
            from,
            to,
            adapter: sourceBlock.type,
          });
        }
      }

      if (!upstreamEdge) {
        return {
          writerCount: incomingEdges.length,
          rootEdge: currentEdge,
          chain: chain.reverse(),
          controls: chainControls.reverse(),
        };
      }

      currentEdge = upstreamEdge;
    }

    return {
      writerCount: incomingEdges.length,
      rootEdge: currentEdge,
      rootBlock: blocksById.get(currentEdge.fromBlockId),
      chain: chain.reverse(),
      controls: chainControls.reverse(),
    };
  };
}

function buildPortProvenance(
  normalizedPatch: NormalizedPatch,
  typedPatch: TypedPatch | null,
): ReadonlyMap<string, PortProvenance> {
  const map = new Map<string, PortProvenance>();
  const traceBinding = buildBindingTracer(normalizedPatch, typedPatch);

  const resolvePortType = (blockId: string, portName: string, dir: 'in' | 'out'): CanonicalType | undefined => {
    if (!typedPatch?.portTypes) return undefined;
    const idx = normalizedPatch.blockIndex.get(blockId as never);
    if (idx === undefined) return undefined;
    const key = `${idx}:${portName}:${dir}`;
    return typedPatch.portTypes.get(key as never);
  };

  for (const block of normalizedPatch.blocks) {
    const blockDef = getAnyBlockDefinition(block.type);
    if (!blockDef) continue;

    for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
      if (inputDef.exposedAsPort === false) continue;

      const targetAddrStr = inputAddressKey(block.id as string, portId);
      const trace = traceBinding(block.id as string, portId);
      if (!trace.rootEdge) {
        map.set(targetAddrStr, { kind: 'unresolved' });
        continue;
      }

      const sourceType = resolvePortType(trace.rootEdge.fromBlockId, trace.rootEdge.fromPort, 'out');
      const targetType = resolvePortType(block.id as string, portId, 'in');
      if (trace.rootEdge.role === 'defaultWire') {
        map.set(targetAddrStr, {
          kind: 'defaultSource',
          source: {
            blockType: trace.rootBlock?.type ?? 'DefaultSource',
            output: trace.rootEdge.fromPort,
            params: trace.rootBlock?.params,
          },
          sourceType,
          targetType,
          chain: trace.chain,
        });
      } else if (trace.rootEdge.role === 'implicitCoerce') {
        map.set(targetAddrStr, {
          kind: 'adapter',
          adapterType: trace.rootBlock?.type ?? 'Adapter',
          sourceType,
          targetType,
          chain: trace.chain,
        });
      } else if (trace.rootEdge.role === 'userWire') {
        map.set(targetAddrStr, {
          kind: 'userEdge',
          sourceType,
          targetType,
          chain: trace.chain,
        });
      } else {
        map.set(targetAddrStr, { kind: 'unresolved' });
      }
    }
  }

  return map;
}

function buildInputBindings(
  normalizedPatch: NormalizedPatch,
  typedPatch: TypedPatch | null,
): ReadonlyMap<string, InputBindingSummary> {
  const map = new Map<string, InputBindingSummary>();
  const traceBinding = buildBindingTracer(normalizedPatch, typedPatch);

  const blocksById = new Map<string, typeof normalizedPatch.blocks[number]>();
  for (const block of normalizedPatch.blocks) {
    blocksById.set(block.id as string, block);
  }

  const resolvePortType = (blockId: string, portName: string, dir: 'in' | 'out'): CanonicalType | undefined => {
    if (!typedPatch?.portTypes) return undefined;
    const idx = normalizedPatch.blockIndex.get(blockId as never);
    if (idx === undefined) return undefined;
    const key = `${idx}:${portName}:${dir}`;
    return typedPatch.portTypes.get(key as never);
  };

  for (const block of normalizedPatch.blocks) {
    const blockDef = getAnyBlockDefinition(block.type);
    if (!blockDef) continue;

    for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
      if (inputDef.exposedAsPort === false) continue;

      const addr = inputAddressKey(block.id as string, portId);
      const trace = traceBinding(block.id as string, portId);
      if (!trace.rootEdge) {
        map.set(addr, {
          kind: 'unresolved',
          writerCount: trace.writerCount,
          chain: [],
          controls: [],
        });
        continue;
      }

      const rootEdge = trace.rootEdge;
      const sourceType = resolvePortType(trace.rootEdge.fromBlockId, trace.rootEdge.fromPort, 'out');
      const targetType = resolvePortType(block.id as string, portId, 'in');
      const defaultPresentation = {
        label: inputDef.label ?? portId,
        hint: inputDef.uiHint,
      };
      const rootBlock = trace.rootBlock ? blocksById.get(trace.rootBlock.id as string) ?? trace.rootBlock : undefined;
      const sourceControls = rootBlock
        ? trace.rootEdge.role === 'defaultWire'
          ? buildControlDescriptors(
              block.id as string,
              rootBlock.type,
              rootBlock.params,
              (paramId) => ({
                kind: 'bindingSourceParam',
                blockId: block.id as BlockId,
                portId: portId as PortId,
                sourceBlockType: rootBlock.type,
                sourceOutputPortId: rootEdge.fromPort as PortId,
                paramId,
              }),
              defaultPresentation,
            )
          : buildControlDescriptors(
              rootBlock.id as string,
              rootBlock.type,
              rootBlock.params,
              (paramId) => ({
                kind: 'blockParam',
                blockId: rootBlock.id as BlockId,
                paramId,
              }),
            )
        : [];

      const sourceKind: PortProvenance['kind'] =
        trace.rootEdge.role === 'defaultWire'
          ? 'defaultSource'
          : trace.rootEdge.role === 'implicitCoerce'
            ? 'adapter'
            : trace.rootEdge.role === 'userWire'
              ? 'userEdge'
              : 'unresolved';

      map.set(addr, {
        kind: 'resolved',
        writerCount: trace.writerCount,
        sourceKind,
        sourceBlockId: trace.rootEdge.fromBlockId,
        sourceBlockType: rootBlock?.type,
        sourcePortId: trace.rootEdge.fromPort,
        sourceType,
        targetType,
        chain: trace.chain,
        controls: [...sourceControls, ...trace.controls],
      });
    }
  }

  return map;
}

export function buildFrontendSemanticMaps(
  normalizedPatch: NormalizedPatch,
  typedPatch: TypedPatch | null,
): FrontendSemanticMaps {
  return {
    resolvedPortTypes: buildResolvedPortTypes(typedPatch, normalizedPatch),
    portProvenance: buildPortProvenance(normalizedPatch, typedPatch),
    inputBindings: buildInputBindings(normalizedPatch, typedPatch),
  };
}
