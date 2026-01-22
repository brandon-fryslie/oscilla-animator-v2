/**
 * State Migration Module
 *
 * Migrates stateful primitive state across hot-swap using stable StateIds.
 * Uses the continuity mapping service for lane remapping in field state.
 *
 * Key principle: State identity is semantic (StateId), not positional (slot index).
 * Lane remapping uses the same infrastructure as continuity buffers.
 *
 * @module runtime/StateMigration
 */

import type { StateMapping, StableStateId } from '../compiler/ir/types';
import type { MappingState } from './ContinuityState';

/**
 * Result of state migration.
 */
export interface StateMigrationResult {
  /** Whether migration was performed */
  migrated: boolean;
  /** Number of scalar states migrated */
  scalarsMigrated: number;
  /** Number of field states migrated */
  fieldsMigrated: number;
  /** Number of states initialized with defaults (new states) */
  initialized: number;
  /** Number of states discarded (removed states) */
  discarded: number;
  /** Diagnostic info for each state */
  details: StateMigrationDetail[];
}

export interface StateMigrationDetail {
  stateId: StableStateId;
  action: 'migrated' | 'initialized' | 'discarded';
  kind: 'scalar' | 'field';
  lanesMigrated?: number;
  lanesInitialized?: number;
}

/**
 * Migrate state from old program to new program.
 *
 * For scalar state: direct copy if StateId matches.
 * For field state: use lane mapping from continuity service if available.
 *
 * @param oldState - Old state array
 * @param newState - New state array (will be modified in place)
 * @param oldMappings - State mappings from old program
 * @param newMappings - State mappings from new program
 * @param getLaneMapping - Function to get lane mapping for an instance
 * @returns Migration result with diagnostics
 */
export function migrateState(
  oldState: Float64Array,
  newState: Float64Array,
  oldMappings: readonly StateMapping[],
  newMappings: readonly StateMapping[],
  getLaneMapping: (instanceId: string) => MappingState | null
): StateMigrationResult {
  const result: StateMigrationResult = {
    migrated: false,
    scalarsMigrated: 0,
    fieldsMigrated: 0,
    initialized: 0,
    discarded: 0,
    details: [],
  };

  // Build lookup from old mappings
  const oldByStateId = new Map<StableStateId, StateMapping>();
  for (const mapping of oldMappings) {
    oldByStateId.set(mapping.stateId, mapping);
  }

  // Track which old states were migrated (for discard count)
  const migratedOldIds = new Set<StableStateId>();

  // Process each new state mapping
  for (const newMapping of newMappings) {
    const oldMapping = oldByStateId.get(newMapping.stateId);

    if (!oldMapping) {
      // New state - initialize with defaults
      initializeState(newState, newMapping);
      result.initialized++;
      result.details.push({
        stateId: newMapping.stateId,
        action: 'initialized',
        kind: newMapping.kind,
      });
      continue;
    }

    // State exists in both - migrate
    migratedOldIds.add(newMapping.stateId);

    if (newMapping.kind === 'scalar' && oldMapping.kind === 'scalar') {
      // Scalar to scalar: direct copy
      migrateScalarState(oldState, newState, oldMapping, newMapping);
      result.scalarsMigrated++;
      result.details.push({
        stateId: newMapping.stateId,
        action: 'migrated',
        kind: 'scalar',
      });
    } else if (newMapping.kind === 'field' && oldMapping.kind === 'field') {
      // Field to field: use lane mapping
      const laneMapping = getLaneMapping(newMapping.instanceId);
      const migrationInfo = migrateFieldState(
        oldState,
        newState,
        oldMapping,
        newMapping,
        laneMapping
      );
      result.fieldsMigrated++;
      result.details.push({
        stateId: newMapping.stateId,
        action: 'migrated',
        kind: 'field',
        lanesMigrated: migrationInfo.lanesMigrated,
        lanesInitialized: migrationInfo.lanesInitialized,
      });
    } else {
      // Cardinality changed (scalar<->field) - reinitialize
      // This is a semantic change, can't migrate
      initializeState(newState, newMapping);
      result.initialized++;
      result.details.push({
        stateId: newMapping.stateId,
        action: 'initialized',
        kind: newMapping.kind,
      });
    }
  }

  // Count discarded states (in old but not in new)
  for (const oldMapping of oldMappings) {
    if (!migratedOldIds.has(oldMapping.stateId)) {
      result.discarded++;
      result.details.push({
        stateId: oldMapping.stateId,
        action: 'discarded',
        kind: oldMapping.kind,
      });
    }
  }

  result.migrated = result.scalarsMigrated > 0 || result.fieldsMigrated > 0;
  return result;
}

/**
 * Initialize state with default values.
 */
function initializeState(
  state: Float64Array,
  mapping: StateMapping
): void {
  if (mapping.kind === 'scalar') {
    for (let i = 0; i < mapping.stride; i++) {
      state[mapping.slotIndex + i] = mapping.initial[i];
    }
  } else {
    // Field: initialize all lanes
    for (let lane = 0; lane < mapping.laneCount; lane++) {
      for (let i = 0; i < mapping.stride; i++) {
        state[mapping.slotStart + lane * mapping.stride + i] = mapping.initial[i];
      }
    }
  }
}

/**
 * Migrate scalar state (direct copy).
 */
function migrateScalarState(
  oldState: Float64Array,
  newState: Float64Array,
  oldMapping: StateMapping & { kind: 'scalar' },
  newMapping: StateMapping & { kind: 'scalar' }
): void {
  // Copy each element of the stride
  const copyStride = Math.min(oldMapping.stride, newMapping.stride);
  for (let i = 0; i < copyStride; i++) {
    newState[newMapping.slotIndex + i] = oldState[oldMapping.slotIndex + i];
  }
  // Initialize any new stride elements with defaults
  for (let i = copyStride; i < newMapping.stride; i++) {
    newState[newMapping.slotIndex + i] = newMapping.initial[i];
  }
}

/**
 * Migrate field state using lane mapping.
 */
function migrateFieldState(
  oldState: Float64Array,
  newState: Float64Array,
  oldMapping: StateMapping & { kind: 'field' },
  newMapping: StateMapping & { kind: 'field' },
  laneMapping: MappingState | null
): { lanesMigrated: number; lanesInitialized: number } {
  let lanesMigrated = 0;
  let lanesInitialized = 0;

  const stride = newMapping.stride;

  if (!laneMapping || laneMapping.kind === 'identity') {
    // No mapping or identity mapping: copy by index
    const copyCount = Math.min(oldMapping.laneCount, newMapping.laneCount);
    const copyStride = Math.min(oldMapping.stride, newMapping.stride);

    for (let lane = 0; lane < copyCount; lane++) {
      for (let i = 0; i < copyStride; i++) {
        newState[newMapping.slotStart + lane * stride + i] =
          oldState[oldMapping.slotStart + lane * oldMapping.stride + i];
      }
      // Initialize any new stride elements
      for (let i = copyStride; i < stride; i++) {
        newState[newMapping.slotStart + lane * stride + i] = newMapping.initial[i];
      }
      lanesMigrated++;
    }

    // Initialize new lanes
    for (let lane = copyCount; lane < newMapping.laneCount; lane++) {
      for (let i = 0; i < stride; i++) {
        newState[newMapping.slotStart + lane * stride + i] = newMapping.initial[i];
      }
      lanesInitialized++;
    }
  } else {
    // Use lane mapping (byId or byPosition)
    const newToOld = laneMapping.newToOld;

    for (let newLane = 0; newLane < newMapping.laneCount; newLane++) {
      const oldLane = newToOld[newLane];

      if (oldLane >= 0 && oldLane < oldMapping.laneCount) {
        // Mapped: copy from old lane
        const copyStride = Math.min(oldMapping.stride, newMapping.stride);
        for (let i = 0; i < copyStride; i++) {
          newState[newMapping.slotStart + newLane * stride + i] =
            oldState[oldMapping.slotStart + oldLane * oldMapping.stride + i];
        }
        // Initialize any new stride elements
        for (let i = copyStride; i < stride; i++) {
          newState[newMapping.slotStart + newLane * stride + i] = newMapping.initial[i];
        }
        lanesMigrated++;
      } else {
        // Unmapped (-1): initialize with defaults
        for (let i = 0; i < stride; i++) {
          newState[newMapping.slotStart + newLane * stride + i] = newMapping.initial[i];
        }
        lanesInitialized++;
      }
    }
  }

  return { lanesMigrated, lanesInitialized };
}

/**
 * Create a fresh state array initialized from mappings.
 * Used for initial compile (no old state to migrate from).
 */
export function createInitialState(
  stateSlotCount: number,
  mappings: readonly StateMapping[]
): Float64Array {
  const state = new Float64Array(stateSlotCount);
  for (const mapping of mappings) {
    initializeState(state, mapping);
  }
  return state;
}
