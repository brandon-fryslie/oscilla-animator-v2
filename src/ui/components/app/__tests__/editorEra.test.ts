// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveEditorEra } from '../editorEra';
import type { BootSelection } from '../../../../testing/test-params';
import { v1BlockCatalog } from '../../../graphEditor/V1BlockCatalog';
import { sceneBlockCatalog } from '../../../graphEditor/SceneBlockCatalog';
import { v1LayoutPolicy, sceneLayoutPolicy } from '../../../dockview/layoutPolicies';
import type { EditorLayoutPolicy } from '../../../dockview/editorLayoutPolicy';

/**
 * The unified boot resolves ONE era value from the boot selection; App mounts
 * `era.Shell` and provides `era.blockCatalog` / `era.makeSelectionDetail`. These
 * tests pin that mapping and the per-era layout policy invariants — the behavior
 * that replaced the old `isNativeEditorSelection` chrome branch. [LAW:behavior-not-structure]
 */

describe('resolveEditorEra', () => {
  it('mounts the scene (pillar) era for the default native-editor boot', () => {
    const era = resolveEditorEra({ kind: 'native-editor' });
    expect(era.id).toBe('scene');
    expect(era.blockCatalog).toBe(sceneBlockCatalog);
  });

  it('mounts the V1 era for the explicit ?v1=true opt-in', () => {
    const era = resolveEditorEra({ kind: 'v1-legacy' });
    expect(era.id).toBe('v1');
    expect(era.blockCatalog).toBe(v1BlockCatalog);
  });

  it('keeps the V1 chrome for a fixed ScenePlan demo steel thread', () => {
    // A scene-plan-demo is a fixed steel thread whose editing chrome is the V1
    // editor; only the live native-editor surface moves to the pillar shell.
    const boot: BootSelection = { kind: 'scene-plan-demo', planId: 'grid-of-squares' };
    expect(resolveEditorEra(boot).id).toBe('v1');
  });
});

describe('editor layout policies', () => {
  const policies: readonly [string, EditorLayoutPolicy][] = [
    ['v1', v1LayoutPolicy],
    ['scene', sceneLayoutPolicy],
  ];

  it.each(policies)('%s policy registers a component for every panel it declares', (_name, policy) => {
    // [LAW:one-source-of-truth] A policy must never declare a panel it cannot
    //   render — every definition's component is a key in the component map.
    for (const def of policy.definitions) {
      expect(policy.components).toHaveProperty(def.component);
    }
  });

  it('gives each era its OWN persistence slot, because layouts name era-specific components', () => {
    // Restoring one era's serialized layout into the other would name components
    // that era never registers — so the slots must differ. [LAW:one-source-of-truth]
    expect(v1LayoutPolicy.storageKey).not.toBe(sceneLayoutPolicy.storageKey);

    const v1Components = new Set(Object.keys(v1LayoutPolicy.components));
    const sceneOnly = Object.keys(sceneLayoutPolicy.components).filter((c) => !v1Components.has(c));
    expect(sceneOnly.length).toBeGreaterThan(0);
  });
});
