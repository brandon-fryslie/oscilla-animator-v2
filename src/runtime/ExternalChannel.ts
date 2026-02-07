/**
 * External Channel System - Generic Input Infrastructure
 *
 * Spec Reference: design-docs/external-input/02-External-Input-Spec.md
 *
 * Three-part design:
 * 1. ExternalWriteBus - Write-side API for external threads
 * 2. ExternalChannelSnapshot - Read-side API for runtime (immutable)
 * 3. ExternalChannelSystem - Owns staging + committed + writeBus
 *
 * Channel Semantics:
 * - 'value': sample-and-hold, last write wins, persists across frames
 * - 'pulse': 1 for one frame if event occurred, clears to 0 next frame
 * - 'accum': sums deltas since last commit, clears to 0 next frame
 */

/**
 * Write record - operation queued to the write bus
 */
type WriteRecord =
  | { op: 'set'; name: string; v: number }
  | { op: 'pulse'; name: string }
  | { op: 'add'; name: string; dv: number };

/**
 * ExternalWriteBus - Write-side API
 *
 * Thread-safe queue for external writes from UI/audio/MIDI threads.
 * Writers call set/pulse/add, runtime drains queue once per frame.
 */
export class ExternalWriteBus {
  private queue: WriteRecord[] = [];

  /**
   * Set a 'value' channel (sample-and-hold, persists until overwritten)
   */
  set(name: string, v: number): void {
    this.queue.push({ op: 'set', name, v });
  }

  /**
   * Pulse a 'pulse' channel (reads 1 for one frame, then 0)
   */
  pulse(name: string): void {
    this.queue.push({ op: 'pulse', name });
  }

  /**
   * Add to an 'accum' channel (sums deltas, clears to 0 next frame)
   */
  add(name: string, dv: number): void {
    this.queue.push({ op: 'add', name, dv });
  }

  /** Double-buffer for drain: swap instead of allocating */
  private swapQueue: WriteRecord[] = [];

  /**
   * Drain all pending writes (called by runtime at frame start)
   * Returns all records and clears the queue.
   * Uses double-buffer swap to avoid per-frame allocation.
   */
  drain(): WriteRecord[] {
    const records = this.queue;
    this.queue = this.swapQueue;
    this.queue.length = 0;
    this.swapQueue = records;
    return records;
  }
}

/**
 * ExternalChannelSnapshot - Read-side API
 *
 * Immutable snapshot of channel values for one frame.
 * All runtime reads go through this interface.
 * The backing Map is owned by ExternalChannelSystem and reused via double-buffer.
 */
export class ExternalChannelSnapshot {
  constructor(private readonly values: ReadonlyMap<string, number>) {
    Object.freeze(this);
  }

  /**
   * Get float channel value (returns 0 if unknown)
   */
  getFloat(name: string): number {
    return this.values.get(name) ?? 0;
  }

  /**
   * Get vec2 channel value (returns {0,0} if unknown)
   * Convention: reads 'name.x' and 'name.y' channels
   */
  getVec2(name: string): { x: number; y: number } {
    return {
      x: this.values.get(`${name}.x`) ?? 0,
      y: this.values.get(`${name}.y`) ?? 0,
    };
  }
}

/**
 * ExternalChannelSystem - Owns the full channel lifecycle
 *
 * Single source of truth for external input state.
 * Manages write bus, staging, and committed snapshot.
 */
export class ExternalChannelSystem {
  readonly writeBus = new ExternalWriteBus();
  private staging = new Map<string, number>();
  /** Double-buffered committed Maps — swap each frame to avoid new Map() per frame */
  private committedA = new Map<string, number>();
  private committedB = new Map<string, number>();
  private useA = true;
  private _snapshot = new ExternalChannelSnapshot(this.committedA);

  /**
   * Current committed snapshot (immutable for entire frame)
   */
  get snapshot(): ExternalChannelSnapshot {
    return this._snapshot;
  }

  /**
   * Commit pending writes and produce new snapshot
   *
   * Called exactly once per frame at frame start.
   *
   * Lifecycle:
   * 1. Drain write bus to get pending writes
   * 2. Clear pulse/accum channels from previous frame
   * 3. Apply write records (fold by channel kind)
   * 4. Swap snapshot (makes staging immutable for this frame)
   */
  commit(): void {
    const records = this.writeBus.drain();

    // Clear pulse/accum channels from previous frame
    // (tracked via naming convention for Phase 1)
    for (const [name] of this.staging) {
      if (this.isPulse(name) || this.isAccum(name)) {
        this.staging.set(name, 0);
      }
    }

    // Apply write records
    for (const record of records) {
      switch (record.op) {
        case 'set':
          this.staging.set(record.name, record.v);
          break;
        case 'pulse':
          this.staging.set(record.name, 1);
          break;
        case 'add':
          this.staging.set(record.name, (this.staging.get(record.name) ?? 0) + record.dv);
          break;
      }
    }

    // Double-buffer swap: fill the inactive map, create snapshot pointing to it.
    // The previous snapshot still holds a reference to the other map (immutable from its perspective).
    // Only the ExternalChannelSnapshot object is allocated per frame (16 bytes); Maps are reused.
    const target = this.useA ? this.committedA : this.committedB;
    target.clear();
    for (const [k, v] of this.staging) {
      target.set(k, v);
    }
    this._snapshot = new ExternalChannelSnapshot(target);
    this.useA = !this.useA;
  }

  /**
   * Channel kind detection - Phase 1 uses naming convention
   *
   * TODO: Phase 2 will use ChannelDefResolver for explicit registration
   */
  private isPulse(name: string): boolean {
    // Convention: .down, .up, .pressed, .released
    return name.includes('.down') || name.includes('.up') || name.includes('.pressed') || name.includes('.released');
  }

  private isAccum(name: string): boolean {
    // Convention: .wheel, .delta, .d
    return name.includes('.wheel.') || name.includes('.delta') || name.endsWith('.d');
  }
}
