import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../SettingsStore';
import type { SettingsToken } from '../../settings/types';

type TestSettings = {
  enabled: boolean;
  threshold: number;
};

const TEST_TOKEN: SettingsToken<TestSettings> = {
  namespace: 'settings-store-test',
  defaults: { enabled: true, threshold: 0.5 },
  ui: {
    label: 'Test',
    order: 0,
    fields: {
      enabled: { label: 'Enabled', control: 'toggle' },
      threshold: { label: 'Threshold', control: 'slider', min: 0, max: 1, step: 0.1 },
    },
  },
  __brand: 'SettingsToken',
};

function installLocalStorageMock(mock: unknown): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: mock,
  });
}

describe('SettingsStore', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
      return;
    }
    // localStorage may not exist in some runtimes.
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('uses defaults without warnings when localStorage is unavailable', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { localStorage?: unknown }).localStorage;

    const store = new SettingsStore();
    store.register(TEST_TOKEN);
    expect(store.get(TEST_TOKEN)).toEqual(TEST_TOKEN.defaults);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('treats malformed localStorage object as unavailable', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installLocalStorageMock({ getItem: 'nope', setItem: 123 });

    const store = new SettingsStore();
    store.register(TEST_TOKEN);
    store.update(TEST_TOKEN, { threshold: 0.9 });

    expect(store.get(TEST_TOKEN).threshold).toBe(0.9);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('loads persisted values and persists updates via storage API', () => {
    vi.useFakeTimers();
    const setItem = vi.fn();
    installLocalStorageMock({
      getItem: vi.fn(() => JSON.stringify({ threshold: 0.75 })),
      setItem,
    });

    const store = new SettingsStore();
    store.register(TEST_TOKEN);
    expect(store.get(TEST_TOKEN)).toEqual({ enabled: true, threshold: 0.75 });

    store.update(TEST_TOKEN, { threshold: 0.25 });
    vi.advanceTimersByTime(500);

    expect(setItem).toHaveBeenCalledTimes(1);
    const persisted = setItem.mock.calls[0]?.[1];
    expect(typeof persisted).toBe('string');
    expect(JSON.parse(String(persisted))).toEqual({ enabled: true, threshold: 0.25 });
    store.dispose();
  });

  it('falls back to defaults when persisted JSON is invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installLocalStorageMock({
      getItem: vi.fn(() => '{invalid-json'),
      setItem: vi.fn(),
    });

    const store = new SettingsStore();
    store.register(TEST_TOKEN);

    expect(store.get(TEST_TOKEN)).toEqual(TEST_TOKEN.defaults);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
