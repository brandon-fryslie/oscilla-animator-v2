/**
 * Continuity Application Module
 *
 * Implements gauge and slew filters from spec topics/11-continuity-system.md §2.5 and §4.1.
 *
 * Key operations:
 * - Additive gauge: x_eff = x_base + Δ (preserves effective value across discontinuities)
 * - Slew filter: First-order low-pass for smooth transitions
 * - Gauge initialization: Compute Δ on domain change to preserve continuity
 *
 * Performance constraints (spec §5):
 * - Vectorized loops
 * - Allocation-free per-frame
 * - Uses t_model_ms only (I30: deterministic)
 *
 * @module runtime/ContinuityApply
 */

import type { StepContinuityApply } from '../compiler/ir/types';
import type { ValueSlot } from '../compiler/ir/Indices';
import type { RuntimeState } from './RuntimeState';
import type { ContinuityState, MappingState, StableTargetId } from './ContinuityState';
import { getOrCreateTargetState } from './ContinuityState';
import { resolveMappingForApply } from './ContinuityMapping';

let continuityScratch = new Float32Array(0);

function ensureContinuityScratch(length: number): Float32Array {
  if (continuityScratch.length < length) {
    continuityScratch = new Float32Array(length);
  }
  return continuityScratch.subarray(0, length);
}

function continuityIndex(lane: number, component: number, stride: number): number {
  return lane * stride + component;
}

// =============================================================================
// Buffer Snapshot Capture
// =============================================================================

/**
 * Context captured BEFORE getOrCreateTargetState() to preserve old buffer values.
 *
 * This is necessary because getOrCreateTargetState() may allocate new zero-filled
 * buffers when the element count changes, destroying the old values we need for
 * continuity calculations.
 *
 * CRITICAL INVARIANT: This MUST be captured before calling getOrCreateTargetState().
 */
export interface CaptureContext {
  /** Snapshot of slew buffer before reallocation (null if no prior state or size unchanged) */
  oldSlewSnapshot: Float32Array | null;
  /** Whether target state existed before this call */
  hadPreviousState: boolean;
  /** Whether buffer size is changing (triggers reallocation) */
  sizeChanged: boolean;
}

/**
 * Capture state before calling getOrCreateTargetState().
 *
 * MUST be called BEFORE getOrCreateTargetState() to avoid data loss when
 * buffer size changes trigger reallocation.
 *
 * @param continuity - Continuity state container
 * @param targetId - Stable target identifier
 * @param newBufferLength - New buffer length (in floats, not elements)
 * @param captureSnapshot - Whether to snapshot previous slew values now
 * @returns Capture context with old buffer snapshot (if needed)
 */
export function capturePreAllocationState(
  continuity: ContinuityState,
  targetId: StableTargetId,
  newBufferLength: number,
  captureSnapshot: boolean,
): CaptureContext {
  const existingState = continuity.targets.get(targetId);
  const hadPreviousState = existingState !== undefined;
  const sizeChanged = hadPreviousState && existingState!.count !== newBufferLength;

  return {
    // [LAW:one-source-of-truth] Domain-change initialization must read one
    // authoritative pre-allocation slew snapshot regardless of size change.
    oldSlewSnapshot:
      captureSnapshot && hadPreviousState ? new Float32Array(existingState!.slewBuffer) : null,
    hadPreviousState,
    sizeChanged,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Smoothstep interpolation curve (spec §3.7).
 * Provides smooth acceleration/deceleration.
 *
 * @param t - Normalized time [0, 1]
 * @returns Smoothed value [0, 1]
 */
export function smoothstep(t: number): number {
  // Clamp t to [0, 1]
  const x = Math.max(0, Math.min(1, t));
  // Smoothstep formula: 3t² - 2t³
  return x * x * (3 - 2 * x);
}

/**
 * Linear interpolation.
 *
 * @param a - Start value
 * @param b - End value
 * @param t - Blend factor [0, 1]
 * @returns Interpolated value
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Apply a mapping operation to buffers with element-wise processing.
 *
 * This helper encapsulates the common pattern of:
 * 1. Null guard: if no old data or mapping, fill with defaults
 * 2. Loop over elements and lookup old indices via mapping
 * 3. For mapped elements: copy/transform data from old buffer
 * 4. For unmapped elements: fill with defaults
 *
 * Performance: This runs in the hot loop and must be zero-overhead.
 * The callback functions will be inlined by the JIT compiler.
 *
 * @param oldData - Previous buffer (null if no previous state)
 * @param mapping - Element mapping (null for no mapping)
 * @param elementCount - Number of elements in new domain
 * @param stride - Number of floats per element
 * @param fillDefault - Called when no mapping exists: () => void
 * @param onMapped - Called for mapped element: (newBufIdx, oldBufIdx) => void
 * @param onUnmapped - Called for unmapped element: (newBufIdx) => void
 */
function applyWithMapping(
  oldData: Float32Array | null,
  mapping: MappingState | null,
  elementCount: number,
  stride: number,
  fillDefault: () => void,
  onMapped: (newBufIdx: number, oldBufIdx: number) => void,
  onUnmapped: (newBufIdx: number) => void
): void {
  if (!oldData || !mapping) {
    fillDefault();
    return;
  }

  // [LAW:no-silent-fallbacks] Clamp to complete lanes only; partial trailing
  // data from prior layouts is treated as unmapped instead of read-through.
  const oldElementCount = Math.floor(oldData.length / stride);
  const newToOld = mapping.newToOld;
  // Single code path: always use newToOld lookup
  // For identity mappings, newToOld[i] === i (allocated once at domain creation)
  for (let i = 0; i < elementCount; i++) {
    const oldIdx = i < newToOld.length ? newToOld[i] : -1;
    if (oldIdx >= 0 && oldIdx < oldElementCount) {
      // Mapped element: apply transformation
      for (let s = 0; s < stride; s++) {
        // [LAW:one-source-of-truth] Continuity transfer index math is centralized
        // through one resolver so layout migration has a single edit boundary.
        const newBufIdx = continuityIndex(i, s, stride);
        const oldBufIdx = continuityIndex(oldIdx, s, stride);
        onMapped(newBufIdx, oldBufIdx);
      }
    } else {
      // New element: fill with default
      for (let s = 0; s < stride; s++) {
        const newBufIdx = continuityIndex(i, s, stride);
        onUnmapped(newBufIdx);
      }
    }
  }
}

// =============================================================================
// Gauge Operations
// =============================================================================

/**
 * Apply additive gauge: x_eff = x_base + Δ (spec §2.5)
 *
 * @param baseBuffer - Base values from computation
 * @param gaugeBuffer - Gauge offset values (Δ)
 * @param outputBuffer - Output buffer (may be same as base for in-place)
 * @param count - Number of elements
 */
export function applyAdditiveGauge(
  baseBuffer: Float32Array,
  gaugeBuffer: Float32Array,
  outputBuffer: Float32Array,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    outputBuffer[i] = baseBuffer[i] + gaugeBuffer[i];
  }
}

/**
 * Initialize gauge buffer on domain change (spec §2.5).
 * Preserves effective value for mapped elements.
 * New elements start at base value (Δ = 0).
 *
 * Mathematical guarantee:
 * For mapped elements: x_eff_old = x_eff_new
 * Because: Δ_new = x_eff_old - x_base_new
 *
 * @param oldEffective - Previous effective values (null if first frame)
 * @param newBase - New base values
 * @param gaugeBuffer - Output gauge buffer to initialize
 * @param mapping - Element mapping (null for no mapping)
 * @param elementCount - Number of elements in new domain
 * @param stride - Number of floats per element (1 for float, 2 for vec2)
 */
export function initializeGaugeOnDomainChange(
  oldEffective: Float32Array | null,
  newBase: Float32Array,
  gaugeBuffer: Float32Array,
  mapping: MappingState | null,
  elementCount: number,
  stride: number = 1
): void {
  applyWithMapping(
    oldEffective,
    mapping,
    elementCount,
    stride,
    // fillDefault: all elements start at base (no jump)
    () => gaugeBuffer.fill(0),
    // onMapped: preserve effective value
    (newBufIdx, oldBufIdx) => {
      gaugeBuffer[newBufIdx] = oldEffective![oldBufIdx] - newBase[newBufIdx];
    },
    // onUnmapped: start at base (no jump)
    (newBufIdx) => {
      gaugeBuffer[newBufIdx] = 0;
    }
  );
}

/**
 * Decay gauge buffer toward zero using ease-in exponential decay (spec §3 project policy).
 * For animated properties (e.g., rotating spirals), gauge offsets computed at domain
 * change time become incorrect as the base animation continues. Decaying the gauge
 * allows elements to gradually settle into their new positions.
 *
 * Uses a "rooted exponential" for ease-in behavior (smooth start, quick snap at end):
 * decay = exp(-dt/τ)^exponent
 * Default exponent=0.7 creates a decay that's gentle at first, then accelerates to snap into place.
 * User can tune exponent via continuityConfig (0.1 = very gentle, 2.0 = more linear).
 *
 * @param gaugeBuffer - Gauge buffer to decay in place
 * @param tauMs - Time constant in milliseconds (same as slew tau)
 * @param dtMs - Delta time in milliseconds
 * @param length - Number of elements in buffer
 * @param exponent - Decay curve exponent (from RuntimeState.continuityConfig.decayExponent)
 */
export function decayGauge(
  gaugeBuffer: Float32Array,
  tauMs: number,
  dtMs: number,
  length: number,
  exponent: number
): void {
  // Ease-in exponential decay: gauge[i] *= exp(-dt/τ)^exponent
  // The exponent shapes the curve (lower = slower start, higher = more linear)
  // After τ ms with exponent=0.7: decayed to ~46% of original (e^-1)^0.7 ≈ 0.457
  // After 5τ: decayed to ~2.7% (snaps quickly at the end)
  const baseDecay = Math.exp(-dtMs / tauMs);
  const decay = Math.pow(baseDecay, exponent);
  for (let i = 0; i < length; i++) {
    gaugeBuffer[i] *= decay;
  }
}

// =============================================================================
// Slew Operations
// =============================================================================

/**
 * First-order low-pass slew filter (spec §4.1).
 *
 * Formula:
 * α = 1 - exp(-dt / τ)
 * y[i] = y[i] + α * (target[i] - y[i])
 *
 * This is a time-correct exponential filter that produces
 * consistent results regardless of frame rate.
 *
 * @param targetBuffer - Target values to approach
 * @param slewBuffer - Current slew state (updated in place)
 * @param outputBuffer - Output buffer
 * @param tauMs - Time constant in milliseconds
 * @param dtMs - Delta time in milliseconds
 * @param count - Number of elements
 */
export function applySlewFilter(
  targetBuffer: Float32Array,
  slewBuffer: Float32Array,
  outputBuffer: Float32Array,
  tauMs: number,
  dtMs: number,
  count: number
): void {
  // Compute alpha (time-based blend factor)
  // α = 1 - e^(-dt/τ)
  // After τ ms: α ≈ 0.632 (63.2% of way to target)
  // After 5τ: α ≈ 0.993 (essentially there)
  const alpha = 1 - Math.exp(-dtMs / tauMs);

  for (let i = 0; i < count; i++) {
    const y = slewBuffer[i];
    const target = targetBuffer[i];
    const newY = y + alpha * (target - y);
    slewBuffer[i] = newY;
    outputBuffer[i] = newY;
  }
}

/**
 * Initialize slew buffer - start at current value.
 * Called on domain change to prevent discontinuity.
 *
 * @param currentBuffer - Current values to start from
 * @param slewBuffer - Slew buffer to initialize
 * @param count - Number of elements
 */
export function initializeSlewBuffer(
  currentBuffer: Float32Array,
  slewBuffer: Float32Array,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    slewBuffer[i] = currentBuffer[i];
  }
}

/**
 * Initialize slew buffer with mapped values.
 * Maps old slew state to new elements based on mapping.
 *
 * @param oldSlew - Previous slew state
 * @param newBase - New base values (for unmapped elements)
 * @param slewBuffer - Slew buffer to initialize
 * @param mapping - Element mapping
 * @param elementCount - Number of elements in new domain
 * @param stride - Number of floats per element (determined solely by ConcretePayloadType)
 */
export function initializeSlewWithMapping(
  oldSlew: Float32Array | null,
  newBase: Float32Array,
  slewBuffer: Float32Array,
  mapping: MappingState | null,
  elementCount: number,
  stride: number = 1
): void {
  applyWithMapping(
    oldSlew,
    mapping,
    elementCount,
    stride,
    // fillDefault: start at base values
    () => {
      const bufferLength = elementCount * stride;
      for (let i = 0; i < bufferLength; i++) {
        slewBuffer[i] = newBase[i];
      }
    },
    // onMapped: transfer slew state
    (newBufIdx, oldBufIdx) => {
      slewBuffer[newBufIdx] = oldSlew![oldBufIdx];
    },
    // onUnmapped: start at base (will slew from there)
    (newBufIdx) => {
      slewBuffer[newBufIdx] = newBase[newBufIdx];
    }
  );
}

// =============================================================================
// Policy Application
// =============================================================================

/**
 * Apply continuity policy to a field target (spec §5.1).
 * Called per-frame for targets with policy != none.
 *
 * @param step - Continuity apply step
 * @param state - Runtime state
 * @param getBuffer - Function to get buffer for a slot
 */
export function applyContinuity(
  step: StepContinuityApply,
  state: RuntimeState,
  getBuffer: (slot: ValueSlot) => Float32Array
): void {
  // [LAW:single-enforcer] Continuity behavior is temporarily disabled at this
  // runtime boundary; render-path values flow directly from base to output.
  // [LAW:one-source-of-truth] The materialized base slot is the canonical
  // source for current-frame field values while continuity is disabled.
  void state;
  const { baseSlot, outputSlot } = step;
  const baseBuffer = getBuffer(baseSlot);
  const outputBuffer = baseSlot === outputSlot ? baseBuffer : getBuffer(outputSlot);
  if (outputBuffer !== baseBuffer) {
    outputBuffer.set(baseBuffer);
  }
}

/**
 * End-of-frame cleanup (spec §5.1).
 * Updates time tracking and clears frame-local flags.
 *
 * @param state - Runtime state
 */
export function finalizeContinuityFrame(state: RuntimeState): void {
  // time is always set before continuity runs
  state.continuity.lastTModelMs = state.time !== null ? state.time.tMs : 0;
  // [LAW:one-source-of-truth] Mapping ownership is frame-local; clear it at
  // the canonical finalize boundary instead of relying on stale carry-over.
  state.continuity.mappings.clear();
  state.continuity.changedInstancesThisFrame.clear();
  state.continuity.domainChangeThisFrame = state.continuity.changedInstancesThisFrame.size > 0;

  // Clear test pulse request after it's been applied
  // (Note: appliedFrameId check prevents double-apply within same frame)
  if (state.continuityConfig?.testPulseRequest?.appliedFrameId === state.cache.frameId) {
    state.continuityConfig.testPulseRequest = null;
  }
}
