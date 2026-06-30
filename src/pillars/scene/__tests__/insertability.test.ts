/**
 * Tests for the palette insertability query (nt56.3): "given the port I selected,
 * which blocks can connect here?" — answered from declared catalog ports, never a
 * compile.
 */

import { describe, it, expect } from 'vitest';

import { buildSceneRegistry } from '../scene-block';
import { ALL_SCENE_BLOCKS } from '../blocks';
import { connectableScenePorts } from '../insertability';
import type {
  SceneBlockCategory,
  SceneBlockDefinition,
  SceneCatalogMetadata,
  ScenePortDeclaration,
  SceneRegistry,
  SceneValueKind,
} from '../scene-block';

function port(
  id: string,
  direction: 'input' | 'output',
  value: SceneValueKind,
): ScenePortDeclaration {
  return { id, label: id, direction, value };
}

function catalogOf(
  type: string,
  ports: readonly ScenePortDeclaration[],
  category: SceneBlockCategory = 'instance',
): SceneCatalogMetadata {
  return { type, displayName: type, category, ports, configFields: [] };
}

function metadataRegistry(catalogs: readonly SceneCatalogMetadata[]): SceneRegistry {
  const byType = new Map<string, SceneBlockDefinition<unknown>>(
    catalogs.map((c) => [c.type, { catalog: c } as unknown as SceneBlockDefinition<unknown>]),
  );
  return { get: (t) => byType.get(t), catalog: catalogs };
}

describe('connectableScenePorts — over the native block set', () => {
  const registry = buildSceneRegistry(ALL_SCENE_BLOCKS);

  it('a selected instanceBundle output offers the draw primary input', () => {
    const matches = connectableScenePorts(registry, { value: 'instanceBundle', direction: 'output' });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      blockType: 'DrawInstances',
      displayName: 'Draw Instances',
      port: { id: 'primary', direction: 'input', value: 'instanceBundle' },
      compatibility: { kind: 'compatible' },
    });
  });

  it('a selected instanceBundle input offers the grid instances output', () => {
    const matches = connectableScenePorts(registry, { value: 'instanceBundle', direction: 'input' });
    expect(matches.map((m) => m.blockType)).toEqual(['InstanceGrid']);
    expect(matches[0].port).toMatchObject({ id: 'instances', direction: 'output' });
  });

  it('offers nothing for a value no port consumes (materialShell input)', () => {
    expect(connectableScenePorts(registry, { value: 'materialShell', direction: 'output' })).toEqual([]);
  });

  it('excludes a hard mismatch — a scalar output finds no instanceBundle input', () => {
    expect(connectableScenePorts(registry, { value: 'scalar', direction: 'output' })).toEqual([]);
  });
});

describe('connectableScenePorts — adaptation and deferred kinds', () => {
  it('offers an adapter-bridged candidate when a route declares one', () => {
    const registry = metadataRegistry([catalogOf('ColorSink', [port('in', 'input', 'color')], 'color')]);
    const matches = connectableScenePorts(
      registry,
      { value: 'scalar', direction: 'output' },
      [{ from: 'scalar', to: 'color', via: 'ScalarToColor' }],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].compatibility).toMatchObject({ kind: 'adaptationNeeded', via: 'ScalarToColor' });
  });

  it('never offers a deferred (mask) port — it has no lowering target', () => {
    const registry = metadataRegistry([catalogOf('MaskSink', [port('in', 'input', 'mask')], 'draw')]);
    expect(connectableScenePorts(registry, { value: 'mask', direction: 'output' })).toEqual([]);
  });
});
