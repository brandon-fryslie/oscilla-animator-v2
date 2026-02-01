/**
 * ══════════════════════════════════════════════════════════════════════
 * KERNEL REGISTRY
 * ══════════════════════════════════════════════════════════════════════
 *
 * Typed kernel registry with handle-based dispatch (no string lookups in hot loop).
 *
 * Design:
 * - Branded KernelId (string) for registration
 * - Branded KernelHandle (number) for runtime dispatch
 * - Two ABI categories: ScalarKernel and LaneKernel
 * - Registry stores kernels in dense arrays indexed by handle
 * - Lookup Map used only at program load time, not per-call
 *
 * ──────────────────────────────────────────────────────────────────────
 * SCALAR vs LANE ABI
 * ──────────────────────────────────────────────────────────────────────
 *
 * ScalarKernel: (args: number[]) => number
 * - Used in signal evaluation (always)
 * - Used in field evaluation (per-lane, when outStride === inStride)
 * - Example: noise3(px, py, pz, seed) -> scalar
 *
 * LaneKernel: (out: Float32Array, outBase: number, args: number[]) => void
 * - Used in field evaluation only
 * - Kernel writes outStride components to out[outBase...outBase+outStride-1]
 * - Used when output stride differs from input (e.g., hsvToRgb: 3 args → 4 components)
 * - Example: hsvToRgb(out, base, [h, s, v]) writes r,g,b,a=1 to out[base...base+3]
 *
 * ══════════════════════════════════════════════════════════════════════
 */

// =============================================================================
// Branded Types
// =============================================================================

/**
 * Kernel identifier (string name used during registration and lookup).
 *
 * This is the human-readable name used in IR (e.g., 'noise3', 'hsvToRgb').
 * It's only used at program load time for lookup. Runtime dispatch uses KernelHandle.
 */
export type KernelId = string & { readonly __brand: 'KernelId' };

export function kernelId(id: string): KernelId {
  return id as KernelId;
}

/**
 * Kernel handle (integer index for runtime dispatch).
 *
 * This is a dense array index into scalarKernels[] or laneKernels[].
 * Handle encodes the ABI in its tag to avoid separate lookup.
 *
 * Invariant: handle >= 0
 */
export type KernelHandle = number & { readonly __brand: 'KernelHandle' };

function kernelHandle(index: number): KernelHandle {
  if (index < 0) {
    throw new Error(`Invalid kernel handle: ${index}`);
  }
  return index as KernelHandle;
}

// =============================================================================
// ABI Discriminant
// =============================================================================

/**
 * Kernel ABI tag.
 *
 * Determines how the kernel is invoked at runtime:
 * - 'scalar': Returns a number, used per-lane or as-is
 * - 'lane': Writes to output buffer, used per-lane with stride
 */
export type KernelABI = 'scalar' | 'lane';

// =============================================================================
// Kernel Function Signatures
// =============================================================================

/**
 * ScalarKernel: Pure function returning a single number.
 *
 * Used in:
 * - Signal evaluation (always)
 * - Field evaluation (per-lane, when outStride === inStride)
 *
 * Contract:
 * - args.length === meta.argCount
 * - Deterministic (same args → same output, always)
 * - No side effects (pure)
 * - Must handle finite inputs gracefully (meta.guaranteesFiniteForFiniteInputs)
 */
export type ScalarKernel = (args: number[]) => number;

/**
 * LaneKernel: Writes multiple components to output buffer.
 *
 * Used in:
 * - Field evaluation only (per-lane)
 * - When output stride differs from input (e.g., HSV→RGBA: 3→4)
 *
 * Contract:
 * - args.length === meta.argCount
 * - Writes meta.outStride components to out[outBase...outBase+outStride-1]
 * - Deterministic (same args → same output, always)
 * - No side effects except writing to out buffer
 * - Must handle finite inputs gracefully
 */
export type LaneKernel = (
  out: Float32Array,
  outBase: number,
  args: number[]
) => void;

// =============================================================================
// Kernel Metadata
// =============================================================================

/**
 * Kernel metadata (used for validation and testing).
 *
 * All metadata is pre-validated at registration time.
 */
export interface KernelMeta {
  /** Number of input arguments */
  readonly argCount: number;

  /** Purity flag (all kernels must be pure for now) */
  readonly purity: 'pure' | 'stateful';

  /** Finiteness guarantee: finite inputs → finite output */
  readonly guaranteesFiniteForFiniteInputs: boolean;

  /** Expected output range (optional, for testing/validation) */
  readonly range?: { readonly min: number; readonly max: number };

  /** Output stride (lane kernels only) */
  readonly outStride?: number;
}

// =============================================================================
// Registry Entry (Internal)
// =============================================================================

interface RegistryEntryScalar {
  readonly abi: 'scalar';
  readonly id: KernelId;
  readonly fn: ScalarKernel;
  readonly meta: KernelMeta;
}

interface RegistryEntryLane {
  readonly abi: 'lane';
  readonly id: KernelId;
  readonly fn: LaneKernel;
  readonly meta: KernelMeta;
}

type RegistryEntry = RegistryEntryScalar | RegistryEntryLane;

// =============================================================================
// KernelRegistry Class
// =============================================================================

/**
 * Kernel registry with handle-based dispatch.
 *
 * Usage:
 * 1. Registration (program load):
 *    const handle = registry.registerScalar(kernelId('noise3'), noise3Fn, meta);
 *
 * 2. Resolution (program load):
 *    const { handle, abi, meta } = registry.resolve(kernelId('noise3'));
 *
 * 3. Runtime dispatch (hot loop):
 *    const result = registry.callScalar(handle, [px, py, pz, seed]);
 */
export class KernelRegistry {
  // Dense arrays indexed by handle (offset by abi)
  private readonly scalarKernels: ScalarKernel[] = [];
  private readonly laneKernels: LaneKernel[] = [];

  // Metadata arrays (aligned with kernel arrays)
  private readonly scalarMeta: KernelMeta[] = [];
  private readonly laneMeta: KernelMeta[] = [];

  // Lookup map (used only at program load, not in hot loop)
  private readonly lookupMap = new Map<KernelId, RegistryEntry>();

  /**
   * Register a scalar kernel.
   *
   * @param id - Kernel identifier (string name)
   * @param fn - Scalar kernel function
   * @param meta - Kernel metadata
   * @returns Handle for runtime dispatch
   * @throws If kernel with same ID already registered
   */
  registerScalar(
    id: KernelId,
    fn: ScalarKernel,
    meta: KernelMeta
  ): KernelHandle {
    if (this.lookupMap.has(id)) {
      throw new Error(`Kernel already registered: ${id}`);
    }

    // Validate metadata
    this.validateMeta(meta, 'scalar');

    // Allocate handle
    const handle = kernelHandle(this.scalarKernels.length);

    // Store in dense arrays
    this.scalarKernels.push(fn);
    this.scalarMeta.push(meta);

    // Store in lookup map
    const entry: RegistryEntryScalar = { abi: 'scalar', id, fn, meta };
    this.lookupMap.set(id, entry);

    return handle;
  }

  /**
   * Register a lane kernel.
   *
   * @param id - Kernel identifier (string name)
   * @param fn - Lane kernel function
   * @param meta - Kernel metadata (must include outStride)
   * @returns Handle for runtime dispatch
   * @throws If kernel with same ID already registered
   * @throws If meta.outStride is missing
   */
  registerLane(
    id: KernelId,
    fn: LaneKernel,
    meta: KernelMeta
  ): KernelHandle {
    if (this.lookupMap.has(id)) {
      throw new Error(`Kernel already registered: ${id}`);
    }

    // Validate metadata
    this.validateMeta(meta, 'lane');

    if (meta.outStride === undefined || meta.outStride <= 0) {
      throw new Error(
        `Lane kernel ${id} must specify outStride > 0 in metadata`
      );
    }

    // Allocate handle
    const handle = kernelHandle(this.laneKernels.length);

    // Store in dense arrays
    this.laneKernels.push(fn);
    this.laneMeta.push(meta);

    // Store in lookup map
    const entry: RegistryEntryLane = { abi: 'lane', id, fn, meta };
    this.lookupMap.set(id, entry);

    return handle;
  }

  /**
   * Resolve kernel ID to handle + ABI + metadata.
   *
   * Called during program load (not in hot loop).
   *
   * @param id - Kernel identifier
   * @returns Resolved kernel info
   * @throws If kernel not found
   */
  resolve(id: KernelId): {
    readonly handle: KernelHandle;
    readonly abi: KernelABI;
    readonly meta: KernelMeta;
  } {
    const entry = this.lookupMap.get(id);
    if (!entry) {
      throw new Error(`Kernel not found: ${id}`);
    }

    // Handle is implicit: array index
    let handle: KernelHandle;
    if (entry.abi === 'scalar') {
      const index = this.scalarKernels.indexOf(entry.fn);
      handle = kernelHandle(index);
    } else {
      const index = this.laneKernels.indexOf(entry.fn);
      handle = kernelHandle(index);
    }

    return {
      handle,
      abi: entry.abi,
      meta: entry.meta,
    };
  }

  /**
   * Call a scalar kernel (runtime hot loop).
   *
   * @param handle - Kernel handle (from resolve)
   * @param args - Input arguments
   * @returns Kernel result
   * @throws If handle out of bounds
   */
  callScalar(handle: KernelHandle, args: number[]): number {
    const fn = this.scalarKernels[handle as number];
    if (!fn) {
      throw new Error(`Invalid scalar kernel handle: ${handle}`);
    }
    return fn(args);
  }

  /**
   * Call a lane kernel (runtime hot loop).
   *
   * @param handle - Kernel handle (from resolve)
   * @param out - Output buffer
   * @param outBase - Start index in output buffer
   * @param args - Input arguments
   * @throws If handle out of bounds
   */
  callLane(
    handle: KernelHandle,
    out: Float32Array,
    outBase: number,
    args: number[]
  ): void {
    const fn = this.laneKernels[handle as number];
    if (!fn) {
      throw new Error(`Invalid lane kernel handle: ${handle}`);
    }
    fn(out, outBase, args);
  }

  /**
   * Get metadata for a kernel handle (for testing/validation).
   *
   * @param handle - Kernel handle
   * @param abi - ABI discriminant
   * @returns Kernel metadata
   */
  getMeta(handle: KernelHandle, abi: KernelABI): KernelMeta {
    if (abi === 'scalar') {
      const meta = this.scalarMeta[handle as number];
      if (!meta) {
        throw new Error(`Invalid scalar kernel handle: ${handle}`);
      }
      return meta;
    } else {
      const meta = this.laneMeta[handle as number];
      if (!meta) {
        throw new Error(`Invalid lane kernel handle: ${handle}`);
      }
      return meta;
    }
  }

  /**
   * List all registered kernels (for testing/validation).
   *
   * Returns entries with id, abi, handle, and metadata.
   */
  listAll(): ReadonlyArray<{ id: KernelId; abi: KernelABI; handle: KernelHandle; meta: KernelMeta }> {
    const result: { id: KernelId; abi: KernelABI; handle: KernelHandle; meta: KernelMeta }[] = [];
    for (const [, entry] of this.lookupMap) {
      const { handle } = this.resolve(entry.id);
      result.push({ id: entry.id, abi: entry.abi, handle, meta: entry.meta });
    }
    return result;
  }

  /**
   * Validate kernel metadata.
   */
  private validateMeta(meta: KernelMeta, abi: KernelABI): void {
    if (meta.argCount < 0) {
      throw new Error('argCount must be >= 0');
    }

    if (meta.purity !== 'pure' && meta.purity !== 'stateful') {
      throw new Error('purity must be "pure" or "stateful"');
    }

    if (abi === 'lane' && meta.outStride === undefined) {
      throw new Error('Lane kernels must specify outStride');
    }

    if (meta.outStride !== undefined && meta.outStride <= 0) {
      throw new Error('outStride must be > 0 if specified');
    }

    if (meta.range) {
      if (meta.range.min > meta.range.max) {
        throw new Error('range.min must be <= range.max');
      }
    }
  }
}
