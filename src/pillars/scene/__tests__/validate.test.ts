/**
 * Tests for ScenePlan-native patch validation (nt56.3). They exercise the four
 * acceptance shapes — match, mismatch, missing-input, adaptation-needed — plus
 * graceful handling of partial/unconnected graphs and a source-level guard that
 * the validation layer stays off the legacy block ABI and Rust boundary.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { buildSceneRegistry } from '../scene-block';
import { ALL_SCENE_BLOCKS } from '../blocks';
import { validateScenePatch, formatSceneDiagnostic } from '../validate';
import { makeGridOfSquaresPatch } from '../../fixtures/grid-of-squares';
import type {
  SceneBlockCategory,
  SceneBlockDefinition,
  SceneCatalogMetadata,
  ScenePortDeclaration,
  SceneRegistry,
  SceneValueKind,
} from '../scene-block';
import type { AdaptationRoute } from '../port-compatibility';
import type { PillarPatch } from '../../types';

const SCENE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

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

/**
 * A registry built from declared catalog metadata alone — the only surface the
 * validation layer reads. It lets a test pin a wire's verdict without authoring a
 * full block `contribute()` body.
 */
function metadataRegistry(catalogs: readonly SceneCatalogMetadata[]): SceneRegistry {
  const byType = new Map<string, SceneBlockDefinition<unknown>>(
    catalogs.map((c) => [c.type, { catalog: c } as unknown as SceneBlockDefinition<unknown>]),
  );
  return { get: (t) => byType.get(t), catalog: catalogs };
}

function wire(source: string, target: string, inputSlot: string): PillarPatch['edges'][number] {
  return { id: `${source}->${target}`, source, target, inputSlot, role: 'primary' };
}

describe('validateScenePatch — direct match', () => {
  const registry = buildSceneRegistry(ALL_SCENE_BLOCKS);

  it('accepts the authored Grid of Squares patch with no diagnostics', () => {
    const result = validateScenePatch(registry, makeGridOfSquaresPatch());
    expect(result.diagnostics).toEqual([]);
    expect(result.edges).toEqual([
      { edgeId: 'e0', compatibility: { kind: 'compatible' } },
      { edgeId: 'e1', compatibility: { kind: 'compatible' } },
    ]);
  });
});

describe('validateScenePatch — missing required input', () => {
  const registry = buildSceneRegistry(ALL_SCENE_BLOCKS);

  it('flags a draw whose primary instance input is unconnected', () => {
    const patch: PillarPatch = {
      blocks: [{ id: 'draw', kind: 'intent', type: 'DrawInstances', config: {} }],
      edges: [],
    };
    const result = validateScenePatch(registry, patch);
    const missing = result.diagnostics.filter((d) => d.kind === 'missingRequiredInput');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toEqual({
      kind: 'missingRequiredInput',
      address: { blockId: 'draw', blockType: 'DrawInstances', portId: 'primary', value: 'instanceBundle' },
    });
  });
});

describe('validateScenePatch — incompatible wire (mismatch)', () => {
  const registry = metadataRegistry([
    catalogOf('Scalar', [port('out', 'output', 'scalar')]),
    catalogOf('InstanceSink', [port('in', 'input', 'instanceBundle')], 'draw'),
  ]);

  it('reports a scalar output wired into an instanceBundle input', () => {
    const patch: PillarPatch = {
      blocks: [
        { id: 's', kind: 'generator', type: 'Scalar', config: {} },
        { id: 'k', kind: 'intent', type: 'InstanceSink', config: {} },
      ],
      edges: [wire('s', 'k', 'in')],
    };
    const result = validateScenePatch(registry, patch);
    expect(result.edges[0].compatibility.kind).toBe('mismatch');
    const incompatible = result.diagnostics.find((d) => d.kind === 'incompatiblePorts');
    expect(incompatible).toMatchObject({
      kind: 'incompatiblePorts',
      from: { value: 'scalar', blockId: 's' },
      to: { value: 'instanceBundle', blockId: 'k', portId: 'in' },
    });
  });
});

describe('validateScenePatch — adaptation needed', () => {
  const registry = metadataRegistry([
    catalogOf('Scalar', [port('out', 'output', 'scalar')]),
    catalogOf('ColorSink', [port('in', 'input', 'color')], 'color'),
  ]);
  const routes: readonly AdaptationRoute[] = [{ from: 'scalar', to: 'color', via: 'ScalarToColor' }];

  it('points a scalar→color wire at the explicit adapter block, not an implicit coercion', () => {
    const patch: PillarPatch = {
      blocks: [
        { id: 's', kind: 'generator', type: 'Scalar', config: {} },
        { id: 'c', kind: 'material', type: 'ColorSink', config: {} },
      ],
      edges: [wire('s', 'c', 'in')],
    };
    const result = validateScenePatch(registry, patch, routes);
    expect(result.edges[0].compatibility).toEqual({
      kind: 'adaptationNeeded',
      from: 'scalar',
      to: 'color',
      via: 'ScalarToColor',
    });
    const adapt = result.diagnostics.find((d) => d.kind === 'adaptationRequired');
    expect(adapt).toMatchObject({ kind: 'adaptationRequired', via: 'ScalarToColor' });
    expect(formatSceneDiagnostic(adapt!)).toContain('ScalarToColor');
  });
});

describe('validateScenePatch — unsupported (deferred) capability', () => {
  const registry = metadataRegistry([
    catalogOf('MaskGen', [port('out', 'output', 'mask')]),
    catalogOf('MaskSink', [port('in', 'input', 'mask')], 'draw'),
  ]);

  it('reports a mask wire as unsupported — mask has no ScenePlan realization yet', () => {
    const patch: PillarPatch = {
      blocks: [
        { id: 'm', kind: 'generator', type: 'MaskGen', config: {} },
        { id: 'k', kind: 'intent', type: 'MaskSink', config: {} },
      ],
      edges: [wire('m', 'k', 'in')],
    };
    const result = validateScenePatch(registry, patch);
    const unsupported = result.diagnostics.find((d) => d.kind === 'unsupportedCapability');
    expect(unsupported).toMatchObject({ kind: 'unsupportedCapability', value: 'mask' });
  });
});

describe('validateScenePatch — partial graphs never throw', () => {
  const registry = buildSceneRegistry(ALL_SCENE_BLOCKS);

  it('reports an unknown block type without throwing', () => {
    const patch: PillarPatch = {
      blocks: [{ id: 'x', kind: 'generator', type: 'NotABlock', config: {} }],
      edges: [],
    };
    expect(() => validateScenePatch(registry, patch)).not.toThrow();
    const result = validateScenePatch(registry, patch);
    expect(result.diagnostics).toContainEqual({
      kind: 'unknownBlock',
      blockId: 'x',
      blockType: 'NotABlock',
    });
  });

  it('reports a dangling edge to a missing block as unresolved, not a crash', () => {
    const patch: PillarPatch = { blocks: [], edges: [wire('a', 'b', 'primary')] };
    const result = validateScenePatch(registry, patch);
    expect(result.edges[0].compatibility).toEqual({ kind: 'unresolved' });
    expect(result.diagnostics.some((d) => d.kind === 'danglingEdge' && d.endpoint === 'source')).toBe(true);
    expect(result.diagnostics.some((d) => d.kind === 'danglingEdge' && d.endpoint === 'target')).toBe(true);
  });

  it('formats every diagnostic kind to a non-empty message', () => {
    const patch: PillarPatch = {
      blocks: [{ id: 'x', kind: 'generator', type: 'NotABlock', config: {} }],
      edges: [wire('a', 'b', 'primary')],
    };
    const result = validateScenePatch(registry, patch);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    for (const d of result.diagnostics) {
      expect(formatSceneDiagnostic(d).length).toBeGreaterThan(0);
    }
  });
});

describe('validateScenePatch — source-level backend neutrality', () => {
  it('the validation layer imports neither the legacy block ABI nor the Rust boundary', () => {
    const files = ['port-compatibility.ts', 'validate.ts', 'insertability.ts'];
    for (const file of files) {
      const src = readFileSync(join(SCENE_DIR, file), 'utf8');
      expect(src).not.toMatch(/from ['"][^'"]*block-api/);
      expect(src).not.toMatch(/from ['"][^'"]*boundary-contract/);
      expect(src).not.toMatch(/from ['"]three/);
    }
  });
});
