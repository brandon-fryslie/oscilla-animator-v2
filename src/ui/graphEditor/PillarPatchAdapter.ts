/**
 * PillarPatchAdapter - Adapter for the pillar / ScenePlan authored graph.
 *
 * Projects PillarPatchStore (blocks + edges + scene registry) into the editor's
 * neutral GraphDataAdapter, so the mature ReactFlow editor (GraphEditorCore +
 * UnifiedNode) can render and edit a pillar patch. Editing flows straight back
 * to PillarPatchStore, whose `compiled` computed drives the live ScenePlan
 * preview via RuntimeService — no extra wiring here. [LAW:effects-at-boundaries]
 *
 * Positions: PillarPatchStore holds no layout, so this adapter owns an
 * observable position map (the same role LayoutStore plays for the V1 patch).
 * The mature editor's autoArrange (ELK) seeds a left→right layout on mount.
 */

import { makeObservable, computed, observable, runInAction } from 'mobx';
import type { PillarPatchStore } from '../../stores/PillarPatchStore';
import type { PillarBlock } from '../../pillars/types/graph';
import type { SceneCatalogMetadata, SceneValueKind } from '../../pillars/scene/scene-block';
import type {
  GraphDataAdapter,
  BlockLike,
  EdgeLike,
  InputPortLike,
  OutputPortLike,
  PortTypeDisplay,
} from './types';

/** Neutral swatch color per scene value kind (parallels the V1 payload palette). */
const SCENE_VALUE_COLORS: Record<SceneValueKind, string> = {
  instanceBundle: '#f59e0b',
  geometry: '#a78bfa',
  materialShell: '#38bdf8',
  texture: '#f472b6',
  camera: '#8b5cf6',
  color: '#ec4899',
  scalar: '#5a9fd4',
  mask: '#10b981',
};

function sceneTypeDisplay(value: SceneValueKind): PortTypeDisplay {
  return {
    label: value,
    tooltip: value,
    color: SCENE_VALUE_COLORS[value] ?? '#888888',
    compatibilityToken: value,
  };
}

/**
 * Adapter exposing PillarPatchStore through the neutral GraphDataAdapter.
 */
export class PillarPatchAdapter implements GraphDataAdapter<string> {
  /** Editor layout positions (PillarPatchStore stores none). */
  private readonly positions = observable.map<string, { x: number; y: number }>();

  constructor(private readonly store: PillarPatchStore) {
    makeObservable(this, {
      blocks: computed,
      edges: computed,
    });
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  get blocks(): ReadonlyMap<string, BlockLike> {
    const blockMap = new Map<string, BlockLike>();
    for (const block of this.store.patch.blocks) {
      blockMap.set(block.id, this.toBlockLike(block));
    }
    return blockMap;
  }

  get edges(): readonly EdgeLike[] {
    // Pillar edges name only the source *block*; anchor to its sole output port.
    const outputHandleByBlock = new Map<string, string | undefined>(
      this.store.patch.blocks.map((b) => [
        b.id,
        this.store.registry.get(b.type)?.catalog.ports.find((p) => p.direction === 'output')?.id,
      ]),
    );

    return this.store.patch.edges.map((edge) => ({
      id: edge.id,
      sourceBlockId: edge.source,
      // On a registry miss use an impossible handle id (never a real port), so
      // createEdgeFromEdgeLike's handle-validity check drops the edge rather than
      // risking a coincidental match on a block that happens to expose 'out'.
      sourcePortId: outputHandleByBlock.get(edge.source) ?? '__unresolved_output__',
      targetBlockId: edge.target,
      targetPortId: edge.inputSlot,
    }));
  }

  // ---------------------------------------------------------------------------
  // Block Operations
  // ---------------------------------------------------------------------------

  addBlock(type: string, position: { x: number; y: number }): string {
    let id!: string;
    runInAction(() => {
      id = this.store.addBlock(type);
      this.positions.set(id, position);
    });
    return id;
  }

  removeBlock(id: string): void {
    runInAction(() => {
      this.store.removeBlock(id);
      this.positions.delete(id);
    });
  }

  getBlockPosition(id: string): { x: number; y: number } | undefined {
    const stored = this.positions.get(id);
    if (stored) return stored;
    // PillarPatchStore holds no layout, so seed a deterministic left→right
    // position from the block's index. This keeps nodes readable on first paint
    // with no dependency on a post-mount auto-layout pass firing at the right
    // moment. [LAW:no-ambient-temporal-coupling]
    const idx = this.store.patch.blocks.findIndex((b) => b.id === id);
    if (idx < 0) return undefined;
    return { x: idx * 260, y: (idx % 3) * 140 };
  }

  setBlockPosition(id: string, position: { x: number; y: number }): void {
    runInAction(() => {
      this.positions.set(id, position);
    });
  }

  // ---------------------------------------------------------------------------
  // Edge Operations
  // ---------------------------------------------------------------------------

  addEdge(source: string, _sourcePort: string, target: string, targetPort: string): string {
    // Pillar wiring is keyed by target input slot; the source output is implied.
    return this.store.addEdge(source, target, targetPort);
  }

  removeEdge(id: string): void {
    this.store.removeEdge(id);
  }

  // ---------------------------------------------------------------------------
  // Optional Operations
  // ---------------------------------------------------------------------------

  updateBlockParams(id: string, params: Record<string, unknown>): void {
    runInAction(() => {
      for (const [key, value] of Object.entries(params)) {
        this.store.updateConfig(id, key, value);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Private: pillar -> neutral projection
  // ---------------------------------------------------------------------------

  private toBlockLike(block: PillarBlock): BlockLike {
    const catalog: SceneCatalogMetadata | undefined = this.store.registry.get(block.type)?.catalog;
    const inputPorts = new Map<string, InputPortLike>();
    const outputPorts = new Map<string, OutputPortLike>();

    for (const port of catalog?.ports ?? []) {
      if (port.direction === 'input') {
        inputPorts.set(port.id, {
          id: port.id,
          label: port.label,
          typeDisplay: sceneTypeDisplay(port.value),
        });
      } else {
        outputPorts.set(port.id, {
          id: port.id,
          label: port.label,
          typeDisplay: sceneTypeDisplay(port.value),
        });
      }
    }

    const displayName = catalog?.displayName ?? block.type;
    return {
      id: block.id,
      type: block.type,
      typeLabel: displayName,
      displayName,
      params: block.config as Record<string, unknown>,
      inputPorts,
      outputPorts,
      // Inline config controls are deferred (add/remove/wire/move is the spike's
      // required edit set); config editing arrives with the control-affordance seam.
      controls: [],
    };
  }
}
