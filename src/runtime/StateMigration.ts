/**
 * State Migration Module
 *
 * Migrates stateful primitive state across hot-swap using stable StateIds.
 *
 * Key principle: State identity is semantic (StateId), not positional (slot index).
 *
 * @module runtime/StateMigration
 */

import type {
  FieldSlotDecl,
  ScalarSlotDecl,
  StateMapping,
  StableStateId,
} from '../compiler/ir/types';

/**
 * Lane remapping state for field state migration.
 * Maps new lane indices to old lane indices (-1 = no mapping).
 */
export interface MappingState {
  readonly newToOld: Int32Array;
}

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
  reason?: 'missingOldState' | 'kindChanged' | 'removed';
  lanesMigrated?: number;
  lanesInitialized?: number;
}

function isScalarStateMapping(mapping: StateMapping): mapping is ScalarSlotDecl {
  return mapping.laneCount === 1 && mapping.instanceId === undefined;
}

function isFieldStateMapping(mapping: StateMapping): mapping is FieldSlotDecl {
  // [LAW:one-source-of-truth] instanceId determines field semantics even when laneCount is 1.
  return mapping.instanceId !== undefined;
}

function mappingKind(mapping: StateMapping): 'scalar' | 'field' {
  return mapping.instanceId !== undefined ? 'field' : 'scalar';
}

/**
 * Migrate state from old program to new program.
 *
 * For scalar state: direct copy if state identity matches.
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
  oldState: Float32Array,
  newState: Float32Array,
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

  // Build lookup from old mappings by stateId.
  const oldByStateId = new Map<StableStateId, StateMapping>();
  for (const mapping of oldMappings) {
    oldByStateId.set(mapping.stateId, mapping);
  }

  // Track which old stateIds were migrated (for discard count)
  const migratedOldStateIds = new Set<StableStateId>();

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
        kind: mappingKind(newMapping),
        reason: 'missingOldState',
      });
      continue;
    }

    // State exists in both - migrate
    migratedOldStateIds.add(newMapping.stateId);

    if (isScalarStateMapping(newMapping) && isScalarStateMapping(oldMapping)) {
      // Scalar to scalar: direct copy
      migrateScalarState(oldState, newState, oldMapping, newMapping);
      result.scalarsMigrated++;
      result.details.push({
        stateId: newMapping.stateId,
        action: 'migrated',
        kind: 'scalar',
      });
    } else if (isFieldStateMapping(newMapping) && isFieldStateMapping(oldMapping)) {
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
        kind: mappingKind(newMapping),
        reason: 'kindChanged',
      });
    }
  }

  // Count discarded states (in old but not migrated to new)
  for (const oldMapping of oldMappings) {
    if (!migratedOldStateIds.has(oldMapping.stateId)) {
      result.discarded++;
      result.details.push({
        stateId: oldMapping.stateId,
        action: 'discarded',
        kind: mappingKind(oldMapping),
        reason: 'removed',
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
  state: Float32Array,
  mapping: StateMapping
): void {
  for (let lane = 0; lane < mapping.laneCount; lane++) {
    for (let i = 0; i < mapping.stride; i++) {
      state[mapping.slotStart + lane * mapping.stride + i] = mapping.initial[i];
    }
  }
}

/**
 * Migrate scalar state (direct copy).
 */
function migrateScalarState(
  oldState: Float32Array,
  newState: Float32Array,
  oldMapping: ScalarSlotDecl,
  newMapping: ScalarSlotDecl
): void {
  // Copy each element of the stride
  const copyStride = Math.min(oldMapping.stride, newMapping.stride);
  for (let i = 0; i < copyStride; i++) {
    newState[newMapping.slotStart + i] = oldState[oldMapping.slotStart + i];
  }
  // Initialize any new stride elements with defaults
  for (let i = copyStride; i < newMapping.stride; i++) {
    newState[newMapping.slotStart + i] = newMapping.initial[i];
  }
}

/**
 * Migrate field state using lane mapping.
 */
function migrateFieldState(
  oldState: Float32Array,
  newState: Float32Array,
  oldMapping: FieldSlotDecl,
  newMapping: FieldSlotDecl,
  laneMapping: MappingState | null
): { lanesMigrated: number; lanesInitialized: number } {
  let lanesMigrated = 0;
  let lanesInitialized = 0;

  const stride = newMapping.stride;

  if (!laneMapping) {
    // [LAW:no-silent-fallbacks] Without an explicit lane mapping we only perform
    // index-based copy when layout is unchanged; otherwise initialize clean state.
    const canCopyByIndex =
      oldMapping.instanceId === newMapping.instanceId &&
      oldMapping.laneCount === newMapping.laneCount;
    if (!canCopyByIndex) {
      for (let lane = 0; lane < newMapping.laneCount; lane++) {
        for (let i = 0; i < stride; i++) {
          newState[newMapping.slotStart + lane * stride + i] = newMapping.initial[i];
        }
        lanesInitialized++;
      }
      return { lanesMigrated, lanesInitialized };
    }

    const copyStride = Math.min(oldMapping.stride, newMapping.stride);
    for (let lane = 0; lane < newMapping.laneCount; lane++) {
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
): Float32Array {
  const state = new Float32Array(stateSlotCount);
  for (const mapping of mappings) {
    initializeState(state, mapping);
  }
  return state;
}
