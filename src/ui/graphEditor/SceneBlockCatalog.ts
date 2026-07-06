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

/**
 * Build the scene catalog from a thunk that yields the scene registry's catalog
 * metadata. The projection is built lazily on first access and cached once:
 * unlike the V1 registry, the scene block set (`ALL_SCENE_BLOCKS`) is a static
 * module constant with no runtime registration, so a single snapshot is always
 * complete — the caching strategy matches the registry's (im)mutability.
 *
 * Deferring the build also decouples the boots: `App.tsx` imports this singleton
 * for the native path, but the scene registry is only constructed when that path
 * first reads the catalog, so a scene-registry build error can never take down
 * the V1 editor. [LAW:no-ambient-temporal-coupling]
 */
export function createSceneBlockCatalog(
  loadCatalog: () => readonly SceneCatalogMetadata[],
): BlockCatalog {
  let cache: { entries: readonly CatalogEntry[]; byType: Map<string, CatalogEntry> } | null = null;

  const build = (): { entries: readonly CatalogEntry[]; byType: Map<string, CatalogEntry> } => {
    if (cache === null) {
      const entries: readonly CatalogEntry[] = loadCatalog().map(toCatalogEntry);
      cache = { entries, byType: new Map(entries.map((e) => [e.type, e])) };
    }
    return cache;
  };

  return {
    get entries() {
      return build().entries;
    },
    getEntry: (type) => build().byType.get(type),
  };
}

/** The scene catalog, built lazily from the static scene registry. */
export const sceneBlockCatalog: BlockCatalog = createSceneBlockCatalog(
  () => buildSceneRegistry(ALL_SCENE_BLOCKS).catalog,
);
