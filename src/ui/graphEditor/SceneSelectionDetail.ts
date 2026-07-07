/**
 * SceneSelectionDetail — the pillar provider of the SelectionDetail seam.
 *
 * Wraps the SAME authorities the pillar editor already reads — `PillarPatchStore`
 * (blocks + edges + config) and the scene registry (`catalog.ports` /
 * `catalog.configFields`) — plus `traceRoute` (the one route trace shared with the
 * Modulation Table and the EdgeDecorator). It surfaces the detail the pillar model
 * HAS — identity, catalog ports with scene types, config fields as editable
 * controls, and an edge's traced transform chain — and leaves absent the facts the
 * pillar model does NOT have: no per-instance rename, no default-source recipes, no
 * combine mode, no lens growth. Those render as absent, never as a fabricated V1
 * section on a pillar block. [LAW:no-silent-failure] [LAW:one-source-of-truth]
 */

import type { PillarPatchStore } from '../../stores/PillarPatchStore';
import type { PillarBlock } from '../../pillars/types/graph';
import type { ScenePortDeclaration, SceneValueKind } from '../../pillars/scene/scene-block';
import type { ControlMutationTarget } from '../../types/control-target';
import { traceRoute } from '../nativeEditor/modulationTable';
import { sceneTypeDisplay, sceneControlToHint } from './scene-projection';
import type { PortTypeDisplay } from './types';
import type {
  BlockDetail,
  ConfigField,
  EdgeChainStep,
  EdgeDetail,
  EndpointDetail,
  InputPortDetail,
  OutputPortDetail,
  PortDetail,
  PortFeed,
  PortRef,
  PreviewPortDetail,
  SelectionDetail,
  TypePreviewDetail,
} from './selection-detail';

export class SceneSelectionDetail implements SelectionDetail {
  constructor(private readonly store: PillarPatchStore) {}

  private block(id: string): PillarBlock | undefined {
    return this.store.patch.blocks.find((b) => b.id === id);
  }

  private ports(type: string): readonly ScenePortDeclaration[] {
    return this.store.registry.get(type)?.catalog.ports ?? [];
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  describeBlock(blockId: string): BlockDetail | undefined {
    const block = this.block(blockId);
    if (!block) return undefined;
    const catalog = this.store.registry.get(block.type)?.catalog;
    const displayName = catalog?.displayName ?? block.type;

    const inputs: InputPortDetail[] = [];
    const outputs: OutputPortDetail[] = [];
    for (const port of catalog?.ports ?? []) {
      if (port.direction === 'input') {
        inputs.push({
          id: port.id,
          label: port.label,
          typeDisplay: sceneTypeDisplay(port.value),
          feed: this.inputFeed(block, port),
          controls: [],
        });
      } else {
        outputs.push({
          id: port.id,
          label: port.label,
          typeDisplay: sceneTypeDisplay(port.value),
          targets: this.outgoing(blockId),
        });
      }
    }

    return {
      id: blockId,
      variant: 'block',
      type: block.type,
      typeLabel: displayName,
      displayName,
      canEditDisplayName: false,
      inputs,
      outputs,
      config: this.configFields(block),
    };
  }

  describeEdge(edgeId: string): EdgeDetail | undefined {
    const found = this.store.patch.edges.find((e) => e.id === edgeId);
    if (!found) return undefined;

    const route = traceRoute(this.store.patch, this.store.registry, found.target, found.inputSlot);
    const chain: EdgeChainStep[] = (route?.transforms ?? []).map((t) => ({
      kind: 'lens',
      label: t.displayName,
    }));

    return {
      id: found.id,
      source: this.endpoint(found.source, this.soleOutput(found.source)),
      target: this.endpoint(found.target, found.inputSlot),
      chain,
      // Pillar chain growth (add/remove transforms) is owned by scene-adapters, not
      // this seam — so the edge carries no lens-management surface. [LAW:decomposition]
    };
  }

  describePort(ref: PortRef): PortDetail | undefined {
    const block = this.block(ref.blockId);
    if (!block) return undefined;
    const port = this.ports(block.type).find((p) => p.id === ref.portId);
    if (!port) return undefined;
    const isInput = port.direction === 'input';
    return {
      ref,
      direction: isInput ? 'input' : 'output',
      label: port.label,
      typeDisplay: sceneTypeDisplay(port.value),
      parentBlock: this.endpoint(ref.blockId, undefined),
      feed: isInput && port.direction === 'input' ? this.inputFeed(block, port) : { kind: 'unconnected' },
      targets: isInput ? [] : this.outgoing(ref.blockId),
      controls: [],
    };
  }

  describeTypePreview(blockType: string): TypePreviewDetail | undefined {
    const catalog = this.store.registry.get(blockType)?.catalog;
    if (!catalog) return undefined;
    const inputs: PreviewPortDetail[] = [];
    const outputs: PreviewPortDetail[] = [];
    for (const port of catalog.ports) {
      const entry: PreviewPortDetail = { id: port.id, label: port.label, typeLabel: port.value };
      if (port.direction === 'input') inputs.push(entry);
      else outputs.push(entry);
    }
    return { type: catalog.type, typeLabel: catalog.displayName, inputs, outputs };
  }

  // ===========================================================================
  // Commands
  // ===========================================================================

  applyControl(target: ControlMutationTarget, value: unknown): void {
    // The pillar model has exactly one control target: a block config field. Route
    // it to updateConfig; any other target kind cannot be produced by this provider
    // (it emits only blockParam controls), so a mismatch is a wiring bug, surfaced
    // loudly rather than silently dropped. [LAW:no-silent-failure]
    if (target.kind !== 'blockParam') {
      throw new Error(`SceneSelectionDetail.applyControl: unsupported target kind "${target.kind}"`);
    }
    this.store.updateConfig(target.blockId, target.paramId, value);
  }

  setDisplayName(): { error?: string } {
    // Pillar blocks carry no per-instance display name — the inspector never offers
    // the editor (canEditDisplayName === false), so this is unreachable UI-side.
    return { error: 'Renaming is not supported in the pillar editor' };
  }

  setDefaultSource(): void {
    // Absent: pillar inputs default via config knobs, not default-source recipes.
  }

  setCombineMode(): void {
    // Absent: the pillar model has no combine-mode concept.
  }

  addLens(): void {
    // Absent: pillar chain growth is owned by scene-adapters.
  }

  removeLens(): void {
    // Absent: pillar chain growth is owned by scene-adapters.
  }

  connect(source: PortRef, target: PortRef): void {
    this.store.addEdge(source.blockId, target.blockId, target.portId);
  }

  removeEdge(edgeId: string): void {
    this.store.removeEdge(edgeId);
  }

  // ===========================================================================
  // Projection helpers
  // ===========================================================================

  private inputFeed(block: PillarBlock, port: Extract<ScenePortDeclaration, { direction: 'input' }>): PortFeed {
    const incoming = this.store.patch.edges.filter(
      (e) => e.target === block.id && e.inputSlot === port.id,
    );
    const sources = incoming.map((e) => this.endpoint(e.source, this.soleOutput(e.source)));
    // A `connected` feed is built only from a proven-non-empty list. [LAW:types-are-the-program]
    const [head, ...tail] = sources;
    if (head) return { kind: 'connected', sources: [head, ...tail] };
    if (port.default.kind === 'configScalar') {
      const value = (block.config as Record<string, unknown>)[port.default.configKey];
      return { kind: 'default', label: `${port.default.configKey} = ${String(value)}` };
    }
    return { kind: 'unconnected' };
  }

  private configFields(block: PillarBlock): readonly ConfigField[] {
    const configFields = this.store.registry.get(block.type)?.catalog.configFields ?? [];
    return configFields.map((field): ConfigField => ({
      kind: 'control',
      control: {
        id: field.key,
        label: field.label,
        value: (block.config as Record<string, unknown>)[field.key] ?? field.defaultValue,
        hint: sceneControlToHint(field.control),
        target: { kind: 'blockParam', blockId: block.id as never, paramId: field.key },
      },
    }));
  }

  private outgoing(blockId: string): readonly EndpointDetail[] {
    return this.store.patch.edges
      .filter((e) => e.source === blockId)
      .map((e) => this.endpoint(e.target, e.inputSlot));
  }

  private soleOutput(blockId: string): string | undefined {
    const block = this.block(blockId);
    if (!block) return undefined;
    return this.ports(block.type).find((p) => p.direction === 'output')?.id;
  }

  private endpoint(blockId: string, portId: string | undefined): EndpointDetail {
    const block = this.block(blockId);
    const catalog = block ? this.store.registry.get(block.type)?.catalog : undefined;
    return {
      blockId,
      portId: portId ?? '',
      blockLabel: catalog?.displayName ?? block?.type ?? blockId,
      typeDisplay: portId ? this.portTypeDisplay(blockId, portId) : undefined,
    };
  }

  private portTypeDisplay(blockId: string, portId: string): PortTypeDisplay | undefined {
    const block = this.block(blockId);
    if (!block) return undefined;
    const value: SceneValueKind | undefined = this.ports(block.type).find((p) => p.id === portId)?.value;
    return value ? sceneTypeDisplay(value) : undefined;
  }
}
