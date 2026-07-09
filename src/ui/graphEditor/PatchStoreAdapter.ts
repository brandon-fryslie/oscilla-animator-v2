/**
 * PatchStoreAdapter - Adapter for main patch graph editing
 *
 * Wraps PatchStore + LayoutStore + FrontendResultStore to implement the neutral
 * GraphDataAdapter. This adapter is the boundary where the V1 backend's
 * vocabulary (CanonicalType, default sources, provenance, binding) is projected
 * into the editor's neutral, presentation-ready facts: a type display, a
 * decoration list, and inline controls. [LAW:effects-at-boundaries]
 *
 * ARCHITECTURAL: This adapter does not duplicate graph logic — mutations
 * delegate to the underlying stores. It DOES own the V1→neutral projection
 * (formatting, decoration synthesis), so the renderer can stay pure.
 */

import { makeObservable, computed, runInAction } from 'mobx';
import type { BlockId, UIControlHint, DefaultSource } from '../../types';
import type { ImmutablePatch, PatchStore } from '../../stores/PatchStore';
import type { LayoutStore, NodePosition } from '../../stores/LayoutStore';
import type { FrontendResultStore } from '../../stores/FrontendResultStore';
import type {
  GraphSnapshotSource,
  GraphHistorySnapshot,
} from '../../stores/GraphHistoryStore';
import type { Block, InputPort } from '../../graph/Patch';
import { getAnyBlockDefinition, type AnyBlockDef, type InputDef } from '../../blocks/registry';
import { canonicalType, FLOAT } from '../../core/canonical-types';
import type { InferenceCanonicalType } from '../../core/inference-types';
import type { PortProvenance } from '../../stores/FrontendResultStore';
import {
  formatCanonicalTypeTooltip,
  formatProvenanceTooltip,
  getAdapterBadgeLabel,
  getUnresolvedWarning,
} from './portTooltipFormatters';
import { typeDisplayFor, defaultSourceIndicator } from './neutral-projection';
import type {
  GraphDataAdapter,
  BlockLike,
  EdgeLike,
  InputPortLike,
  OutputPortLike,
  ParamData,
  PortDecoration,
} from './types';

/** V1 authored state the undo history captures: the patch plus editor layout. */
interface PatchStoreHistoryState {
  readonly patch: ImmutablePatch;
  readonly positions: ReadonlyMap<BlockId, NodePosition>;
}

/**
 * Adapter that exposes PatchStore + LayoutStore through GraphDataAdapter.
 */
export class PatchStoreAdapter implements GraphDataAdapter<BlockId>, GraphSnapshotSource {
  constructor(
    private readonly patchStore: PatchStore,
    private readonly layoutStore: LayoutStore,
    private readonly frontendStore: FrontendResultStore,
  ) {
    makeObservable(this, {
      blocks: computed,
      edges: computed,
      dataVersion: computed,
      historyToken: computed,
    });
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  get blocks(): ReadonlyMap<BlockId, BlockLike> {
    const blockMap = new Map<BlockId, BlockLike>();

    // Read snapshot so MobX tracks it as a dependency of this computed.
    const hasFrontend = this.frontendStore.snapshot.status !== 'none';

    for (const [id, block] of this.patchStore.blocks) {
      blockMap.set(id, this.toBlockLike(id, block, hasFrontend));
    }

    return blockMap;
  }

  get edges(): readonly EdgeLike[] {
    return this.patchStore.edges.map((edge) => ({
      id: edge.id,
      sourceBlockId: edge.from.blockId,
      sourcePortId: edge.from.slotId,
      targetBlockId: edge.to.blockId,
      targetPortId: edge.to.slotId,
    }));
  }

  get dataVersion(): number {
    return this.frontendStore.snapshot.patchRevision;
  }

  // ---------------------------------------------------------------------------
  // Block Operations
  // ---------------------------------------------------------------------------

  addBlock(type: string, position: { x: number; y: number }): BlockId {
    let blockId!: BlockId;
    runInAction(() => {
      // [LAW:one-source-of-truth] Add + position committed atomically.
      blockId = this.patchStore.addBlock(type, {});
      this.layoutStore.setPosition(blockId, position);
    });
    return blockId;
  }

  removeBlock(id: BlockId): void {
    this.patchStore.removeBlock(id);
    this.layoutStore.removePosition(id);
  }

  getBlockPosition(id: BlockId): { x: number; y: number } | undefined {
    return this.layoutStore.getPosition(id);
  }

  setBlockPosition(id: BlockId, position: { x: number; y: number }): void {
    this.layoutStore.setPosition(id, position);
  }

  // ---------------------------------------------------------------------------
  // Edge Operations
  // ---------------------------------------------------------------------------

  addEdge(source: BlockId, sourcePort: string, target: BlockId, targetPort: string): string {
    return this.patchStore.addEdge(
      { kind: 'port', blockId: source, slotId: sourcePort },
      { kind: 'port', blockId: target, slotId: targetPort }
    );
  }

  removeEdge(id: string): void {
    this.patchStore.removeEdge(id);
  }

  // ---------------------------------------------------------------------------
  // Optional Operations (PatchStore-specific)
  // ---------------------------------------------------------------------------

  updateBlockParams(id: BlockId, params: Record<string, unknown>): void {
    this.patchStore.updateBlockParams(id, params);
  }

  updateBlockDisplayName(id: BlockId, displayName: string): { error?: string } {
    return this.patchStore.updateBlockDisplayName(id, displayName);
  }

  // ---------------------------------------------------------------------------
  // GraphSnapshotSource (undo/redo)
  // ---------------------------------------------------------------------------

  /**
   * Structural change-token folding authored-patch and layout revisions. Moves only
   * on an actual edit through ANY write-path (canvas, context menu, inspector,
   * hotkey) — never on frontend compile churn. [LAW:one-source-of-truth]
   */
  get historyToken(): { patch: number; layout: number } {
    return { patch: this.patchStore.dataVersion, layout: this.layoutStore.revision };
  }

  captureHistorySnapshot(): GraphHistorySnapshot {
    // `patchStore.patch` is already a defensive, frozen clone per revision, so holding
    // the reference is safe — later edits produce a fresh snapshot, never mutate this.
    const state: PatchStoreHistoryState = {
      patch: this.patchStore.patch,
      positions: new Map(this.layoutStore.positions),
    };
    return state as unknown as GraphHistorySnapshot;
  }

  restoreHistorySnapshot(snapshot: GraphHistorySnapshot): void {
    const state = snapshot as unknown as PatchStoreHistoryState;
    runInAction(() => {
      this.patchStore.loadPatch(state.patch);
      this.layoutStore.clear();
      this.layoutStore.setPositions(state.positions);
    });
  }

  // ---------------------------------------------------------------------------
  // Private: V1 -> neutral projection
  // ---------------------------------------------------------------------------

  private toBlockLike(id: BlockId, block: Block, hasFrontend: boolean): BlockLike {
    const blockDef = getAnyBlockDefinition(block.type);
    const inputPorts = new Map<string, InputPortLike>();
    const outputPorts = new Map<string, OutputPortLike>();
    const controls: ParamData[] = [];
    const handledParamIds = new Set<string>();

    if (blockDef) {
      for (const [portIdStr, inputDef] of Object.entries(blockDef.inputs)) {
        if (inputDef.exposedAsPort === false) {
          // Config-only input -> block-level inline control.
          const value = block.params[portIdStr] ?? inputDef.defaultValue;
          if (value !== undefined) {
            handledParamIds.add(portIdStr);
            controls.push({
              id: portIdStr,
              label: inputDef.label || portIdStr,
              value,
              hint: (inputDef as InputDef & { uiHint?: UIControlHint }).uiHint,
              target: { kind: 'blockParam', blockId: id, paramId: portIdStr },
            });
          }
          continue;
        }
        inputPorts.set(
          portIdStr,
          this.toInputPortLike(id, portIdStr, inputDef, block.inputPorts.get(portIdStr), blockDef, hasFrontend),
        );
      }

      for (const [portIdStr, outputDef] of Object.entries(blockDef.outputs)) {
        const resolved = hasFrontend
          ? (this.frontendStore.getResolvedPortTypeByIds(id, portIdStr, 'out') as InferenceCanonicalType | undefined)
          : undefined;
        const t = resolved ?? outputDef.type ?? canonicalType(FLOAT);
        outputPorts.set(portIdStr, {
          id: portIdStr,
          label: outputDef.label || portIdStr,
          typeDisplay: typeDisplayFor(t),
        });
      }
    } else {
      // No block definition (should be rare for V1): render instance ports raw.
      for (const [portIdStr, port] of block.inputPorts) {
        inputPorts.set(portIdStr, { id: port.id, label: portIdStr });
      }
      for (const [portIdStr, port] of block.outputPorts) {
        outputPorts.set(portIdStr, { id: port.id, label: portIdStr });
      }
    }

    // Extra persisted params not represented by declared inputs.
    for (const [paramId, value] of Object.entries(block.params)) {
      if (handledParamIds.has(paramId)) continue;
      if (paramId === 'payloadType') continue;
      if (blockDef && paramId in blockDef.inputs) continue;
      controls.push({
        id: paramId,
        label: paramId,
        value,
        target: { kind: 'blockParam', blockId: id, paramId },
      });
    }

    return {
      id,
      type: block.type,
      typeLabel: blockDef?.label ?? block.type,
      displayName: block.displayName,
      params: block.params as Record<string, unknown>,
      inputPorts,
      outputPorts,
      controls,
    };
  }

  private toInputPortLike(
    blockId: BlockId,
    portIdStr: string,
    inputDef: InputDef,
    port: InputPort | undefined,
    blockDef: AnyBlockDef,
    hasFrontend: boolean,
  ): InputPortLike {
    // Effective default source: frontend snapshot is the authority; fall back
    // to authored control, instance override, then registry seed.
    let ds: DefaultSource | undefined = hasFrontend
      ? this.frontendStore.getDefaultSourceByIds(blockId, portIdStr)
      : undefined;
    if (!ds) {
      ds = port?.authoredControl?.source
        ? {
            blockType: port.authoredControl.source.blockType,
            output: port.authoredControl.source.outputPortId,
            params: { ...port.authoredControl.source.params },
          }
        : port?.defaultSource
        ?? (inputDef as InputDef & { defaultSource?: DefaultSource }).defaultSource;
    }

    const resolved = hasFrontend
      ? (this.frontendStore.getResolvedPortTypeByIds(blockId, portIdStr, 'in') as InferenceCanonicalType | undefined)
      : undefined;
    const effectiveType = resolved ?? inputDef.type ?? canonicalType(FLOAT);
    const typeDisplay = typeDisplayFor(effectiveType);

    const provenance = hasFrontend
      ? this.frontendStore.getPortProvenanceByIds(blockId, portIdStr, 'in')
      : undefined;
    const binding = hasFrontend ? this.frontendStore.getInputBindingByIds(blockId, portIdStr) : undefined;

    return {
      id: port?.id ?? portIdStr,
      label: inputDef.label || portIdStr,
      typeDisplay,
      decorations: this.inputDecorations(ds, provenance, resolved, typeDisplay.tooltip),
      controls: binding?.controls?.map((control) => ({
        id: `${portIdStr}:${control.id}`,
        label: control.label,
        value: control.value,
        hint: control.hint,
        target: control.target,
      })),
    };
  }

  /**
   * Project V1 default-source + provenance into neutral port decorations.
   * The indicator dot is always emitted when a default exists; the renderer
   * hides it while the port is connected.
   */
  private inputDecorations(
    ds: DefaultSource | undefined,
    provenance: PortProvenance | undefined,
    resolved: InferenceCanonicalType | undefined,
    typeTooltip: string,
  ): readonly PortDecoration[] {
    const decorations: PortDecoration[] = [];

    if (ds) {
      const detail = resolved ? formatCanonicalTypeTooltip(resolved) : typeTooltip;
      const tooltip = [formatProvenanceTooltip(provenance), detail].join('\n\n');
      decorations.push(defaultSourceIndicator(ds, tooltip));
    }

    if (provenance) {
      const badge = getAdapterBadgeLabel(provenance);
      if (badge) {
        decorations.push({ kind: 'badge', label: badge, tooltip: formatProvenanceTooltip(provenance) });
      }
      const warning = getUnresolvedWarning(provenance);
      if (warning) {
        decorations.push({ kind: 'warning', label: warning, tooltip: formatProvenanceTooltip(provenance) });
      }
    }

    return decorations;
  }
}
