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

import type { ContinuityPolicy, StepContinuityApply, ValueSlot } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import type { MappingState, StableTargetId } from './ContinuityState';
import { getOrCreateTargetState } from './ContinuityState';

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
 * @param count - Number of elements in new domain
 */
export function initializeGaugeOnDomainChange(
  oldEffective: Float32Array | null,
  newBase: Float32Array,
  gaugeBuffer: Float32Array,
  mapping: MappingState | null,
  count: number
): void {
  if (!oldEffective || !mapping) {
    // No previous state - all elements start at base
    gaugeBuffer.fill(0);
    return;
  }

  if (mapping.kind === 'identity') {
    // Same indices - preserve Δ so x_eff stays continuous
    for (let i = 0; i < count; i++) {
      gaugeBuffer[i] = oldEffective[i] - newBase[i];
    }
  } else if (mapping.kind === 'byId' || mapping.kind === 'byPosition') {
    // Mapped indices
    for (let i = 0; i < count; i++) {
      const oldIdx = mapping.newToOld[i];
      if (oldIdx >= 0 && oldIdx < oldEffective.length) {
        // Mapped element: preserve effective value
        gaugeBuffer[i] = oldEffective[oldIdx] - newBase[i];
      } else {
        // New element: start at base (no jump)
        gaugeBuffer[i] = 0;
      }
    }
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
 * @param count - Number of elements in new domain
 */
export function initializeSlewWithMapping(
  oldSlew: Float32Array | null,
  newBase: Float32Array,
  slewBuffer: Float32Array,
  mapping: MappingState | null,
  count: number
): void {
  if (!oldSlew || !mapping) {
    // No previous state - start at base values
    for (let i = 0; i < count; i++) {
      slewBuffer[i] = newBase[i];
    }
    return;
  }

  if (mapping.kind === 'identity') {
    // Same indices - copy old slew state
    for (let i = 0; i < count; i++) {
      slewBuffer[i] = i < oldSlew.length ? oldSlew[i] : newBase[i];
    }
  } else if (mapping.kind === 'byId' || mapping.kind === 'byPosition') {
    for (let i = 0; i < count; i++) {
      const oldIdx = mapping.newToOld[i];
      if (oldIdx >= 0 && oldIdx < oldSlew.length) {
        // Mapped: transfer slew state
        slewBuffer[i] = oldSlew[oldIdx];
      } else {
        // New element: start at base (will slew from there)
        slewBuffer[i] = newBase[i];
      }
    }
  }
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
  const { targetKey, instanceId, policy, baseSlot, outputSlot } = step;
  const targetId = targetKey as StableTargetId;

  // Get current base buffer
  const baseBuffer = getBuffer(baseSlot);
  const count = baseBuffer.length;

  // Get or create continuity state for this target
  const targetState = getOrCreateTargetState(state.continuity, targetId, count);

  // Compute dt for slew (I30: use t_model_ms only)
  const tModelMs = state.time?.tMs ?? 0;
  const dtMs = Math.max(0, tModelMs - state.continuity.lastTModelMs);

  // Get mapping if domain changed
  const mapping = state.continuity.mappings.get(instanceId) ?? null;

  // Handle domain change - reinitialize buffers
  if (state.continuity.domainChangeThisFrame) {
    // Save old effective values before modification
    const oldEffective =
      targetState.slewBuffer.length > 0 && targetState.slewBuffer.length <= count
        ? new Float32Array(targetState.slewBuffer)
        : null;
    const oldSlew =
      targetState.slewBuffer.length > 0
        ? new Float32Array(targetState.slewBuffer)
        : null;

    // Initialize gauge to preserve effective values
    initializeGaugeOnDomainChange(
      oldEffective,
      baseBuffer,
      targetState.gaugeBuffer,
      mapping,
      count
    );

    // Initialize slew with mapped values
    initializeSlewWithMapping(
      oldSlew,
      baseBuffer,
      targetState.slewBuffer,
      mapping,
      count
    );
  }

  // Get output buffer (may be same as base for in-place)
  const outputBuffer =
    baseSlot === outputSlot ? baseBuffer : getBuffer(outputSlot);

  // Apply policy
  switch (policy.kind) {
    case 'none':
      // Pass through unchanged
      if (outputBuffer !== baseBuffer) {
        outputBuffer.set(baseBuffer);
      }
      break;

    case 'preserve':
      // Apply gauge only (hard continuity)
      applyAdditiveGauge(baseBuffer, targetState.gaugeBuffer, outputBuffer, count);
      break;

    case 'slew':
      // Slew toward base value
      applySlewFilter(
        baseBuffer,
        targetState.slewBuffer,
        outputBuffer,
        policy.tauMs,
        dtMs,
        count
      );
      break;

    case 'project':
      // Apply gauge then slew (for position - spec §2.3)
      // First: x_gauged = x_base + Δ
      applyAdditiveGauge(baseBuffer, targetState.gaugeBuffer, outputBuffer, count);
      // Then: slew toward gauged values
      applySlewFilter(
        outputBuffer,
        targetState.slewBuffer,
        outputBuffer,
        policy.tauMs,
        dtMs,
        count
      );
      break;

    case 'crossfade':
      // TODO: Implement crossfade for unmappable cases (spec §3.7)
      // For now, pass through - crossfade requires two-buffer blending
      if (outputBuffer !== baseBuffer) {
        outputBuffer.set(baseBuffer);
      }
      break;
  }
}

/**
 * End-of-frame cleanup (spec §5.1).
 * Updates time tracking and clears frame-local flags.
 *
 * @param state - Runtime state
 */
export function finalizeContinuityFrame(state: RuntimeState): void {
  state.continuity.lastTModelMs = state.time?.tMs ?? 0;
  state.continuity.domainChangeThisFrame = false;
}
