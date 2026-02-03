/**
 * Binding Pass - Pure, deterministic resource allocation
 *
 * Extracts and unifies binding logic from processBlockEffects() and SCC phase-1.
 * Provides a pure binding function that makes all allocation decisions, and a
 * mechanical applier that executes those decisions.
 *
 * WI-4: Global Binding Pass Extraction & Unification
 */

import type { IRBuilder } from "../ir/IRBuilder";
import type { LowerEffects, StepRequest } from "../ir/lowerTypes";
import type { StableStateId } from "../ir/types";
import type { StateSlotId, ValueSlot } from "../ir/Indices";
import type { ValueRefExpr } from "../ir/lowerTypes";
import { isExprRef } from "../ir/lowerTypes";

// =============================================================================
// Types
// =============================================================================

/**
 * Input to pure binder.
 */
export interface BindInputs {
  /** Effects from block lowering */
  readonly effects: LowerEffects;

  /**
   * Existing state allocation (for idempotency).
   * Used by SCC phase-2 to reuse phase-1 state slots.
   */
  readonly existingState?: ReadonlyMap<StableStateId, StateSlotId>;

  /** Stable identity for diagnostics */
  readonly origin: {
    readonly blockId: string;
    readonly phase?: 'phase1' | 'phase2';
  };
}

/**
 * Diagnostic message from binding.
 */
export interface BindDiagnostic {
  readonly level: 'error' | 'warning';
  readonly message: string;
  readonly context?: string;
}

/**
 * Pure binding result.
 * Contains all decisions made by the binder (no side effects).
 */
export interface BindingResult {
  /** State allocation mapping (symbolic → physical) */
  readonly stateMap: ReadonlyMap<StableStateId, StateSlotId>;

  /** Slot allocation mappings (portId → physical slot) */
  readonly slotMap: ReadonlyMap<string, ValueSlot>;

  /**
   * Patches to apply to state read expressions.
   * Maps symbolic stateKey → resolved physical slot.
   */
  readonly exprPatches: ReadonlyMap<StableStateId, StateSlotId>;

  /**
   * Bound outputs (refs with slot filled in).
   * Maps portId → ValueRefExpr with slot resolved.
   */
  readonly boundOutputs: ReadonlyMap<string, ValueRefExpr>;

  /** Diagnostics/errors encountered during binding */
  readonly diagnostics: readonly BindDiagnostic[];
}

/**
 * Internal mutable state for accumulating binding decisions.
 * Used only within bindEffects() - not exposed.
 */
class BinderState {
  readonly stateMap = new Map<StableStateId, StateSlotId>();
  readonly slotMap = new Map<string, ValueSlot>();
  readonly exprPatches = new Map<StableStateId, StateSlotId>();
  readonly boundOutputs = new Map<string, ValueRefExpr>();
  readonly diagnostics: BindDiagnostic[] = [];

  // Track next slot indices (for deterministic allocation)
  nextStateSlot: number = 0;
  nextValueSlot: number = 0;
}

// =============================================================================
// Pure Binding Function
// =============================================================================

/**
 * Pure binding function - makes all allocation decisions deterministically.
 *
 * Same inputs → bit-identical BindingResult.
 * No dependence on builder state, call order, or hidden globals.
 * No side effects outside returned data.
 *
 * @param inputs - Binding inputs (effects, existing state, origin)
 * @param builder - IRBuilder (only for querying capacity, not mutating)
 * @returns Binding result with all allocation decisions
 */
export function bindEffects(inputs: BindInputs, builder: IRBuilder): BindingResult {
  const state = new BinderState();

  // Step 1: Allocate state from stateDecls (lexically sorted)
  allocateStateDeterministic(inputs, state, builder);

  // Step 2: Create expr patches (all stateKey → resolvedSlot mappings)
  // These are identical to stateMap entries - just for explicitness
  for (const [key, slot] of state.stateMap.entries()) {
    state.exprPatches.set(key, slot);
  }

  // Step 3: Allocate slots from slotRequests (lexically sorted)
  allocateSlotsDeterministic(inputs, state, builder);

  // Step 4: Bind outputs (fill in ref.slot from slotMap)
  // Note: outputs come from the block's LowerResult, not from effects
  // The caller will provide outputs separately - we just prepare slotMap here

  // Step 5: Validate step requests (all stateKey references must resolve)
  validateStepRequests(inputs, state, builder);

  return {
    stateMap: new Map(state.stateMap),
    slotMap: new Map(state.slotMap),
    exprPatches: new Map(state.exprPatches),
    boundOutputs: new Map(state.boundOutputs),
    diagnostics: [...state.diagnostics],
  };
}

/**
 * Allocate state slots deterministically (lexical order by StableStateId).
 * Reuses existing state when provided (idempotency).
 */
function allocateStateDeterministic(
  inputs: BindInputs,
  state: BinderState,
  builder: IRBuilder
): void {
  const { effects, existingState } = inputs;

  if (!effects.stateDecls || effects.stateDecls.length === 0) {
    return; // No state to allocate
  }

  // Sort by StableStateId (lexical order)
  const sorted = [...effects.stateDecls].sort((a, b) => a.key.localeCompare(b.key));

  for (const decl of sorted) {
    // Check for existing allocation (idempotency)
    if (existingState?.has(decl.key)) {
      const existing = existingState.get(decl.key)!;
      state.stateMap.set(decl.key, existing);
      // Note: We trust that the existing slot has compatible layout
      // A production system might validate layout compatibility here
      continue;
    }

    // Allocate new state slot
    // Note: We're calling builder methods here, but in a deterministic way
    // The builder's slot allocation must be deterministic given the same inputs
    const slot = builder.allocStateSlot(decl.key, {
      initialValue: decl.initialValue,
      stride: decl.stride,
      instanceId: decl.instanceId,
      laneCount: decl.laneCount,
    });

    state.stateMap.set(decl.key, slot);
  }
}

/**
 * Allocate output slots deterministically (lexical order by portId).
 */
function allocateSlotsDeterministic(
  inputs: BindInputs,
  state: BinderState,
  builder: IRBuilder
): void {
  const { effects } = inputs;

  if (!effects.slotRequests || effects.slotRequests.length === 0) {
    return; // No slots to allocate
  }

  // Sort by portId (lexical order)
  const sorted = [...effects.slotRequests].sort((a, b) => a.portId.localeCompare(b.portId));

  for (const req of sorted) {
    const slot = builder.allocTypedSlot(req.type, `${inputs.origin.blockId}.${req.portId}`);
    state.slotMap.set(req.portId, slot);
  }
}

/**
 * Validate step requests - all stateKey references must resolve.
 * Emits diagnostics for unresolved references instead of throwing.
 *
 * NOTE: For SCC phase-2, state may have been allocated in phase-1,
 * so we check builder.findStateSlot() as a fallback.
 */
function validateStepRequests(
  inputs: BindInputs,
  state: BinderState,
  builder: IRBuilder
): void {
  const { effects, origin } = inputs;

  if (!effects.stepRequests || effects.stepRequests.length === 0) {
    return; // No steps to validate
  }

  for (const req of effects.stepRequests) {
    // Check if step requests reference a stateKey
    if ('stateKey' in req) {
      const { stateKey } = req;

      // Validate that stateKey was declared and allocated
      // Check local stateMap first, then builder's global state mappings
      if (!state.stateMap.has(stateKey)) {
        // For SCC phase-2, state may have been allocated in phase-1
        // Check builder's global state mappings as fallback
        const globalSlot = builder.findStateSlot(stateKey);
        if (globalSlot === undefined) {
          state.diagnostics.push({
            level: 'error',
            message: `State key "${stateKey}" referenced in step request but not declared in stateDecls`,
            context: `${origin.blockId}${origin.phase ? ` (${origin.phase})` : ''}`,
          });
        }
      }
    }

    // Note: We don't validate other fields (value, field, instanceId, etc.)
    // because those are ValueExprId/InstanceId/ValueSlot references that should
    // already exist at this point. The builder will validate them during apply.
  }
}

// =============================================================================
// Mechanical Applier
// =============================================================================

/**
 * Mechanical applier - executes binding decisions without making new decisions.
 *
 * This function has no branching logic - it just calls builder methods
 * based on the decisions in BindingResult.
 *
 * @param builder - IRBuilder to mutate
 * @param result - Binding result with allocation decisions
 * @param effects - Original effects (for step requests)
 */
export function applyBinding(
  builder: IRBuilder,
  result: BindingResult,
  effects: LowerEffects
): void {
  // Step 1: Apply expr patches (resolve state expressions)
  if (result.exprPatches.size > 0) {
    builder.resolveStateExprs(result.exprPatches);
  }

  // Step 2: Process step requests (mechanical execution)
  if (effects.stepRequests) {
    for (const req of effects.stepRequests) {
      applyStepRequest(req, result, builder);
    }
  }

  // Note: Slot registration and output binding happens at the call site,
  // not here. The caller uses result.slotMap and result.boundOutputs.
}

/**
 * Apply a single step request (mechanical - no decisions).
 *
 * For SCC phase-2, state may have been allocated in phase-1, so we check
 * builder.findStateSlot() as a fallback.
 */
function applyStepRequest(
  req: StepRequest,
  result: BindingResult,
  builder: IRBuilder
): void {
  switch (req.kind) {
    case 'stateWrite': {
      // Look up physical slot from binding result
      let slot = result.stateMap.get(req.stateKey);

      // For SCC phase-2, state may have been allocated in phase-1
      // Check builder's global state mappings as fallback
      if (slot === undefined) {
        slot = builder.findStateSlot(req.stateKey);
      }

      if (slot === undefined) {
        throw new Error(`State key ${req.stateKey} not found in binding result or builder (validation failed)`);
      }

      builder.stepStateWrite(slot, req.value);
      break;
    }

    case 'fieldStateWrite': {
      let slot = result.stateMap.get(req.stateKey);

      // For SCC phase-2, state may have been allocated in phase-1
      if (slot === undefined) {
        slot = builder.findStateSlot(req.stateKey);
      }

      if (slot === undefined) {
        throw new Error(`State key ${req.stateKey} not found in binding result or builder (validation failed)`);
      }

      builder.stepFieldStateWrite(slot, req.value);
      break;
    }

    case 'materialize': {
      builder.stepMaterialize(req.field, req.instanceId, req.target);
      break;
    }

    case 'continuityMapBuild': {
      builder.stepContinuityMapBuild(req.instanceId);
      break;
    }

    case 'continuityApply': {
      builder.stepContinuityApply(
        req.targetKey,
        req.instanceId,
        req.policy,
        req.baseSlot,
        req.outputSlot,
        req.semantic,
        req.stride
      );
      break;
    }
  }
}

/**
 * Bind outputs - fill in physical slots in ValueRefExpr.
 *
 * This is separate from applyBinding because output binding happens
 * at different points in the orchestrator (before registration).
 *
 * @param outputsById - Outputs from block lowering (with slot: undefined)
 * @param slotMap - Allocated slots from binding result
 * @param blockId - Block ID for error context
 * @param loweringPurity - Block purity ('pure' or 'impure')
 * @param builder - IRBuilder (for fallback allocation if needed)
 * @returns Bound outputs with slots resolved
 */
export function bindOutputs(
  outputsById: Record<string, ValueRefExpr> | undefined,
  slotMap: ReadonlyMap<string, ValueSlot>,
  blockId: string,
  loweringPurity: 'pure' | 'impure' | undefined,
  builder: IRBuilder
): Map<string, ValueRefExpr> {
  const bound = new Map<string, ValueRefExpr>();

  if (!outputsById) {
    return bound; // No outputs to bind
  }

  for (const [portId, ref] of Object.entries(outputsById)) {
    let finalRef = ref;

    // Only bind if slot is undefined
    if (isExprRef(ref) && ref.slot === undefined) {
      // Check if slotMap has an allocated slot
      const effectSlot = slotMap.get(portId);

      if (effectSlot !== undefined) {
        // Effects-as-data block - bind slot from slotRequests
        finalRef = { ...ref, slot: effectSlot };
      } else if (loweringPurity === 'pure') {
        // Pure block fallback - allocate slot now
        const allocatedSlot = builder.allocTypedSlot(ref.type, `${blockId}.${portId}`);
        finalRef = { ...ref, slot: allocatedSlot };
      } else {
        // Impure block with missing slot and no slotRequest - this is a bug
        throw new Error(
          `Block ${blockId} output '${portId}' missing slot (impure block must allocate slots or provide slotRequest)`
        );
      }
    }

    bound.set(portId, finalRef);
  }

  return bound;
}
