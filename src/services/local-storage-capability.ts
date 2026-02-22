/**
 * Browser localStorage capability resolver.
 *
 * Returns a minimal get/set interface when browser storage is available.
 * Returns null in non-browser runtimes or restricted contexts.
 */

export interface LocalStorageCapability {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?: (key: string) => void;
  clear?: () => void;
}

/**
 * Resolve localStorage capability without touching Node's global localStorage getter.
 * // [LAW:single-enforcer] localStorage capability detection is centralized here.
 */
export function resolveLocalStorageCapability(): LocalStorageCapability | null {
  try {
    const runtime = (globalThis as { process?: { versions?: { node?: string } } }).process;
    const isNodeRuntime = typeof runtime?.versions?.node === 'string';

    // In Node, reading global localStorage can trigger internal warnings unless a test
    // explicitly installed a value descriptor. Probe descriptors first and never invoke
    // accessor getters.
    const nodeSources = [
      globalThis,
      (globalThis as { window?: unknown }).window,
      (globalThis as { document?: { defaultView?: unknown } }).document?.defaultView,
    ];
    let candidate: Partial<Storage> | undefined;
    if (isNodeRuntime) {
      for (const source of nodeSources) {
        if (!source || (typeof source !== 'object' && typeof source !== 'function')) {
          continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(source, 'localStorage');
        if (!descriptor || !('value' in descriptor)) {
          continue;
        }
        candidate = descriptor.value as Partial<Storage> | undefined;
        break;
      }
    } else {
      const domWindow = (globalThis as { document?: { defaultView?: unknown } }).document
        ?.defaultView as
        | { localStorage?: unknown }
        | undefined;
      if (!domWindow) {
        return null;
      }
      candidate = domWindow.localStorage as Partial<Storage> | undefined;
    }

    if (!candidate) {
      return null;
    }
    if (typeof candidate.getItem !== 'function') {
      return null;
    }
    if (typeof candidate.setItem !== 'function') {
      return null;
    }

    const capability: LocalStorageCapability = {
      getItem: candidate.getItem.bind(candidate),
      setItem: candidate.setItem.bind(candidate),
    };
    if (typeof candidate.removeItem === 'function') {
      capability.removeItem = candidate.removeItem.bind(candidate);
    }
    if (typeof candidate.clear === 'function') {
      capability.clear = candidate.clear.bind(candidate);
    }
    return capability;
  } catch {
    return null;
  }
}
