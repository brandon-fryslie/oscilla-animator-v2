/**
 * src/stores/PillarPatchStore.ts
 *
 * The authored native (ScenePlan-path) patch — the single source of truth for a
 * patch built in the native graph editor. Holds a `PillarPatch` and the CRUD the
 * editor needs; the compiled `ScenePlan`, the validation verdicts, and the
 * human-readable diagnostics are all *derived* (MobX computeds), never authored
 * or stored as truth.
 *
 * [LAW:one-source-of-truth] The authored blocks/edges are canonical; the plan and
 *   diagnostics are derived from them on demand and cannot drift.
 * [LAW:one-way-deps] This store depends on the scene catalog + pure compile/
 *   validate functions only. It never imports a renderer or a Three object; the
 *   runtime observes `compiled` and performs the install at its own boundary.
 * [LAW:dataflow-not-control-flow] `compiled` is a discriminated ok|error value
 *   and `diagnostics` is a (possibly empty) list — the renderable-or-not state is
 *   data the runtime and UI read, not a branch this store takes.
 */

import { makeAutoObservable } from 'mobx';

import { makeGridOfSquaresPatch } from '../pillars/fixtures/grid-of-squares';
import type { PillarBlock, PillarEdge, PillarPatch } from '../pillars/types';
import {
  ALL_SCENE_BLOCKS,
  buildSceneRegistry,
  compileScenePlan,
  defaultSceneConfig,
  edgeRoleForPort,
  formatSceneDiagnostic,
  pillarKindForRole,
  validateScenePatch,
  type SceneCatalogMetadata,
  type SceneCompileResult,
  type SceneRegistry,
  type SceneValidation,
} from '../pillars/scene';

export class PillarPatchStore {
  /** The scene block catalog the palette, inspector, and validation all read. */
  readonly registry: SceneRegistry = buildSceneRegistry(ALL_SCENE_BLOCKS);

  private blocks: PillarBlock[];
  private edges: PillarEdge[];
  private idCounter = 0;

  constructor(seed: PillarPatch = makeGridOfSquaresPatch()) {
    this.blocks = [...seed.blocks];
    this.edges = [...seed.edges];
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // ── Derived (read) ────────────────────────────────────────────────────────

  get patch(): PillarPatch {
    return { blocks: this.blocks, edges: this.edges };
  }

  get catalog(): readonly SceneCatalogMetadata[] {
    return this.registry.catalog;
  }

  /** The compiled ScenePlan, or the collected errors. The runtime installs on ok. */
  get compiled(): SceneCompileResult {
    return compileScenePlan(this.patch);
  }

  /** Per-edge verdicts + structural diagnostics for editor highlighting. */
  get validation(): SceneValidation {
    return validateScenePatch(this.registry, this.patch);
  }

  /**
   * The flat, human-readable problem list for the editor's diagnostics strip:
   * structural validation problems plus any compile error (config parse, missing
   * draw, conflicting cameras), de-duplicated since both speak the same `[scene]`
   * vocabulary.
   */
  get diagnostics(): readonly string[] {
    const structural = this.validation.diagnostics.map(formatSceneDiagnostic);
    const compileErrors =
      this.compiled.kind === 'error' ? this.compiled.errors : [];
    return [...new Set([...structural, ...compileErrors])];
  }

  // ── Block operations ──────────────────────────────────────────────────────

  /**
   * Add a block of `type` with its catalog default config. Returns the new id.
   * An unregistered type is a programmer error (the palette only offers
   * registered types), so it throws rather than silently no-op.
   *
   * [LAW:no-silent-failure] Adding an unknown type fails loudly.
   */
  addBlock(type: string): string {
    const def = this.registry.get(type);
    if (def === undefined) {
      throw new Error(`PillarPatchStore: cannot add unregistered block type '${type}'`);
    }
    const id = this.mintId(type);
    this.blocks = [
      ...this.blocks,
      {
        id,
        kind: pillarKindForRole(def.role),
        type,
        config: defaultSceneConfig(def.catalog),
      },
    ];
    return id;
  }

  removeBlock(id: string): void {
    this.blocks = this.blocks.filter((b) => b.id !== id);
    // Edges touching a removed block cannot resolve; drop them with the block.
    this.edges = this.edges.filter((e) => e.source !== id && e.target !== id);
  }

  /**
   * Replace one config field on a block. The raw control value flows straight to
   * the authored config; the block's schema validates it on the next compile, so
   * an out-of-range value surfaces as a diagnostic rather than being clamped here.
   */
  updateConfig(blockId: string, key: string, value: unknown): void {
    this.blocks = this.blocks.map((b) =>
      b.id === blockId ? { ...b, config: { ...b.config, [key]: value } } : b,
    );
  }

  // ── Edge operations ───────────────────────────────────────────────────────

  /**
   * Wire a source block's output to a target block's input slot. The edge's role
   * is derived from the target input port so validation (keyed on `inputSlot`)
   * and assembly (keyed on `role`) agree. Returns the new edge id.
   *
   * [LAW:no-silent-failure] An unknown target type or input slot fails loudly —
   *   it would mint an edge that can never resolve.
   */
  addEdge(source: string, target: string, inputSlot: string): string {
    const targetDef = this.registry.get(this.requireBlock(target).type);
    if (targetDef === undefined) {
      throw new Error(`PillarPatchStore: target block '${target}' has an unregistered type`);
    }
    const port = targetDef.catalog.ports.find(
      (p) => p.direction === 'input' && p.id === inputSlot,
    );
    if (port === undefined) {
      throw new Error(
        `PillarPatchStore: target '${target}' has no input port '${inputSlot}'`,
      );
    }
    const id = this.mintId('edge');
    this.edges = [
      ...this.edges.filter(
        // One feeder per input slot: replace any existing wire into this slot.
        (e) => !(e.target === target && e.inputSlot === inputSlot),
      ),
      { id, source, target, inputSlot, role: edgeRoleForPort(port) },
    ];
    return id;
  }

  removeEdge(id: string): void {
    this.edges = this.edges.filter((e) => e.id !== id);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private requireBlock(id: string): PillarBlock {
    const block = this.blocks.find((b) => b.id === id);
    if (block === undefined) {
      throw new Error(`PillarPatchStore: no block '${id}'`);
    }
    return block;
  }

  private mintId(prefix: string): string {
    let id: string;
    do {
      this.idCounter += 1;
      id = `${prefix}-${this.idCounter}`;
    } while (this.blocks.some((b) => b.id === id) || this.edges.some((e) => e.id === id));
    return id;
  }
}
