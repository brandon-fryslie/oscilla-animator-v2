import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsStore } from '../DiagnosticsStore';

describe('DiagnosticsStore console mirroring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mirrors error log entries to console.error', () => {
    const store = new DiagnosticsStore();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    store.log({
      level: 'error',
      message: 'GPU fatal: [scheduler_lost] Rust scheduler entered Lost state',
      data: { source: 'worker', recoverable: false },
    });

    // [LAW:single-enforcer] DiagnosticsStore is the one boundary that mirrors
    // error-level diagnostics to the browser console.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Diagnostics] GPU fatal: [scheduler_lost] Rust scheduler entered Lost state',
      { data: { source: 'worker', recoverable: false }, details: undefined },
    );
  });

  it('does not mirror non-error entries to console.error', () => {
    const store = new DiagnosticsStore();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    store.log({
      level: 'warn',
      message: 'Render health warning',
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
