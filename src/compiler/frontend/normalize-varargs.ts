/**
 * Pass 4: Varargs Connection Validation
 *
 * Validates and resolves vararg connections in the patch.
 * Runs after default sources (pass1) and adapters (pass2) but before indexing (pass3).
 *
 * Responsibilities:
 * - Validate vararg connection addresses exist
 * - Validate payload type constraints (must be float)
 * - Validate cardinality constraints (signal/field/any)
 * - Sort connections by sortKey
 * - Produce diagnostics for invalid references
 *
 * NOTE: This pass does NOT modify the patch - it only validates.
 * The patch is immutable; errors are collected in the error list.
 */

import type { Patch } from '../../graph/Patch';
import { AddressRegistry } from '../../graph/address-registry';
import { isVarargInput, requireBlockDef, type VarargConstraint } from '../../blocks/registry';
import { addressToString } from '../../types/canonical-address';

// =============================================================================
// Error Types
// =============================================================================

export interface VarargError {
  readonly kind: 'vararg';
  readonly code: 'InvalidAddress' | 'TypeMismatch' | 'CardinalityMismatch' | 'ConnectionLimit';
  readonly message: string;
  readonly where: {
    readonly blockId: string;
    readonly portId: string;
    readonly connectionIndex?: number;
  };
}

// =============================================================================
// Validation Result
// =============================================================================

export interface Pass4Result {
  readonly kind: 'ok' | 'error';
  readonly patch: Patch; // Unchanged - pass is read-only
  readonly errors: readonly VarargError[];
}

// =============================================================================
// Main Pass
// =============================================================================

/**
 * Validate vararg connections in the patch.
 *
 * This pass is read-only - it validates but does not modify the patch.
 * Errors are collected and returned; valid patches pass through unchanged.
 *
 * @param patch - The patch to validate
 * @returns Pass4Result with validation errors
 */
export function pass4Varargs(patch: Patch): Pass4Result {
  const errors: VarargError[] = [];
  const registry = AddressRegistry.buildFromPatch(patch);

  // Validate each block's vararg inputs
  for (const block of patch.blocks.values()) {
    const blockDef = requireBlockDef(block.type);

    // Check each input port
    for (const [portId, port] of block.inputPorts.entries()) {
      const inputDef = blockDef.inputs[portId];
      if (!inputDef) {
        // Port not defined in registry - skip (other passes handle this)
        continue;
      }

      // Only validate vararg inputs
      if (!isVarargInput(inputDef)) {
        // Normal input - skip (edges validated elsewhere)
        continue;
      }

      // This is a vararg input - validate
      const connections = port.varargConnections ?? [];
      const constraint = inputDef.varargConstraint!; // Guaranteed by registerBlock validation

      // Validate connection count
      if (constraint.minConnections !== undefined && connections.length < constraint.minConnections) {
        errors.push({
          kind: 'vararg',
          code: 'ConnectionLimit',
          message: `Vararg input requires at least ${constraint.minConnections} connections, got ${connections.length}`,
          where: { blockId: block.id, portId },
        });
      }

      if (constraint.maxConnections !== undefined && connections.length > constraint.maxConnections) {
        errors.push({
          kind: 'vararg',
          code: 'ConnectionLimit',
          message: `Vararg input allows at most ${constraint.maxConnections} connections, got ${connections.length}`,
          where: { blockId: block.id, portId },
        });
      }

      // Validate each connection
      for (let i = 0; i < connections.length; i++) {
        const conn = connections[i];

        // Validate address exists
        const resolved = registry.resolve(conn.sourceAddress);
        if (!resolved) {
          errors.push({
            kind: 'vararg',
            code: 'InvalidAddress',
            message: `Vararg connection references invalid address: ${conn.sourceAddress}`,
            where: { blockId: block.id, portId, connectionIndex: i },
          });
          continue; // Skip further validation for this connection
        }

        // Address must be an output
        if (resolved.kind !== 'output') {
          errors.push({
            kind: 'vararg',
            code: 'InvalidAddress',
            message: `Vararg connection must reference an output, got ${resolved.kind}`,
            where: { blockId: block.id, portId, connectionIndex: i },
          });
          continue;
        }

        // Validate payload type
        // NOTE: Type resolution hasn't happened yet, so we can't check actual types.
        // This validation will be done in compiler pass1/pass2 (type resolution).
        // For now, we only validate that the address exists.

        // Validate cardinality constraint
        // NOTE: Similar to payload, cardinality is resolved during type resolution.
        // This pass only validates structural correctness (address exists, is an output).
      }
    }
  }

  return {
    kind: errors.length === 0 ? 'ok' : 'error',
    patch, // Unchanged
    errors,
  };
}
