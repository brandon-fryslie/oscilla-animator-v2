/**
 * Runtime Test Helpers
 *
 * Factory functions for creating properly-typed runtime test objects.
 * Eliminates the need for 'as any' casts when building test state.
 *
 * @internal - Test-only infrastructure. Not part of public API.
 */

import type { MappingState, StableTargetId } from '../runtime/ContinuityState';
import { instanceId as makeInstanceId } from '../compiler/ir/Indices';
import type { InstanceId } from '../compiler/ir/Indices';
import type { RuntimeState } from '../runtime/RuntimeState';
import { createRuntimeState } from '../runtime/RuntimeState';

/**
 * Create a properly-typed ByIdMapping for testing.
 *
 * Maps new element indices to old element indices using Int32Array.
 * -1 in the array means the new element is unmapped (new element).
 *
 * @param newToOld - Array of old indices, with -1 for unmapped elements
 * @returns A MappingState with kind 'byId'
 *
 * @example
 * const mapping = mockByIdMapping([0, 1, -1, 2]);
 * // Element 0 maps to old 0, element 1 to old 1, element 2 is new, element 3 maps to old 2
 */
export function mockByIdMapping(
  newToOld: (number | -1)[]
): Extract<MappingState, { kind: 'byId' }> {
  return {
    kind: 'byId',
    newToOld: new Int32Array(newToOld),
  };
}

/**
 * Create a properly-typed identity mapping for testing.
 *
 * Used when the new domain has the same count as the old domain
 * and indices are preserved.
 *
 * @param count - Number of elements in the domain
 * @returns A MappingState with kind 'identity'
 *
 * @example
 * const mapping = mockIdentityMapping(5);
 * // 5 elements, all indices preserved
 */
export function mockIdentityMapping(
  count: number
): Extract<MappingState, { kind: 'identity' }> {
  return {
    kind: 'identity',
    count,
  };
}

/**
 * Create a properly-typed position-based mapping for testing.
 *
 * Fallback mapping when stable element IDs are not available.
 *
 * @param newToOld - Array of old indices based on position
 * @returns A MappingState with kind 'byPosition'
 */
export function mockPositionMapping(
  newToOld: (number | -1)[]
): Extract<MappingState, { kind: 'byPosition' }> {
  return {
    kind: 'byPosition',
    newToOld: new Int32Array(newToOld),
  };
}

/**
 * Create a test instance ID with flexible naming.
 *
 * Instance IDs are stable string identifiers that survive recompiles.
 * Format: 'semantic:instanceId:portName' (from spec continuity system)
 *
 * @param prefix - First part of the ID (e.g., 'custom', 'circle', 'control')
 * @param suffix - Second part of the ID (e.g., 'inst:x' or 'inst:y')
 * @returns A properly typed InstanceId
 *
 * @example
 * const instId = testInstanceId('custom', 'inst:x');
 * // Results in 'custom:inst:x'
 *
 * const circleId = testInstanceId('circle', 'main');
 * // Results in 'circle:main'
 */
export function testInstanceId(prefix: string, suffix: string): InstanceId {
  return makeInstanceId(`${prefix}:${suffix}`);
}

/**
 * Create a test StableTargetId for continuity testing.
 *
 * StableTargetIds are used by the continuity system to identify targets
 * across recompiles. Format: 'semantic:instanceId:portName'
 *
 * @param semantic - Semantic role (e.g., 'custom', 'position', 'radius')
 * @param instancePortKey - Combined instance and port (e.g., 'inst:x')
 * @returns A properly typed StableTargetId
 *
 * @example
 * const targetId = testStableTargetId('custom', 'inst:x');
 * // Results in 'custom:inst:x' as StableTargetId
 */
export function testStableTargetId(semantic: string, instancePortKey: string): StableTargetId {
  return `${semantic}:${instancePortKey}` as StableTargetId;
}

/**
 * Create a bare RuntimeState for testing.
 *
 * Returns a freshly initialized RuntimeState with all subsystems created.
 * Use this as the base for building up test state structures.
 *
 * @param slotCount - Number of value slots (default 100)
 * @returns A new RuntimeState
 *
 * @example
 * const state = createTestRuntimeState();
 * // Now populate state.values, state.continuity, etc. as needed
 */
export function createTestRuntimeState(slotCount: number = 100): RuntimeState {
  return createRuntimeState(slotCount);
}

/**
 * Create a mock RuntimeState structure for testing continuity.
 *
 * Creates a freshly initialized RuntimeState and merges in any overrides.
 *
 * This is useful when tests need to manually construct state for unit testing
 * continuity logic in isolation.
 *
 * @param overrides - Optional partial state to merge in
 * @param slotCount - Number of value slots (default 100)
 * @returns A properly typed RuntimeState
 *
 * @example
 * const state = createMockRuntimeState({
 *   continuity: myContinuity,
 *   values: { objects: new Map() }
 * });
 * // Now state is properly typed and ready to use
 */
export function createMockRuntimeState(
  overrides?: Partial<RuntimeState>,
  slotCount: number = 100
): RuntimeState {
  const base = createRuntimeState(slotCount);
  return { ...base, ...overrides };
}
