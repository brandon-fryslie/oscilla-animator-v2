/**
 * DoubleBufferedChannelMap - External Input Channel Map
 *
 * Provides a double-buffered map for external input values (mouse, MIDI, etc.).
 * Values are staged on the write side, then atomically committed for read.
 *
 * Design: Option D with commit step (from external-input-system planning)
 * - stage() writes to staging buffer
 * - commit() atomically copies staging → committed
 * - get() reads from committed buffer only
 * - Unknown channels return 0 (safe default)
 *
 * This pattern ensures consistent input values throughout a frame:
 * 1. main.ts stages input events as they occur
 * 2. executeFrame() calls commit() at frame start
 * 3. Signal evaluation reads consistent committed values
 */

export class DoubleBufferedChannelMap {
  /** Staging buffer (write side - updated during event handling) */
  private staging: Map<string, number> = new Map();

  /** Committed buffer (read side - consistent during frame execution) */
  private committed: Map<string, number> = new Map();

  /**
   * Stage a value for a channel (write side).
   * Value will not be visible to readers until commit() is called.
   *
   * @param name - Channel name (e.g., 'mouse.x', 'midi.cc.1')
   * @param value - Numeric value to stage
   */
  stage(name: string, value: number): void {
    this.staging.set(name, value);
  }

  /**
   * Atomically commit staged values to the read buffer.
   * Called once per frame at the start of executeFrame().
   *
   * Implementation: Copy staging → committed (not pointer swap).
   * This ensures the staging buffer remains stable for continued writes.
   */
  commit(): void {
    // Clear committed and copy all staged values
    this.committed.clear();
    for (const [name, value] of this.staging) {
      this.committed.set(name, value);
    }
  }

  /**
   * Read a channel value (read side).
   * Returns the committed value, or 0 if channel has not been set.
   *
   * @param name - Channel name
   * @returns Current committed value, or 0 for unknown channels
   */
  get(name: string): number {
    return this.committed.get(name) ?? 0;
  }

  /**
   * Get all committed channel names (for debugging/inspection).
   */
  keys(): IterableIterator<string> {
    return this.committed.keys();
  }

  /**
   * Get number of committed channels (for debugging/inspection).
   */
  get size(): number {
    return this.committed.size;
  }
}
