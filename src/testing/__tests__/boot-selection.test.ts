import { afterEach, describe, expect, it } from 'vitest';
import { resolveBootSelection, validateV1OptIn } from '../test-params';

/**
 * The resolver is the single authority for boot-path selection. These tests pin
 * the policy: the Three native editor is the default, V1 is an explicit opt-in,
 * and fixed ScenePlan demos remain reachable. [LAW:behavior-not-structure]
 */

const originalLocation = window.location;

function setSearch(search: string): void {
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, search },
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
});

describe('resolveBootSelection', () => {
  it('defaults to the native editor when no relevant param is present', () => {
    setSearch('');
    expect(resolveBootSelection()).toEqual({ kind: 'native-editor' });
  });

  it('keeps the native editor default when unrelated params are present', () => {
    setSearch('?showPreview=true&runtimeConsole=1');
    expect(resolveBootSelection()).toEqual({ kind: 'native-editor' });
  });

  it('selects V1 when ?v1=true', () => {
    setSearch('?v1=true');
    expect(resolveBootSelection()).toEqual({ kind: 'v1-legacy' });
  });

  it('selects V1 when ?v1=1', () => {
    setSearch('?v1=1');
    expect(resolveBootSelection()).toEqual({ kind: 'v1-legacy' });
  });

  it('does NOT select V1 for ?v1=false (default native editor)', () => {
    setSearch('?v1=false');
    expect(resolveBootSelection()).toEqual({ kind: 'native-editor' });
  });

  it('selects the native editor for the explicit reserved id ?scenePlan=editor', () => {
    setSearch('?scenePlan=editor');
    expect(resolveBootSelection()).toEqual({ kind: 'native-editor' });
  });

  it('selects a fixed demo steel thread for any other ?scenePlan=<id>', () => {
    setSearch('?scenePlan=grid-of-squares');
    expect(resolveBootSelection()).toEqual({
      kind: 'scene-plan-demo',
      planId: 'grid-of-squares',
    });
  });

  it('lets ?v1=true win over a ?scenePlan= demo (explicit legacy opt-in)', () => {
    setSearch('?v1=true&scenePlan=grid-of-squares');
    expect(resolveBootSelection()).toEqual({ kind: 'v1-legacy' });
  });
});

describe('validateV1OptIn', () => {
  it('accepts valid boolean spellings and absence', () => {
    for (const search of ['', '?v1=true', '?v1=false', '?v1=1', '?v1=0']) {
      setSearch(search);
      expect(() => validateV1OptIn()).not.toThrow();
    }
  });

  it('throws on an invalid ?v1= value', () => {
    setSearch('?v1=yes');
    expect(() => validateV1OptIn()).toThrow(/Invalid v1 value/);
  });
});
