/**
 * Unit tests for the port-compatibility algebra (nt56.3). These pin the verdict
 * for each shape of wire purely from the value-kind vocabulary and the route
 * table — no registry, patch, or ScenePlan involved.
 */

import { describe, it, expect } from 'vitest';

import {
  compareScenePorts,
  SCENE_VALUE_REALIZATION,
  NATIVE_ADAPTATION_ROUTES,
  type AdaptationRoute,
} from '../port-compatibility';
import type { SceneValueKind } from '../scene-block';

describe('compareScenePorts', () => {
  it('like-for-like realized kinds are directly compatible', () => {
    expect(compareScenePorts('instanceBundle', 'instanceBundle')).toEqual({ kind: 'compatible' });
    expect(compareScenePorts('scalar', 'scalar')).toEqual({ kind: 'compatible' });
  });

  it('unlike realized kinds with no route are a hard mismatch', () => {
    expect(compareScenePorts('instanceBundle', 'scalar')).toEqual({
      kind: 'mismatch',
      from: 'instanceBundle',
      to: 'scalar',
    });
  });

  it('unlike kinds with a declared route need adaptation, naming the adapter', () => {
    const routes: readonly AdaptationRoute[] = [
      { from: 'scalar', to: 'color', via: 'ScalarToColor' },
    ];
    expect(compareScenePorts('scalar', 'color', routes)).toEqual({
      kind: 'adaptationNeeded',
      from: 'scalar',
      to: 'color',
      via: 'ScalarToColor',
    });
  });

  it('a route is directional — it does not bridge the reverse wire', () => {
    const routes: readonly AdaptationRoute[] = [
      { from: 'scalar', to: 'color', via: 'ScalarToColor' },
    ];
    expect(compareScenePorts('color', 'scalar', routes).kind).toBe('mismatch');
  });

  it('a deferred kind (mask) on either side is unsupported, kind match notwithstanding', () => {
    expect(compareScenePorts('mask', 'mask')).toEqual({ kind: 'unsupported', value: 'mask' });
    expect(compareScenePorts('scalar', 'mask')).toEqual({ kind: 'unsupported', value: 'mask' });
    expect(compareScenePorts('mask', 'scalar')).toEqual({ kind: 'unsupported', value: 'mask' });
  });

  it('classifies every value kind as realized or deferred (matrix §2 is total)', () => {
    const kinds: readonly SceneValueKind[] = [
      'instanceBundle',
      'geometry',
      'materialShell',
      'texture',
      'camera',
      'color',
      'scalar',
      'mask',
    ];
    for (const k of kinds) {
      expect(SCENE_VALUE_REALIZATION[k]).toMatch(/^(realized|deferred)$/);
    }
    // mask is the only deferred kind per the capability matrix.
    const deferred = kinds.filter((k) => SCENE_VALUE_REALIZATION[k] === 'deferred');
    expect(deferred).toEqual(['mask']);
  });

  it('ships no speculative native adaptation routes', () => {
    expect(NATIVE_ADAPTATION_ROUTES).toEqual([]);
  });
});
