/**
 * FieldStatsAccumulator - Per-slot accumulated stats and temporal history.
 *
 * Pure data class, no UI dependencies. Owns:
 * - allTimeMin/allTimeMax: only expand, reset on recompile
 * - emaMean: EMA with ~30s half-life at 60fps
 * - Ring buffer of FieldFrameSnapshot (capacity 256, ~4.3s at 60fps)
 * - Percentile computation (p25, p75) via pre-allocated sort buffer
 */

import type { HistoryView, BufferHistoryView, Stride } from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Per-frame snapshot of field statistics for one component.
 * All arrays are length `stride` — only first `stride` entries are meaningful.
 */
export interface FieldFrameSnapshot {
  readonly min: Float32Array;
  readonly p25: Float32Array;
  readonly mean: Float32Array;
  readonly p75: Float32Array;
  readonly max: Float32Array;
  readonly count: number;
}

/**
 * Read-only view of the temporal history ring buffer.
 */
export interface FieldHistoryView {
  readonly snapshots: readonly FieldFrameSnapshot[];
  readonly writeIndex: number;
  readonly capacity: number;
  readonly stride: Stride;
  readonly filled: boolean;
}

/**
 * Accumulated aggregate stats (stable min/max, EMA mean).
 */
export interface AggregateFieldStats {
  readonly count: number;
  readonly stride: Stride;
  readonly min: Float32Array;
  readonly max: Float32Array;
  readonly mean: Float32Array;
}

// =============================================================================
// Constants
// =============================================================================

/** Ring buffer capacity: 256 frames (~4.3s at 60fps). */
const HISTORY_CAPACITY = 256;

/** Instance-0 sparkline ring buffer capacity: 128 frames (~2.1s at 60fps). */
const INSTANCE_HISTORY_CAPACITY = 128;

/** Buffer history capacity: 64 frames (~1.1s at 60fps). */
const BUFFER_HISTORY_CAPACITY = 64;

/** Max instance rows stored per frame in the buffer history. */
const BUFFER_HISTORY_MAX_ROWS = 128;

/** EMA alpha: `1 - 0.5^(1/1800)` for ~30s half-life at 60fps. */
const EMA_ALPHA = 1 - Math.pow(0.5, 1 / 1800);

// =============================================================================
// FieldStatsAccumulator
// =============================================================================

export class FieldStatsAccumulator {
  readonly stride: Stride;

  /** All-time minimum per component — only expands. */
  private _allTimeMin: Float32Array;

  /** All-time maximum per component — only expands. */
  private _allTimeMax: Float32Array;

  /** Exponential moving average per component. */
  private _emaMean: Float32Array;

  /** Whether EMA has been seeded (first frame sets directly). */
  private _emaSeeded = false;

  /** Ring buffer of snapshots. */
  private _snapshots: FieldFrameSnapshot[];

  /** Monotonically increasing write position. */
  private _writeIndex = 0;

  /** Whether ring buffer has wrapped at least once. */
  private _filled = false;

  /** Last seen count (from most recent update). */
  private _lastCount = 0;

  /** Pre-allocated sort buffer to avoid per-frame allocation. */
  private _sortBuf: Float32Array;

  /** Maximum lane count the sort buffer can handle. */
  private _sortBufCapacity = 0;

  /** Instance-0 sparkline ring buffer (stride 1, component 0 only). */
  private _instBuffer: Float32Array;

  /** Monotonically increasing write position for instance ring buffer. */
  private _instWriteIndex = 0;

  /** Whether instance ring buffer has wrapped at least once. */
  private _instFilled = false;

  /** Buffer history: ring of per-frame Float32Array snapshots (component 0, one per instance). */
  private _bufFrames: Float32Array[];

  /** Monotonically increasing write position for buffer history. */
  private _bufWriteIndex = 0;

  /** Whether buffer history has wrapped at least once. */
  private _bufFilled = false;

  /** Current row count in buffer history (may be less than BUFFER_HISTORY_MAX_ROWS). */
  private _bufRowCount = 0;

  constructor(stride: Stride) {
    this.stride = stride;

    this._allTimeMin = new Float32Array(stride);
    this._allTimeMax = new Float32Array(stride);
    this._emaMean = new Float32Array(stride);

    // Initialize min to +Infinity, max to -Infinity
    this._allTimeMin.fill(Infinity);
    this._allTimeMax.fill(-Infinity);

    // Pre-allocate snapshot ring buffer
    this._snapshots = new Array(HISTORY_CAPACITY);
    for (let i = 0; i < HISTORY_CAPACITY; i++) {
      this._snapshots[i] = {
        min: new Float32Array(stride),
        p25: new Float32Array(stride),
        mean: new Float32Array(stride),
        p75: new Float32Array(stride),
        max: new Float32Array(stride),
        count: 0,
      };
    }

    // Initial sort buffer (will grow if needed)
    this._sortBuf = new Float32Array(1024);
    this._sortBufCapacity = 1024;

    // Instance-0 sparkline ring buffer
    this._instBuffer = new Float32Array(INSTANCE_HISTORY_CAPACITY);

    // Buffer history: pre-allocate frame buffers
    this._bufFrames = new Array(BUFFER_HISTORY_CAPACITY);
    for (let i = 0; i < BUFFER_HISTORY_CAPACITY; i++) {
      this._bufFrames[i] = new Float32Array(BUFFER_HISTORY_MAX_ROWS);
    }
  }

  /**
   * Update with a new frame of field data.
   *
   * @param buffer Interleaved float buffer (stride-packed: [c0,c1,...,c0,c1,...])
   * @param count Number of lanes (elements) in the buffer
   */
  update(buffer: Float32Array, count: number): void {
    this._lastCount = count;

    // Sample instance 0, component 0 into sparkline ring buffer
    this._instBuffer[this._instWriteIndex % INSTANCE_HISTORY_CAPACITY] =
      count === 0 ? NaN : buffer[0];
    this._instWriteIndex++;
    if (this._instWriteIndex >= INSTANCE_HISTORY_CAPACITY && !this._instFilled) {
      this._instFilled = true;
    }

    // Record component 0 of each instance into buffer history frame
    {
      const frame = this._bufFrames[this._bufWriteIndex % BUFFER_HISTORY_CAPACITY];
      const s = this.stride as number;
      const rowCount = Math.min(count, BUFFER_HISTORY_MAX_ROWS);
      this._bufRowCount = rowCount;

      // Copy component 0 from each lane (strided access)
      if (s > 0 && count > 0) {
        if (count <= BUFFER_HISTORY_MAX_ROWS) {
          // Direct copy — one value per lane
          for (let i = 0; i < rowCount; i++) {
            frame[i] = buffer[i * s];
          }
        } else {
          // Downsample: evenly spread across max rows
          for (let i = 0; i < BUFFER_HISTORY_MAX_ROWS; i++) {
            const srcIdx = Math.floor((i / BUFFER_HISTORY_MAX_ROWS) * count);
            frame[i] = buffer[srcIdx * s];
          }
        }
      }
      // Zero-fill remainder
      frame.fill(0, rowCount);

      this._bufWriteIndex++;
      if (this._bufWriteIndex >= BUFFER_HISTORY_CAPACITY && !this._bufFilled) {
        this._bufFilled = true;
      }
    }

    if (count === 0) {
      // Push empty snapshot
      const slot = this._snapshots[this._writeIndex % HISTORY_CAPACITY];
      slot.min.fill(0);
      slot.p25.fill(0);
      slot.mean.fill(0);
      slot.p75.fill(0);
      slot.max.fill(0);
      (slot as { count: number }).count = 0;
      this._advanceWrite();
      return;
    }

    // Ensure sort buffer is large enough
    if (count > this._sortBufCapacity) {
      this._sortBuf = new Float32Array(count);
      this._sortBufCapacity = count;
    }

    const snap = this._snapshots[this._writeIndex % HISTORY_CAPACITY];
    (snap as { count: number }).count = count;
    const s = this.stride as number;

    for (let c = 0; c < s; c++) {
      let instantMin = Infinity;
      let instantMax = -Infinity;
      let sum = 0;

      // Extract component values into sort buffer + compute min/max/sum
      for (let i = 0; i < count; i++) {
        const v = buffer[i * s + c];
        this._sortBuf[i] = v;
        if (v < instantMin) instantMin = v;
        if (v > instantMax) instantMax = v;
        sum += v;
      }

      const instantMean = sum / count;

      // Sort for percentiles (only the first `count` elements)
      const sub = this._sortBuf.subarray(0, count);
      sub.sort();

      const p25 = sub[Math.floor(count * 0.25)];
      const p75 = sub[Math.floor(count * 0.75)];

      // Write snapshot
      snap.min[c] = instantMin;
      snap.p25[c] = p25;
      snap.mean[c] = instantMean;
      snap.p75[c] = p75;
      snap.max[c] = instantMax;

      // Expand all-time min/max
      if (instantMin < this._allTimeMin[c]) this._allTimeMin[c] = instantMin;
      if (instantMax > this._allTimeMax[c]) this._allTimeMax[c] = instantMax;

      // Update EMA
      if (!this._emaSeeded) {
        this._emaMean[c] = instantMean;
      } else {
        this._emaMean[c] += EMA_ALPHA * (instantMean - this._emaMean[c]);
      }
    }

    this._emaSeeded = true;
    this._advanceWrite();
  }

  /**
   * Get accumulated aggregate stats (stable min/max, EMA mean).
   */
  getAccumulatedStats(): AggregateFieldStats {
    return {
      count: this._lastCount,
      stride: this.stride,
      min: this._allTimeMin,
      max: this._allTimeMax,
      mean: this._emaMean,
    };
  }

  /**
   * Get temporal history as a read-only view.
   */
  getHistory(): FieldHistoryView {
    return {
      snapshots: this._snapshots,
      writeIndex: this._writeIndex,
      capacity: HISTORY_CAPACITY,
      stride: this.stride,
      filled: this._filled,
    };
  }

  /**
   * Get instance-0 sparkline history as a HistoryView.
   * Samples component 0 of instance 0 every frame (stride 1).
   */
  getInstanceHistory(): HistoryView {
    return {
      buffer: this._instBuffer,
      writeIndex: this._instWriteIndex,
      capacity: INSTANCE_HISTORY_CAPACITY,
      stride: 1,
      filled: this._instFilled,
    };
  }

  /**
   * Get buffer history as a read-only view for raster heatmap rendering.
   * Each frame contains component 0 of up to 128 instances.
   */
  getBufferHistory(): BufferHistoryView {
    return {
      frames: this._bufFrames,
      writeIndex: this._bufWriteIndex,
      capacity: BUFFER_HISTORY_CAPACITY,
      rowCount: this._bufRowCount,
      filled: this._bufFilled,
    };
  }

  /**
   * Reset all accumulated state.
   */
  reset(): void {
    this._allTimeMin.fill(Infinity);
    this._allTimeMax.fill(-Infinity);
    this._emaMean.fill(0);
    this._emaSeeded = false;
    this._writeIndex = 0;
    this._filled = false;
    this._lastCount = 0;
    this._instBuffer.fill(0);
    this._instWriteIndex = 0;
    this._instFilled = false;
    for (const frame of this._bufFrames) frame.fill(0);
    this._bufWriteIndex = 0;
    this._bufFilled = false;
    this._bufRowCount = 0;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _advanceWrite(): void {
    this._writeIndex++;
    if (this._writeIndex >= HISTORY_CAPACITY && !this._filled) {
      this._filled = true;
    }
  }
}
