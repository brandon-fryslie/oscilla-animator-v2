/**
 * Tests for the pure scene-authoring policy helpers.
 *
 * [LAW:behavior-not-structure] Assert the authored shapes the editor mints —
 *   kind from role, edge role from port, schema-valid default config.
 */

import { describe, it, expect } from 'vitest';

import {
  ALL_SCENE_BLOCKS,
  buildSceneRegistry,
  defaultSceneConfig,
  edgeRoleForPort,
  pillarKindForRole,
} from '../index';

const registry = buildSceneRegistry(ALL_SCENE_BLOCKS);

describe('pillarKindForRole', () => {
  it('maps an instance source to a generator, a modifier to a modifier, and a draw to an intent', () => {
    expect(pillarKindForRole('instanceSource')).toBe('generator');
    expect(pillarKindForRole('modifier')).toBe('modifier');
    expect(pillarKindForRole('draw')).toBe('intent');
  });
});

describe('edgeRoleForPort', () => {
  it("mints a 'primary' edge for the primary instance slot", () => {
    const drawPorts = registry.get('DrawInstances')!.catalog.ports;
    const primary = drawPorts.find((p) => p.id === 'primary')!;
    expect(edgeRoleForPort(primary)).toBe('primary');
  });
});

describe('defaultSceneConfig', () => {
  it('produces a schema-valid config for every catalog block', () => {
    for (const meta of registry.catalog) {
      const def = registry.get(meta.type)!;
      const config = defaultSceneConfig(meta);
      // The block's own schema must accept its default config.
      expect(def.configSchema.safeParse(config).success).toBe(true);
    }
  });

  it('omits optional asset fields rather than inventing an identity', () => {
    const draw = registry.get('DrawInstances')!.catalog;
    const config = defaultSceneConfig(draw);
    expect('textureAssetId' in config).toBe(false);
  });
});
