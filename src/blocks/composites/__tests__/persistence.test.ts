import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositeStorage } from '../persistence';

function installLocalStorageMock(mock: unknown): void {
  const browserWindow = (globalThis as { window?: unknown }).window as
    | { localStorage?: unknown }
    | undefined;
  const domWindow = (globalThis as { document?: { defaultView?: unknown } }).document
    ?.defaultView as
    | { localStorage?: unknown }
    | undefined;
  if (domWindow) {
    Object.defineProperty(domWindow, 'localStorage', {
      configurable: true,
      value: mock,
    });
  }
  if (browserWindow) {
    Object.defineProperty(browserWindow, 'localStorage', {
      configurable: true,
      value: mock,
    });
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: mock,
  });
}

describe('CompositeStorage', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalWindowLocalStorage = Object.getOwnPropertyDescriptor(
    (globalThis as { window?: unknown }).window ?? {},
    'localStorage'
  );
  const originalDomWindowLocalStorage = Object.getOwnPropertyDescriptor(
    (globalThis as { document?: { defaultView?: unknown } }).document?.defaultView ?? {},
    'localStorage'
  );

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    const browserWindow = (globalThis as { window?: unknown }).window as
      | { localStorage?: unknown }
      | undefined;
    const domWindow = (globalThis as { document?: { defaultView?: unknown } }).document
      ?.defaultView as
      | { localStorage?: unknown }
      | undefined;
    if (domWindow && originalDomWindowLocalStorage) {
      Object.defineProperty(domWindow, 'localStorage', originalDomWindowLocalStorage);
    }
    if (browserWindow && originalWindowLocalStorage) {
      Object.defineProperty(browserWindow, 'localStorage', originalWindowLocalStorage);
    }
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('records a warning when storage payload is malformed JSON', () => {
    installLocalStorageMock({
      getItem: vi.fn(() => '{bad-json'),
      setItem: vi.fn(),
    });
    const storage = new CompositeStorage();

    const loaded = storage.load();

    expect(loaded.size).toBe(0);
    expect(storage.getIssues()).toHaveLength(1);
    expect(storage.getIssues()[0]).toMatchObject({
      level: 'warn',
      message: 'Failed to load user composites from localStorage',
    });
  });

  it('reports save failures via issue reporter', () => {
    const reporter = vi.fn();
    installLocalStorageMock({
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('setItem fail');
      }),
    });
    const storage = new CompositeStorage();
    storage.setIssueReporter(reporter);

    const ok = storage.save(new Map());

    expect(ok).toBe(false);
    expect(storage.getIssues()).toHaveLength(1);
    expect(storage.getIssues()[0]).toMatchObject({
      level: 'error',
      message: 'Failed to save composites to localStorage',
    });
    expect(reporter).toHaveBeenCalledTimes(1);
  });
});
