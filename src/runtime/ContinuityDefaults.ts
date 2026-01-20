/**
 * Continuity Defaults Module
 *
 * Canonical default continuity policies (spec topics/11-continuity-system.md §2.3).
 * These are engine-wide defaults when no UI override exists.
 *
 * @module runtime/ContinuityDefaults
 */

import type { ContinuityPolicy } from '../compiler/ir/types';

/**
 * Canonical default policies by semantic role.
 *
 * Per spec §2.3 and §4.2:
 * - position: project + slew(360ms) - map by element ID, then slew (slower for smoother transitions)
 * - radius: slew(120ms) - medium response
 * - opacity: slew(80ms) - fast response, responsive to edits
 * - color: slew(150ms) - slow to avoid jarring color shifts
 * - custom: crossfade(150ms) - safe fallback
 *
 * These are NOT "optional" - they are the system defaults.
 */
export const CANONICAL_CONTINUITY_POLICIES: Record<string, ContinuityPolicy> = {
  position: { kind: 'project', projector: 'byId', post: 'slew', tauMs: 360 },
  radius: { kind: 'slew', gauge: { kind: 'add' }, tauMs: 120 },
  opacity: { kind: 'slew', gauge: { kind: 'add' }, tauMs: 80 },
  color: { kind: 'slew', gauge: { kind: 'add' }, tauMs: 150 },
  custom: { kind: 'crossfade', windowMs: 150, curve: 'smoothstep' },
};

/**
 * Canonical time constants from spec §4.2.
 *
 * | Target | τ (ms) | Response |
 * |--------|--------|----------|
 * | opacity | 80 | Fast |
 * | radius | 120 | Medium |
 * | position | 360 | Slow (smooth domain transitions) |
 * | color | 150 | Slow |
 */
export const CANONICAL_TIME_CONSTANTS: Record<string, number> = {
  opacity: 80,
  radius: 120,
  position: 360,
  color: 150,
  custom: 150,
};

/**
 * Get continuity policy for a semantic role.
 *
 * @param semantic - Semantic role of the target
 * @returns Canonical continuity policy
 */
export function getPolicyForSemantic(
  semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom'
): ContinuityPolicy {
  return (
    CANONICAL_CONTINUITY_POLICIES[semantic] ??
    CANONICAL_CONTINUITY_POLICIES.custom
  );
}

/**
 * Get time constant for a semantic role.
 *
 * @param semantic - Semantic role of the target
 * @returns Time constant in milliseconds
 */
export function getTauForSemantic(
  semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom'
): number {
  return CANONICAL_TIME_CONSTANTS[semantic] ?? CANONICAL_TIME_CONSTANTS.custom;
}

/**
 * Check if a policy has slew behavior (needs dt for update).
 *
 * @param policy - Continuity policy
 * @returns True if policy requires slew update
 */
export function policyHasSlew(policy: ContinuityPolicy): boolean {
  return policy.kind === 'slew' || policy.kind === 'project';
}

/**
 * Check if a policy has gauge behavior (needs offset buffers).
 *
 * @param policy - Continuity policy
 * @returns True if policy requires gauge buffers
 */
export function policyHasGauge(policy: ContinuityPolicy): boolean {
  return (
    policy.kind === 'preserve' ||
    policy.kind === 'slew' ||
    policy.kind === 'project'
  );
}

/**
 * Check if a policy requires any continuity processing.
 *
 * @param policy - Continuity policy
 * @returns True if policy is not 'none'
 */
export function policyIsActive(policy: ContinuityPolicy): boolean {
  return policy.kind !== 'none';
}
