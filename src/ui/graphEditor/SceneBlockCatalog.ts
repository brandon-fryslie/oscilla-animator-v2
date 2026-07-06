/**
 * SceneBlockCatalog — the pillar scene registry projected into the neutral
 * BlockCatalog.
 *
 * The pillar-era counterpart of V1BlockCatalog: it translates each
 * `SceneCatalogMetadata` into a neutral `CatalogEntry` so the same editor
 * library / picker / replacement menu can browse and insert scene blocks. The
 * scene era has no composites, no expression editor, and no singleton roots, so
 * every entry reports the neutral defaults (`form: 'primitive'`,
 * `openBehavior: {kind:'none'}`, `insertable: true`). [LAW:dataflow-not-control-flow]
 */

import { buildSceneRegistry, type SceneCatalogMetadata } from '../../pillars/scene/scene-block';
import { ALL_SCENE_BLOCKS } from '../../pillars/scene';
import { sceneTypeDisplay } from './scene-projection';
import type { BlockCatalog, CatalogEntry, CatalogPort } from './block-catalog';

function ports(catalog: SceneCatalogMetadata, direction: 'input' | 'output'): readonly CatalogPort[] {
  return catalog.ports
    .filter((port) => port.direction === direction)
    .map((port) => ({
      id: port.id,
      label: port.label,
      typeDisplay: sceneTypeDisplay(port.value),
    }));
}

function toCatalogEntry(catalog: SceneCatalogMetadata): CatalogEntry {
  return {
    type: catalog.type,
    label: catalog.displayName,
    category: catalog.category,
    form: 'primitive',
    editable: true,
    insertable: true,
    openBehavior: { kind: 'none' },
    inputs: ports(catalog, 'input'),
    outputs: ports(catalog, 'output'),
  };
}

/** Build the scene catalog from a scene registry's catalog metadata. */
export function createSceneBlockCatalog(
  catalogMetadata: readonly SceneCatalogMetadata[],
): BlockCatalog {
  const entries: readonly CatalogEntry[] = catalogMetadata.map(toCatalogEntry);
  const byType = new Map<string, CatalogEntry>(entries.map((e) => [e.type, e]));
  return {
    entries,
    getEntry: (type) => byType.get(type),
  };
}

/** The scene catalog is a static projection of the boot-time scene registry. */
export const sceneBlockCatalog: BlockCatalog = createSceneBlockCatalog(
  buildSceneRegistry(ALL_SCENE_BLOCKS).catalog,
);
