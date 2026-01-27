/**
 * RenderBufferArena - Pre-allocated buffer arena for zero-allocation rendering
 *
 * This arena pre-allocates all buffers needed for rendering up to MAX_ELEMENTS
 * at initialization time. After init(), NO allocations occur during rendering.
 *
 * ARCHITECTURAL INVARIANT:
 * After init() is called, any attempt to allocate beyond capacity throws an error.
 * This is intentional - we want to catch allocation bugs, not silently degrade.
 *
 * Usage:
 *   const arena = new RenderBufferArena(50_000);
 *   arena.init();  // Pre-allocate everything
 *
 *   // Per-frame:
 *   arena.reset();  // Reset write heads (zero-cost, no allocations)
 *   const positions = arena.allocVec2(count);  // Get view into pre-allocated buffer
 *   const colors = arena.allocRGBA(count);
 *   // ... render ...
 *
 * Buffer types supported:
 * - f32:     Float32Array (1 element per instance)
 * - vec2f32: Float32Array (2 elements per instance)
 * - vec3f32: Float32Array (3 elements per instance)
 * - rgba8:   Uint8ClampedArray (4 elements per instance)
 * - u32:     Uint32Array (1 element per instance)
 * - u8:      Uint8Array (1 element per instance)
 */

/** Maximum supported element count - set at construction */
const DEFAULT_MAX_ELEMENTS = 50_000;

/**
 * Pre-allocated arena for render buffers.
 * Zero allocations after init() - any overflow throws.
 */
export class RenderBufferArena {
  readonly maxElements: number;

  // Pre-allocated backing buffers
  private f32Buffer!: Float32Array;
  private vec2Buffer!: Float32Array;
  private vec3Buffer!: Float32Array;
  private rgbaBuffer!: Uint8ClampedArray;
  private u32Buffer!: Uint32Array;
  private u8Buffer!: Uint8Array;

  // Current write heads (reset each frame)
  private f32Head = 0;
  private vec2Head = 0;
  private vec3Head = 0;
  private rgbaHead = 0;
  private u32Head = 0;
  private u8Head = 0;

  // Initialization flag
  private initialized = false;

  // Allocation tracking (for debugging)
  private allocCountThisFrame = 0;
  private peakF32 = 0;
  private peakVec2 = 0;
  private peakVec3 = 0;
  private peakRGBA = 0;
  private peakU32 = 0;
  private peakU8 = 0;

  // Strict mode: throws if any outside allocations detected
  private strictMode = false;
  private frameInProgress = false;

  constructor(maxElements: number = DEFAULT_MAX_ELEMENTS) {
    this.maxElements = maxElements;
  }

  /**
   * Initialize the arena by pre-allocating all buffers.
   * Call this ONCE at startup.
   */
  init(): void {
    if (this.initialized) {
      throw new Error('RenderBufferArena: init() called twice');
    }

    const N = this.maxElements;

    // Pre-allocate all buffers to max capacity
    this.f32Buffer = new Float32Array(N);
    this.vec2Buffer = new Float32Array(N * 2);
    this.vec3Buffer = new Float32Array(N * 3);
    this.rgbaBuffer = new Uint8ClampedArray(N * 4);
    this.u32Buffer = new Uint32Array(N);
    this.u8Buffer = new Uint8Array(N);

    this.initialized = true;

    // Log total pre-allocated memory
    const totalBytes =
      this.f32Buffer.byteLength +
      this.vec2Buffer.byteLength +
      this.vec3Buffer.byteLength +
      this.rgbaBuffer.byteLength +
      this.u32Buffer.byteLength +
      this.u8Buffer.byteLength;

    console.log(
      `RenderBufferArena: pre-allocated ${(totalBytes / 1024 / 1024).toFixed(2)} MB for ${N} elements`
    );
  }

  /**
   * Reset write heads for new frame.
   * This is O(1) - no allocations, just resets indices.
   */
  reset(): void {
    this.assertInitialized();

    // Track peak usage before reset
    this.peakF32 = Math.max(this.peakF32, this.f32Head);
    this.peakVec2 = Math.max(this.peakVec2, this.vec2Head);
    this.peakVec3 = Math.max(this.peakVec3, this.vec3Head);
    this.peakRGBA = Math.max(this.peakRGBA, this.rgbaHead);
    this.peakU32 = Math.max(this.peakU32, this.u32Head);
    this.peakU8 = Math.max(this.peakU8, this.u8Head);

    // Reset heads
    this.f32Head = 0;
    this.vec2Head = 0;
    this.vec3Head = 0;
    this.rgbaHead = 0;
    this.u32Head = 0;
    this.u8Head = 0;
    this.allocCountThisFrame = 0;
  }

  /**
   * Allocate a Float32Array view for `count` f32 values.
   * Returns a subarray view into the pre-allocated buffer.
   */
  allocF32(count: number): Float32Array {
    this.assertInitialized();
    this.allocCountThisFrame++;

    const start = this.f32Head;
    const end = start + count;

    if (end > this.maxElements) {
      throw new Error(
        `RenderBufferArena: f32 overflow! Requested ${count} elements at offset ${start}, ` +
        `but max is ${this.maxElements}. Total requested: ${end}`
      );
    }

    this.f32Head = end;
    return this.f32Buffer.subarray(start, end);
  }

  /**
   * Allocate a Float32Array view for `count` vec2 values (2 floats each).
   * Returns a subarray view into the pre-allocated buffer.
   */
  allocVec2(count: number): Float32Array {
    this.assertInitialized();
    this.allocCountThisFrame++;

    const start = this.vec2Head;
    const end = start + count;

    if (end > this.maxElements) {
      throw new Error(
        `RenderBufferArena: vec2 overflow! Requested ${count} elements at offset ${start}, ` +
        `but max is ${this.maxElements}. Total requested: ${end}`
      );
    }

    this.vec2Head = end;
    return this.vec2Buffer.subarray(start * 2, end * 2);
  }

  /**
   * Allocate a Float32Array view for `count` vec3 values (3 floats each).
   * Returns a subarray view into the pre-allocated buffer.
   */
  allocVec3(count: number): Float32Array {
    this.assertInitialized();
    this.allocCountThisFrame++;

    const start = this.vec3Head;
    const end = start + count;

    if (end > this.maxElements) {
      throw new Error(
        `RenderBufferArena: vec3 overflow! Requested ${count} elements at offset ${start}, ` +
        `but max is ${this.maxElements}. Total requested: ${end}`
      );
    }

    this.vec3Head = end;
    return this.vec3Buffer.subarray(start * 3, end * 3);
  }

  /**
   * Allocate a Uint8ClampedArray view for `count` RGBA values (4 bytes each).
   * Returns a subarray view into the pre-allocated buffer.
   */
  allocRGBA(count: number): Uint8ClampedArray {
    this.assertInitialized();
    this.allocCountThisFrame++;

    const start = this.rgbaHead;
    const end = start + count;

    if (end > this.maxElements) {
      throw new Error(
        `RenderBufferArena: rgba overflow! Requested ${count} elements at offset ${start}, ` +
        `but max is ${this.maxElements}. Total requested: ${end}`
      );
    }

    this.rgbaHead = end;
    return this.rgbaBuffer.subarray(start * 4, end * 4);
  }

  /**
   * Allocate a Uint32Array view for `count` u32 values.
   * Returns a subarray view into the pre-allocated buffer.
   */
  allocU32(count: number): Uint32Array {
    this.assertInitialized();
    this.allocCountThisFrame++;

    const start = this.u32Head;
    const end = start + count;

    if (end > this.maxElements) {
      throw new Error(
        `RenderBufferArena: u32 overflow! Requested ${count} elements at offset ${start}, ` +
        `but max is ${this.maxElements}. Total requested: ${end}`
      );
    }

    this.u32Head = end;
    return this.u32Buffer.subarray(start, end);
  }

  /**
   * Allocate a Uint8Array view for `count` u8 values.
   * Returns a subarray view into the pre-allocated buffer.
   */
  allocU8(count: number): Uint8Array {
    this.assertInitialized();
    this.allocCountThisFrame++;

    const start = this.u8Head;
    const end = start + count;

    if (end > this.maxElements) {
      throw new Error(
        `RenderBufferArena: u8 overflow! Requested ${count} elements at offset ${start}, ` +
        `but max is ${this.maxElements}. Total requested: ${end}`
      );
    }

    this.u8Head = end;
    return this.u8Buffer.subarray(start, end);
  }

  /**
   * Get current frame statistics.
   */
  getFrameStats(): {
    allocCount: number;
    f32Used: number;
    vec2Used: number;
    vec3Used: number;
    rgbaUsed: number;
    u32Used: number;
    u8Used: number;
  } {
    return {
      allocCount: this.allocCountThisFrame,
      f32Used: this.f32Head,
      vec2Used: this.vec2Head,
      vec3Used: this.vec3Head,
      rgbaUsed: this.rgbaHead,
      u32Used: this.u32Head,
      u8Used: this.u8Head,
    };
  }

  /**
   * Get peak usage statistics (across all frames since init).
   */
  getPeakStats(): {
    peakF32: number;
    peakVec2: number;
    peakVec3: number;
    peakRGBA: number;
    peakU32: number;
    peakU8: number;
    maxElements: number;
  } {
    return {
      peakF32: this.peakF32,
      peakVec2: this.peakVec2,
      peakVec3: this.peakVec3,
      peakRGBA: this.peakRGBA,
      peakU32: this.peakU32,
      peakU8: this.peakU8,
      maxElements: this.maxElements,
    };
  }

  /**
   * Get total pre-allocated memory in bytes.
   */
  getTotalBytes(): number {
    if (!this.initialized) return 0;
    return (
      this.f32Buffer.byteLength +
      this.vec2Buffer.byteLength +
      this.vec3Buffer.byteLength +
      this.rgbaBuffer.byteLength +
      this.u32Buffer.byteLength +
      this.u8Buffer.byteLength
    );
  }

  /**
   * Alias for getTotalBytes() - for API compatibility.
   */
  getTotalAllocatedBytes(): number {
    return this.getTotalBytes();
  }

  /**
   * Check if arena is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Enable strict mode for allocation detection.
   * In strict mode, calling beginFrame/endFrame and accessing outside buffers
   * will help detect unexpected allocations.
   */
  enableStrictMode(): void {
    this.strictMode = true;
  }

  /**
   * Mark the beginning of a frame for allocation tracking.
   */
  beginFrame(): void {
    if (this.strictMode && this.frameInProgress) {
      console.warn('RenderBufferArena: beginFrame called while frame already in progress');
    }
    this.frameInProgress = true;
    this.reset();
  }

  /**
   * Mark the end of a frame.
   */
  endFrame(): void {
    if (this.strictMode && !this.frameInProgress) {
      console.warn('RenderBufferArena: endFrame called but no frame in progress');
    }
    this.frameInProgress = false;
  }

  /**
   * Check if a frame is currently in progress.
   */
  isFrameInProgress(): boolean {
    return this.frameInProgress;
  }

  /**
   * Check if strict mode is enabled.
   */
  isStrictModeEnabled(): boolean {
    return this.strictMode;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'RenderBufferArena: not initialized. Call init() before using the arena.'
      );
    }
  }
}

/**
 * Global singleton arena instance.
 * Initialized once at app startup, used throughout render pipeline.
 */
let globalArena: RenderBufferArena | null = null;

/**
 * Initialize the global render arena.
 * Call this once at application startup.
 */
export function initGlobalRenderArena(maxElements: number = DEFAULT_MAX_ELEMENTS): RenderBufferArena {
  if (globalArena !== null) {
    console.warn('RenderBufferArena: global arena already initialized, returning existing');
    return globalArena;
  }
  globalArena = new RenderBufferArena(maxElements);
  globalArena.init();
  return globalArena;
}

/**
 * Get the global render arena.
 * Throws if not initialized.
 */
export function getGlobalRenderArena(): RenderBufferArena {
  if (globalArena === null) {
    throw new Error(
      'RenderBufferArena: global arena not initialized. Call initGlobalRenderArena() at startup.'
    );
  }
  return globalArena;
}

/**
 * Check if global arena is initialized.
 */
export function isGlobalArenaInitialized(): boolean {
  return globalArena !== null && globalArena.isInitialized();
}

/**
 * Reset the global arena for testing.
 * DO NOT use in production code.
 */
export function _resetGlobalArenaForTesting(): void {
  globalArena = null;
}
