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
 * Create a mapping for testing.
 *
 * @param newToOld - Array mapping new indices to old indices (-1 means unmapped)
 * @returns A MappingState
 *
 * @example
 * const mapping = mockMapping([0, 1, -1, 2]);
 * // Element 0 maps to old 0, element 1 to old 1, element 2 is new, element 3 maps to old 2
 */
export function mockMapping(newToOld: (number | -1)[]): MappingState {
  return { newToOld: new Int32Array(newToOld) };
}

/**
 * Create an identity mapping for testing.
 *
 * @param count - Number of elements
 * @returns A MappingState where newToOld[i] === i
 */
export function mockIdentityMapping(count: number): MappingState {
  const newToOld = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    newToOld[i] = i;
  }
  return { newToOld };
}

// Legacy aliases for backward compatibility with tests
export const mockByIdMapping = mockMapping;
export const mockPositionMapping = mockMapping;

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
