export type BootState = 'initial' | 'fetching' | 'compiling' | 'ready' | 'error';

export interface BootSnapshot {
  readonly state: BootState;
  readonly error: string | null;
}

type BootListener = (snapshot: BootSnapshot) => void;

/**
 * [LAW:single-enforcer] BootService owns the app-level boot gate state
 * machine so UI gating does not diverge across callsites.
 *
 * With naga-shim removed (WGSL generation now happens in Rust renderer),
 * boot is trivially immediate. The state machine shape is preserved so
 * BootGateScreen and other consumers don't need changes.
 */
export class BootService {
  private snapshot: BootSnapshot = {
    state: 'initial',
    error: null,
  };

  private startPromise: Promise<BootSnapshot> | null = null;
  private readonly listeners = new Set<BootListener>();

  getSnapshot(): BootSnapshot {
    return this.snapshot;
  }

  subscribe(listener: BootListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(): Promise<BootSnapshot> {
    if (this.snapshot.state === 'ready' || this.snapshot.state === 'error') {
      return this.snapshot;
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.runStart();
    const finalSnapshot = await this.startPromise;
    this.startPromise = null;
    return finalSnapshot;
  }

  private async runStart(): Promise<BootSnapshot> {
    // No WASM boot required — Naga shim removed, WGSL generation is Rust-side.
    this.setSnapshot({ state: 'ready', error: null });
    return this.snapshot;
  }

  private setSnapshot(next: BootSnapshot): void {
    if (this.snapshot.state === next.state && this.snapshot.error === next.error) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
