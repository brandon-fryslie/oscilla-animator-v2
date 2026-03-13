import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCrossOriginIsolationForSharedArrayBuffer } from '../cross-origin-isolation';

describe('ensureCrossOriginIsolationForSharedArrayBuffer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('returns immediately when the page is already cross-origin isolated', async () => {
    const register = vi.fn();
    Object.defineProperty(window, 'crossOriginIsolated', { configurable: true, value: true });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, controller: {} },
    });

    const shouldBootApp = await ensureCrossOriginIsolationForSharedArrayBuffer();

    expect(shouldBootApp).toBe(true);
    expect(window.sessionStorage.getItem('oscilla.coi.reload.pending')).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it('registers COI service worker and requests one reload when controller is missing', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'crossOriginIsolated', { configurable: true, value: false });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, controller: null },
    });

    const shouldBootApp = await ensureCrossOriginIsolationForSharedArrayBuffer({ reload: reloadSpy });

    expect(shouldBootApp).toBe(false);
    expect(register).toHaveBeenCalledWith('/coi-serviceworker.js', { scope: '/' });
    expect(window.sessionStorage.getItem('oscilla.coi.reload.pending')).toBe('1');
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('clears pending reload marker once service worker control is active', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'crossOriginIsolated', { configurable: true, value: false });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, controller: {} },
    });
    window.sessionStorage.setItem('oscilla.coi.reload.pending', '1');

    const shouldBootApp = await ensureCrossOriginIsolationForSharedArrayBuffer();

    expect(shouldBootApp).toBe(true);
    expect(window.sessionStorage.getItem('oscilla.coi.reload.pending')).toBeNull();
  });

  it('prevents repeated reload loops when marker is already set without controller', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'crossOriginIsolated', { configurable: true, value: false });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, controller: null },
    });
    window.sessionStorage.setItem('oscilla.coi.reload.pending', '1');

    const shouldBootApp = await ensureCrossOriginIsolationForSharedArrayBuffer({ reload: reloadSpy });

    expect(shouldBootApp).toBe(true);
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
