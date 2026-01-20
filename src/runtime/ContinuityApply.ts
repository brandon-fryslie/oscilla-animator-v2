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
  if (!oldEffective || !mapping) {
    // No previous state - all elements start at base
    gaugeBuffer.fill(0);
    return;
  }

  const oldElementCount = oldEffective.length / stride;

  if (mapping.kind === 'identity') {
    // Same indices - preserve Δ so x_eff stays continuous
    for (let i = 0; i < elementCount; i++) {
      for (let s = 0; s < stride; s++) {
        const bufIdx = i * stride + s;
        gaugeBuffer[bufIdx] = oldEffective[bufIdx] - newBase[bufIdx];
      }
    }
  } else if (mapping.kind === 'byId' || mapping.kind === 'byPosition') {
    // Mapped indices
    for (let i = 0; i < elementCount; i++) {
      const oldIdx = mapping.newToOld[i];
      if (oldIdx >= 0 && oldIdx < oldElementCount) {
        // Mapped element: preserve effective value
        for (let s = 0; s < stride; s++) {
          const newBufIdx = i * stride + s;
          const oldBufIdx = oldIdx * stride + s;
          gaugeBuffer[newBufIdx] = oldEffective[oldBufIdx] - newBase[newBufIdx];
        }
      } else {
        // New element: start at base (no jump)
        for (let s = 0; s < stride; s++) {
          gaugeBuffer[i * stride + s] = 0;
        }
      }
    }
  }
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
 * @param stride - Number of floats per element (1 for float, 2 for vec2)
 */
export function initializeSlewWithMapping(
  oldSlew: Float32Array | null,
  newBase: Float32Array,
  slewBuffer: Float32Array,
  mapping: MappingState | null,
  elementCount: number,
  stride: number = 1
): void {
  const bufferLength = elementCount * stride;

  if (!oldSlew || !mapping) {
    // No previous state - start at base values
    for (let i = 0; i < bufferLength; i++) {
      slewBuffer[i] = newBase[i];
    }
    return;
  }

  const oldElementCount = oldSlew.length / stride;

  if (mapping.kind === 'identity') {
    // Same indices - copy old slew state for existing elements, base for new
    for (let i = 0; i < elementCount; i++) {
      for (let s = 0; s < stride; s++) {
        const bufIdx = i * stride + s;
        if (i < oldElementCount) {
          slewBuffer[bufIdx] = oldSlew[bufIdx];
        } else {
          slewBuffer[bufIdx] = newBase[bufIdx];
        }
      }
    }
  } else if (mapping.kind === 'byId' || mapping.kind === 'byPosition') {
    for (let i = 0; i < elementCount; i++) {
      const oldIdx = mapping.newToOld[i];
      if (oldIdx >= 0 && oldIdx < oldElementCount) {
        // Mapped: transfer slew state
        for (let s = 0; s < stride; s++) {
          slewBuffer[i * stride + s] = oldSlew[oldIdx * stride + s];
        }
      } else {
        // New element: start at base (will slew from there)
        for (let s = 0; s < stride; s++) {
          slewBuffer[i * stride + s] = newBase[i * stride + s];
        }
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
// Debug flag - set to true to enable logging
// NOTE: This logs ONLY on domain changes, not every frame
const DEBUG_CONTINUITY = true;

export function applyContinuity(
  step: StepContinuityApply,
  state: RuntimeState,
  getBuffer: (slot: ValueSlot) => Float32Array
): void {
  const { targetKey, instanceId, policy, baseSlot, outputSlot, semantic } = step;
  const targetId = targetKey as StableTargetId;

  // Get current base buffer
  const baseBuffer = getBuffer(baseSlot);
  const bufferLength = baseBuffer.length;

  // Compute stride based on semantic (position is vec2, others are float)
  const stride = semantic === 'position' ? 2 : 1;
  const elementCount = bufferLength / stride;

  // Check if target state already existed before we call getOrCreate
  const existingTargetState = state.continuity.targets.get(targetId);
  const hadPreviousState = existingTargetState !== undefined;

  // CRITICAL: Capture old buffer values BEFORE getOrCreateTargetState replaces them
  // When count changes, getOrCreateTargetState creates new zero-filled buffers,
  // discarding the old values we need for continuity
  //
  // IMPORTANT: We need to capture snapshots whenever the buffer SIZE changes
  // (existingTargetState.count !== bufferLength), because getOrCreateTargetState
  // will allocate new buffers and zero them out
  let oldSlewSnapshot: Float32Array | null = null;
  let oldGaugeSnapshot: Float32Array | null = null;
  if (hadPreviousState && existingTargetState!.count !== bufferLength) {
    // Buffer size change - save old values before they're overwritten by getOrCreateTargetState
    oldSlewSnapshot = new Float32Array(existingTargetState!.slewBuffer);
    oldGaugeSnapshot = new Float32Array(existingTargetState!.gaugeBuffer);
    if (DEBUG_CONTINUITY && semantic === 'position') {
      console.log(`[Continuity] Buffer size change detected: ${existingTargetState!.count} -> ${bufferLength}`);
      console.log(`[Continuity] Old slew sample [0,1]:`, oldSlewSnapshot[0], oldSlewSnapshot[1]);
      console.log(`[Continuity] Old gauge sample [0,1]:`, oldGaugeSnapshot[0], oldGaugeSnapshot[1]);
    }
  }

  // Get or create continuity state for this target
  // NOTE: This may replace the state with new zero-filled buffers if count changed
  const targetState = getOrCreateTargetState(state.continuity, targetId, bufferLength);

  // Compute dt for slew (I30: use t_model_ms only)
  const tModelMs = state.time?.tMs ?? 0;
  const dtMs = Math.max(0, tModelMs - state.continuity.lastTModelMs);

  // If this is a newly created target state (slew buffer is all zeros),
  // initialize it to the base values to avoid starting from zero
  if (!hadPreviousState) {
    // Initialize slew buffer to base values for smooth first-frame behavior
    initializeSlewBuffer(baseBuffer, targetState.slewBuffer, bufferLength);
    // Initialize gauge to zero (no offset needed on first frame)
    targetState.gaugeBuffer.fill(0);
  }

  // Get mapping if domain changed
  const mapping = state.continuity.mappings.get(instanceId) ?? null;

  // For crossfade, capture old effective values for blending
  // Use the pre-captured snapshot (before getOrCreateTargetState zeroed it)
  let oldEffectiveSnapshot: Float32Array | null = null;
  if (state.continuity.domainChangeThisFrame && hadPreviousState) {
    // Use snapshot if count changed, otherwise copy from current state
    oldEffectiveSnapshot = oldSlewSnapshot ?? (
      existingTargetState!.slewBuffer.length > 0
        ? new Float32Array(existingTargetState!.slewBuffer)
        : null
    );
  }

  // Handle domain change - reinitialize buffers (for non-crossfade policies)
  // Crossfade handles its own initialization differently
  if (state.continuity.domainChangeThisFrame && policy.kind !== 'crossfade') {
    // Use pre-captured snapshots (from before getOrCreateTargetState zeroed buffers)
    // If count didn't change, oldSlewSnapshot/oldGaugeSnapshot are null, use current targetState
    const oldEffective = oldSlewSnapshot ?? (
      targetState.slewBuffer.length > 0 && targetState.slewBuffer.length <= bufferLength
        ? new Float32Array(targetState.slewBuffer)
        : null
    );
    const oldSlew = oldSlewSnapshot ?? (
      targetState.slewBuffer.length > 0
        ? new Float32Array(targetState.slewBuffer)
        : null
    );

    if (DEBUG_CONTINUITY && semantic === 'position') {
      console.log(`[Continuity] Domain change for ${semantic}:`, {
        hadPreviousState,
        hadOldSlewSnapshot: oldSlewSnapshot !== null,
        hadOldGaugeSnapshot: oldGaugeSnapshot !== null,
        oldEffectiveLen: oldEffective?.length,
        oldSlewLen: oldSlew?.length,
        oldGaugeLen: oldGaugeSnapshot?.length,
        newBufferLen: bufferLength,
        mappingKind: mapping?.kind,
        policy: policy.kind,
      });
      if (oldEffective) {
        console.log(`[Continuity] oldEffective sample [0,1]:`, oldEffective[0], oldEffective[1]);
      }
      if (oldGaugeSnapshot) {
        console.log(`[Continuity] oldGauge snapshot sample [0,1]:`, oldGaugeSnapshot[0], oldGaugeSnapshot[1]);
      }
      console.log(`[Continuity] newBase sample [0,1]:`, baseBuffer[0], baseBuffer[1]);
    }

    // For ALL policies that use gauge (preserve, slew, project):
    // Initialize gauge to preserve effective values at boundary (spec §2.5)
    // This ensures mapped elements maintain their visual position at the boundary
    initializeGaugeOnDomainChange(
      oldEffective,
      baseBuffer,
      targetState.gaugeBuffer,
      mapping,
      elementCount,
      stride
    );

    if (DEBUG_CONTINUITY && semantic === 'position') {
      console.log(`[Continuity] gauge after init sample [0,1]:`, targetState.gaugeBuffer[0], targetState.gaugeBuffer[1]);
      const effectivePos0 = baseBuffer[0] + targetState.gaugeBuffer[0];
      const effectivePos1 = baseBuffer[1] + targetState.gaugeBuffer[1];
      console.log(`[Continuity] effective position [0,1] (base+gauge):`, effectivePos0, effectivePos1);
    }

    // Initialize slew with mapped values
    // For project: Old effective -> slews toward base (no offset)
    // For slew with gauge: Old effective -> slews toward base+gauge
    initializeSlewWithMapping(
      oldSlew,
      baseBuffer,
      targetState.slewBuffer,
      mapping,
      elementCount,
      stride
    );

    if (DEBUG_CONTINUITY && semantic === 'position') {
      console.log(`[Continuity] slew after init sample [0,1]:`, targetState.slewBuffer[0], targetState.slewBuffer[1]);
    }
  }

  // Get output buffer (may be same as base for in-place)
  const outputBuffer =
    baseSlot === outputSlot ? baseBuffer : getBuffer(outputSlot);

  // Read config for decay exponent, tau multiplier, and base tau
  const config = state.continuityConfig;
  const decayExponent = config?.decayExponent ?? 0.7;
  const tauMultiplier = config?.tauMultiplier ?? 1.0;
  const baseTauMs = config?.baseTauMs ?? 150;

  // Compute base tau factor: (baseTauMs / 150)
  // This normalizes around the canonical 150ms average semantic tau
  const baseTauFactor = baseTauMs / 150;

  // Handle test pulse request (inject into gauge buffer before applying policy)
  const pulseRequest = config?.testPulseRequest;
  if (pulseRequest && pulseRequest.appliedFrameId !== state.cache.frameId) {
    // Check if this target matches the pulse semantic (or if no semantic filter)
    const shouldApplyPulse = !pulseRequest.targetSemantic || pulseRequest.targetSemantic === semantic;

    if (shouldApplyPulse) {
      // Inject pulse into gauge buffer
      const magnitude = pulseRequest.magnitude;
      for (let i = 0; i < bufferLength; i++) {
        targetState.gaugeBuffer[i] += magnitude;
      }

      // Mark pulse as applied this frame
      pulseRequest.appliedFrameId = state.cache.frameId;

      if (DEBUG_CONTINUITY) {
        console.log(`[Continuity] Test pulse applied to ${semantic}: magnitude=${magnitude}, bufferLength=${bufferLength}`);
      }
    }
  }

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
      applyAdditiveGauge(baseBuffer, targetState.gaugeBuffer, outputBuffer, bufferLength);
      break;

    case 'slew': {
      // Slew toward base value (apply tau multiplier and base tau factor)
      const effectiveTau = policy.tauMs * baseTauFactor * tauMultiplier;
      applySlewFilter(
        baseBuffer,
        targetState.slewBuffer,
        outputBuffer,
        effectiveTau,
        dtMs,
        bufferLength
      );
      break;
    }

    case 'project': {
      // Project policy: Map elements by ID, decay gauge, apply gauge, then slew (spec §3)
      // 1. Decay gauge toward zero (for animated properties like rotating spirals)
      // 2. Apply gauge: gauged = base + gauge (preserves continuity at boundary)
      // 3. Slew toward gauged values (smooths any transitions)

      // Apply tau multiplier and base tau factor to policy tau
      const effectiveTau = policy.tauMs * baseTauFactor * tauMultiplier;

      // Debug logging for gauge decay (only when gauge is non-zero)
      if (DEBUG_CONTINUITY && semantic === 'position' &&
          (targetState.gaugeBuffer[0] !== 0 || targetState.gaugeBuffer[1] !== 0)) {
        console.log(`[Continuity] gauge pre-decay [0,1]:`,
          targetState.gaugeBuffer[0].toFixed(4), targetState.gaugeBuffer[1].toFixed(4));
      }

      // Decay gauge toward zero over time (using config exponent)
      decayGauge(targetState.gaugeBuffer, effectiveTau, dtMs, bufferLength, decayExponent);

      // Debug logging after decay (only when gauge is non-zero)
      if (DEBUG_CONTINUITY && semantic === 'position' &&
          (targetState.gaugeBuffer[0] !== 0 || targetState.gaugeBuffer[1] !== 0)) {
        console.log(`[Continuity] gauge post-decay [0,1]:`,
          targetState.gaugeBuffer[0].toFixed(4), targetState.gaugeBuffer[1].toFixed(4));
      }

      // Apply gauge: x_gauged = x_base + Δ
      applyAdditiveGauge(baseBuffer, targetState.gaugeBuffer, outputBuffer, bufferLength);

      // Slew toward gauged values
      applySlewFilter(
        outputBuffer,       // Target: gauged values (base + gauge)
        targetState.slewBuffer,
        outputBuffer,
        effectiveTau,
        dtMs,
        bufferLength
      );
      break;
    }

    case 'crossfade': {
      // Crossfade for unmappable cases (spec §3.7)
      // Blend old effective buffer with new base buffer over time window
      const { windowMs, curve } = policy;

      // On domain change, snapshot the old effective values to blend from
      // We use the pre-captured oldEffectiveSnapshot to get values before any reinitialization
      if (state.continuity.domainChangeThisFrame) {
        // Allocate buffer for old values if needed
        if (!targetState.crossfadeOldBuffer || targetState.crossfadeOldBuffer.length !== bufferLength) {
          targetState.crossfadeOldBuffer = new Float32Array(bufferLength);
        }

        // Use the snapshot captured at the start of applyContinuity
        if (oldEffectiveSnapshot && oldEffectiveSnapshot.length > 0) {
          // Copy from snapshot (the real old values before any modification)
          const copyCount = Math.min(oldEffectiveSnapshot.length, bufferLength);
          for (let i = 0; i < copyCount; i++) {
            targetState.crossfadeOldBuffer[i] = oldEffectiveSnapshot[i];
          }
          // New elements beyond old count start at base
          for (let i = copyCount; i < bufferLength; i++) {
            targetState.crossfadeOldBuffer[i] = baseBuffer[i];
          }
        } else {
          // No previous state - start from base (instant transition)
          targetState.crossfadeOldBuffer.set(baseBuffer);
        }

        // Mark crossfade start time
        targetState.crossfadeStartMs = tModelMs;
      }

      // Compute blend weight based on elapsed time
      const startMs = targetState.crossfadeStartMs ?? tModelMs;
      const elapsed = Math.max(0, tModelMs - startMs);
      const t = Math.min(1.0, elapsed / windowMs);

      // Apply curve function
      const w = curve === 'smoothstep' || curve === 'ease-in-out'
        ? smoothstep(t)
        : t; // linear

      if (w >= 1.0 || !targetState.crossfadeOldBuffer) {
        // Crossfade complete or not initialized - pass through base
        if (outputBuffer !== baseBuffer) {
          outputBuffer.set(baseBuffer);
        }
        // Clear crossfade state when complete
        if (w >= 1.0) {
          targetState.crossfadeStartMs = undefined;
        }
      } else {
        // Blend old and new: X_out[i] = lerp(X_old_eff[i], X_new_base[i], w)
        const oldBuffer = targetState.crossfadeOldBuffer;
        for (let i = 0; i < bufferLength; i++) {
          outputBuffer[i] = lerp(oldBuffer[i], baseBuffer[i], w);
        }
      }
      break;
    }
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

  // Clear test pulse request after it's been applied
  // (Note: appliedFrameId check prevents double-apply within same frame)
  if (state.continuityConfig?.testPulseRequest?.appliedFrameId === state.cache.frameId) {
    state.continuityConfig.testPulseRequest = null;
  }
}
