/**
 * V1SelectionDetail — the V1 provider of the SelectionDetail seam.
 *
 * Wraps the SAME authorities the V1 inspectors read today — `PatchStore` (blocks,
 * ports, params, lenses, mutations) and `FrontendResultStore` (resolved types,
 * provenance chains, input bindings) — plus the registry and the authoring
 * semantic queries. It adds no fact of its own; it translates those V1 authorities
 * into the neutral SelectionDetail vocabulary, so the inspector renders V1 detail
 * without importing a single V1 store. Because it wraps everything the V1 inspector
 * did, the V1 boot loses no interaction. [LAW:one-source-of-truth]
 */

import type { PatchStore } from '../../stores/PatchStore';
import type { FrontendResultStore } from '../../stores/FrontendResultStore';
import type { Block, Patch, Edge } from '../../graph/Patch';
import type { BlockId, PortId, DefaultSource, CombineMode, TransformStep } from '../../types';
import {
  getAnyBlockDefinition,
  BLOCK_DEFS_BY_TYPE,
  type AnyBlockDef,
  type InputDef,
} from '../../blocks/registry';
import type { ControlMutationTarget } from '../../types/control-target';
import {
  formatDefaultSourceLabel,
  isTimeDefaultSource,
} from '../defaultSourcePresentation';
import {
  getValidCombineModesForType,
  getValidDefaultSourceBlockTypes,
  getCompatibleLensesForConnection,
} from '../authoring/semanticQueries';
import { getLensLabel, lensTargetsConnection } from '../reactFlowEditor/lensUtils';
import { typeDisplayFor } from './neutral-projection';
import type { PortTypeDisplay } from './types';
import type {
  BlockDetail,
  CombineModeDetail,
  ConfigField,
  DefaultSourceDetail,
  DetailControl,
  EdgeChainStep,
  EdgeDetail,
  EdgeRef,
  EndpointDetail,
  InputPortDetail,
  LensEntryDetail,
  LensManagementDetail,
  LensOptionDetail,
  OutputPortDetail,
  PortDetail,
  PortFeed,
  PreviewPortDetail,
  SelectionDetail,
  SelectOption,
  TypePreviewDetail,
} from './selection-detail';

const COMBINE_MODE_LABELS: Record<string, string> = {
  last: 'Last (default)',
  first: 'First',
  sum: 'Sum',
  average: 'Average',
  max: 'Maximum',
  min: 'Minimum',
  mul: 'Multiply',
  layer: 'Layer',
  or: 'OR (boolean)',
  and: 'AND (boolean)',
  collect: 'Collect',
  array: 'Array',
};

export class V1SelectionDetail implements SelectionDetail {
  constructor(
    private readonly store: PatchStore,
    private readonly frontend: FrontendResultStore,
  ) {}

  private get patch(): Patch {
    return this.store.patch;
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  describeBlock(blockId: string): BlockDetail | undefined {
    const id = blockId as BlockId;
    const block = this.patch.blocks.get(id);
    if (!block) return undefined;
    const def = getAnyBlockDefinition(block.type);
    if (!def) {
      return {
        id: blockId,
        variant: 'unknownType',
        type: block.type,
        typeLabel: block.type,
        displayName: block.displayName ?? block.type,
        canEditDisplayName: true,
        inputs: [],
        outputs: [],
        config: [],
      };
    }
    if (block.role?.kind === 'timeRoot') {
      return {
        id: blockId,
        variant: 'timeRoot',
        type: block.type,
        typeLabel: def.label,
        displayName: block.displayName ?? def.label,
        canEditDisplayName: true,
        inputs: [],
        outputs: [],
        config: [],
      };
    }

    const inputs = Object.entries(def.inputs).map(([portId, inputDef]) =>
      this.inputPortDetail(block, portId, inputDef),
    );
    const outputs = Object.entries(def.outputs).map(([portId, outputDef]) => {
      const targets = this.patch.edges
        .filter((e) => e.from.blockId === blockId && e.from.slotId === portId)
        .map((e) => this.endpoint(e.to.blockId, e.to.slotId, 'input'));
      return {
        id: portId,
        label: outputDef.label ?? portId,
        typeDisplay: this.portTypeDisplay(blockId, portId, 'output'),
        targets,
      } satisfies OutputPortDetail;
    });

    return {
      id: blockId,
      variant: 'block',
      type: block.type,
      typeLabel: def.label,
      displayName: block.displayName ?? def.label,
      canEditDisplayName: true,
      inputs,
      outputs,
      config: this.configFields(block, def),
    };
  }

  describeEdge(edgeId: string): EdgeDetail | undefined {
    const found = this.patch.edges.find((e) => e.id === edgeId);
    if (!found) return undefined;

    const provenance = this.frontend.getPortProvenanceByIds(
      found.to.blockId,
      found.to.slotId,
      'in',
    );
    const chain: readonly TransformStep[] =
      provenance && provenance.kind !== 'unresolved' ? provenance.chain : [];

    return {
      id: found.id,
      source: this.endpoint(found.from.blockId, found.from.slotId, 'output'),
      target: this.endpoint(found.to.blockId, found.to.slotId, 'input'),
      chain: chain.map((step) => this.chainStep(step)),
      lensManagement: this.lensManagement(found),
    };
  }

  describePort(ref: { blockId: string; portId: string }): PortDetail | undefined {
    const id = ref.blockId as BlockId;
    const block = this.patch.blocks.get(id);
    if (!block) return undefined;
    const def = getAnyBlockDefinition(block.type);
    if (!def) return undefined;
    const inputDef = def.inputs[ref.portId];
    const outputDef = def.outputs[ref.portId];
    const portDef = inputDef ?? outputDef;
    if (!portDef) return undefined;
    const isInput = Boolean(inputDef);

    const feed: PortFeed = isInput
      ? this.inputFeed(block, ref.portId, inputDef)
      : { kind: 'unconnected' };
    const targets = isInput
      ? []
      : this.patch.edges
          .filter((e) => e.from.blockId === ref.blockId && e.from.slotId === ref.portId)
          .map((e) => this.endpoint(e.to.blockId, e.to.slotId, 'input'));

    return {
      ref,
      direction: isInput ? 'input' : 'output',
      label: portDef.label ?? ref.portId,
      typeDisplay: this.portTypeDisplay(ref.blockId, ref.portId, isInput ? 'input' : 'output'),
      parentBlock: this.endpoint(ref.blockId, undefined, 'input'),
      feed,
      targets,
      controls: isInput ? this.inputControls(block.id, ref.portId) : [],
      defaultSource: isInput ? this.defaultSourceDetail(block, ref.portId, inputDef) : undefined,
      combineMode: isInput ? this.combineModeDetail(block, ref.portId) : undefined,
    };
  }

  describeTypePreview(blockType: string): TypePreviewDetail | undefined {
    const def = getAnyBlockDefinition(blockType);
    if (!def) return undefined;
    const inputs: PreviewPortDetail[] = Object.entries(def.inputs).map(([id, input]) => ({
      id,
      label: input.label ?? id,
      typeLabel: this.typeLabel(input.type),
      defaultLabel: input.defaultSource ? formatDefaultSourceLabel(input.defaultSource) : undefined,
      defaultIsTime: input.defaultSource ? isTimeDefaultSource(input.defaultSource) : undefined,
    }));
    const outputs: PreviewPortDetail[] = Object.entries(def.outputs).map(([id, output]) => ({
      id,
      label: output.label ?? id,
      typeLabel: this.typeLabel(output.type),
    }));
    return {
      type: def.type,
      typeLabel: def.label,
      description: def.description,
      inputs,
      outputs,
      form: def.form,
      capability: def.capability,
    };
  }

  // ===========================================================================
  // Commands
  // ===========================================================================

  setDisplayName(blockId: string, displayName: string): { error?: string } {
    return this.store.updateBlockDisplayName(blockId as BlockId, displayName);
  }

  setDefaultSource(
    blockId: string,
    portId: string,
    blockType: string | undefined,
    outputPortId?: string,
  ): void {
    if (blockType === undefined) {
      this.store.updateInputPort(blockId as BlockId, portId, { defaultSource: undefined });
      return;
    }
    // `blockType` comes from the block-type dropdown, whose options are exactly the
    // registry's valid default-source types — so an unregistered type or a type with
    // no output is an impossible state, not a user path. Crash loudly rather than
    // dropping the change silently. [LAW:no-silent-failure]
    const def = BLOCK_DEFS_BY_TYPE.get(blockType);
    if (!def) throw new Error(`setDefaultSource: unknown block type "${blockType}"`);
    const output = outputPortId ?? Object.keys(def.outputs)[0];
    if (!output) throw new Error(`setDefaultSource: block type "${blockType}" has no output port`);
    const nextDefault: DefaultSource = { blockType, output, params: {} };
    this.store.updateInputPort(blockId as BlockId, portId, { defaultSource: nextDefault });
  }

  setCombineMode(blockId: string, portId: string, mode: string): void {
    this.store.updateInputPortCombineMode(blockId as BlockId, portId as PortId, mode as CombineMode);
  }

  addLens(edge: EdgeRef, lensType: string): void {
    this.store.addLens(
      edge.targetBlockId as BlockId,
      edge.targetPortId,
      lensType,
      `v1:blocks.${edge.sourceBlockId}.outputs.${edge.sourcePortId}`,
    );
  }

  removeLens(edge: EdgeRef, lensId: string): void {
    this.store.removeLens(edge.targetBlockId as BlockId, edge.targetPortId, lensId);
  }

  connect(source: { blockId: string; portId: string }, target: { blockId: string; portId: string }): void {
    this.store.addEdge(
      { kind: 'port', blockId: source.blockId as BlockId, slotId: source.portId as PortId },
      { kind: 'port', blockId: target.blockId as BlockId, slotId: target.portId as PortId },
    );
  }

  removeEdge(edgeId: string): void {
    this.store.removeEdge(edgeId);
  }

  // ===========================================================================
  // Projection helpers
  // ===========================================================================

  private inputPortDetail(block: Block, portId: string, inputDef: InputDef): InputPortDetail {
    return {
      id: portId,
      label: inputDef.label ?? portId,
      typeDisplay: this.portTypeDisplay(block.id, portId, 'input'),
      feed: this.inputFeed(block, portId, inputDef),
      controls: this.inputControls(block.id, portId),
      defaultSource: this.defaultSourceDetail(block, portId, inputDef),
      combineMode: this.combineModeDetail(block, portId),
    };
  }

  private inputFeed(block: Block, portId: string, inputDef: InputDef): PortFeed {
    const incoming = this.patch.edges.filter(
      (e) => e.to.blockId === block.id && e.to.slotId === portId,
    );
    const sources = incoming.map((e) => this.endpoint(e.from.blockId, e.from.slotId, 'output'));
    // Build the connected branch only from a proven-non-empty list (head narrows the
    // tuple type) — a `connected` feed with zero sources is unrepresentable. [LAW:types-are-the-program]
    const [head, ...tail] = sources;
    if (head) return { kind: 'connected', sources: [head, ...tail] };

    const effective = this.effectiveDefaultSource(block, portId, inputDef);
    if (effective) {
      return { kind: 'default', label: formatDefaultSourceLabel(effective) };
    }
    return { kind: 'unconnected' };
  }

  private inputControls(blockId: BlockId, portId: string): readonly DetailControl[] {
    const binding = this.frontend.getInputBindingByIds(blockId, portId as PortId);
    if (!binding) return [];
    return binding.controls.map((control) => ({
      id: control.id,
      label: control.label,
      value: control.value,
      hint: control.hint,
      apply: (next: unknown) => this.store.updateControlValue(control.target, next),
    }));
  }

  private defaultSourceDetail(
    block: Block,
    portId: string,
    inputDef: InputDef | undefined,
  ): DefaultSourceDetail | undefined {
    if (!inputDef) return undefined;
    const effective = this.effectiveDefaultSource(block, portId, inputDef);
    if (!effective) return undefined;

    const blockTypeOptions: SelectOption[] = getValidDefaultSourceBlockTypes(
      this.patch,
      block.id,
      portId as PortId,
    ).map((bt) => ({ value: bt.blockType, label: bt.label ?? bt.blockType }));

    const currentDef = BLOCK_DEFS_BY_TYPE.get(effective.blockType);
    const outputPortOptions: SelectOption[] = currentDef
      ? Object.entries(currentDef.outputs).map(([id, out]) => ({ value: id, label: out.label ?? id }))
      : [];

    const registryDefault = inputDef.defaultSource;
    const canReset = Boolean(
      registryDefault &&
        (effective.blockType !== registryDefault.blockType ||
          effective.output !== registryDefault.output ||
          JSON.stringify(effective.params ?? {}) !== JSON.stringify(registryDefault.params ?? {})),
    );

    const connected = this.patch.edges.some(
      (e) => e.to.blockId === block.id && e.to.slotId === portId,
    );

    return {
      blockType: effective.blockType,
      outputPortId: effective.output,
      blockTypeOptions,
      outputPortOptions,
      canReset,
      inactive: connected,
    };
  }

  private combineModeDetail(block: Block, portId: string): CombineModeDetail | undefined {
    const resolvedType = this.frontend.getResolvedPortTypeByIds(block.id, portId as PortId, 'in');
    const modes = getValidCombineModesForType(resolvedType);
    if (modes.length === 0) return undefined;
    const current = block.inputPorts.get(portId)?.combineMode ?? 'last';
    return {
      current,
      options: modes.map((mode) => ({ value: mode, label: COMBINE_MODE_LABELS[mode] ?? mode })),
    };
  }

  private configFields(block: Block, def: AnyBlockDef): readonly ConfigField[] {
    const params = block.params ?? {};
    return Object.keys(params)
      .filter((key) => {
        if (key === 'payloadType') return false;
        const inputDef = def.inputs[key];
        // Params exposed as ports are edited on the node; config shows only the rest.
        return !(inputDef && inputDef.exposedAsPort !== false);
      })
      .map((key): ConfigField => {
        const inputDef = def.inputs[key];
        // An expression block declares a code editor for its body param in its
        // normalized def; mount that editor rather than a text box. Read the def
        // field directly (not the UI helper) to keep this pure data provider free of
        // UI-module coupling. [LAW:one-source-of-truth] [LAW:one-way-deps]
        if (def.ui.inspector.paramEditors[key]?.kind === 'expression-editor') {
          return { kind: 'expression', id: key, blockId: block.id, value: String(params[key] ?? '') };
        }
        const target: ControlMutationTarget = { kind: 'blockParam', blockId: block.id, paramId: key };
        return {
          kind: 'control',
          control: {
            id: key,
            label: key,
            value: params[key],
            hint: inputDef?.uiHint,
            apply: (next: unknown) => this.store.updateControlValue(target, next),
          },
        };
      });
  }

  private lensManagement(edge: Edge): LensManagementDetail {
    const sourceBlock = this.patch.blocks.get(edge.from.blockId as BlockId);
    const existing: LensEntryDetail[] = this.store
      .getLensesForPort(edge.to.blockId as BlockId, edge.to.slotId)
      .filter((lens) =>
        lensTargetsConnection(lens, edge.from.blockId, edge.from.slotId, sourceBlock?.displayName),
      )
      .slice()
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((lens) => ({
        id: lens.id,
        label: getLensLabel(lens.lensType),
        params: this.lensParams(edge, lens.id, lens.lensType, lens.params),
      }));

    const compatible: LensOptionDetail[] = getCompatibleLensesForConnection(
      this.patch,
      this.frontend,
      edge.from.blockId as BlockId,
      edge.from.slotId as PortId,
      edge.to.blockId as BlockId,
      edge.to.slotId as PortId,
    ).map((lens) => ({
      blockType: lens.blockType,
      label: lens.label,
      description: lens.description,
    }));

    return { existing, compatible };
  }

  private lensParams(
    edge: Edge,
    lensId: string,
    lensType: string,
    params: Record<string, unknown> | undefined,
  ): readonly DetailControl[] {
    const def = getAnyBlockDefinition(lensType);
    if (!def) return [];
    return Object.entries(def.inputs)
      .filter(([inputId]) => inputId !== 'in')
      .map(([paramId, inputDef]) => {
        const target: ControlMutationTarget = {
          kind: 'bindingLensParam',
          blockId: edge.to.blockId as BlockId,
          portId: edge.to.slotId as PortId,
          lensId,
          paramId,
        };
        return {
          id: paramId,
          label: inputDef.label ?? paramId,
          value: params?.[paramId] ?? inputDef.defaultValue,
          hint: inputDef.uiHint,
          apply: (next: unknown) => this.store.updateControlValue(target, next),
        };
      });
  }

  private chainStep(step: TransformStep): EdgeChainStep {
    if (step.kind === 'lens') {
      return { kind: 'lens', label: getLensLabel(step.lens.lensId) };
    }
    return {
      kind: 'adapter',
      label: step.adapter.replace('Adapter_', '').replace(/([A-Z])/g, ' $1').trim(),
      fromType: this.typeLabel(step.from),
      toType: this.typeLabel(step.to),
    };
  }

  private effectiveDefaultSource(
    block: Block,
    portId: string,
    inputDef: InputDef | undefined,
  ): DefaultSource | undefined {
    const authored = block.inputPorts.get(portId)?.authoredControl?.source;
    if (authored) {
      return {
        blockType: authored.blockType,
        output: authored.outputPortId,
        params: { ...authored.params },
      };
    }
    return block.inputPorts.get(portId)?.defaultSource ?? inputDef?.defaultSource;
  }

  private endpoint(
    blockId: string,
    portId: string | undefined,
    direction: 'input' | 'output',
  ): EndpointDetail {
    const block = this.patch.blocks.get(blockId as BlockId);
    return {
      blockId,
      portId: portId ?? '',
      blockLabel: block?.displayName || block?.type || blockId,
      typeDisplay: portId ? this.portTypeDisplay(blockId, portId, direction) : undefined,
    };
  }

  private portTypeDisplay(
    blockId: string,
    portId: string,
    direction: 'input' | 'output',
  ): PortTypeDisplay | undefined {
    const type = this.frontend.getResolvedPortTypeByIds(
      blockId as BlockId,
      portId as PortId,
      direction === 'input' ? 'in' : 'out',
    );
    return type ? typeDisplayFor(type) : undefined;
  }

  private typeLabel(type: Parameters<typeof typeDisplayFor>[0] | undefined): string {
    return type ? typeDisplayFor(type).label : 'unknown';
  }
}
