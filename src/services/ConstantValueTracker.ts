/**
 * Constant Value Tracker
 *
 * Tracks values for edges that were optimized away due to constant-folding.
 * This allows the debug system to show computed values for eliminated blocks.
 *
 * Example: If a Const block connected to a Multiply is folded, we can still
 * show the constant value even though the blocks don't exist at runtime.
 */

import type { Patch } from '../graph/Patch';
import type { CanonicalType } from '../core/canonical-types';
import { FLOAT } from '../core/canonical-types';
import { canonicalSignal } from '../core/canonical-types/canonical-type';
import { getAnyBlockDefinition } from '../blocks/registry';

/**
 * A constant value that can be displayed in the debug panel.
 */
export interface ConstantValue {
  /** The constant value */
  value: unknown;
  /** Type of the value */
  type: CanonicalType;
  /** Why this is a constant (for display) */
  reason: 'const-block' | 'default-value' | 'computed-constant';
  /** Human-readable explanation */
  description: string;
}

/**
 * Extract constant values from eliminated blocks.
 *
 * This is a best-effort attempt to provide debug values for edges
 * that don't map to runtime slots. It handles:
 * - Const blocks (easy - just read the parameter)
 * - Default sources with constant values
 * - Other simple constant expressions
 *
 * @param patch - Source patch
 * @param unmappedEdges - Edges that couldn't be mapped
 * @returns Map from edge ID to constant value
 */
export function extractConstantValues(
  patch: Patch,
  unmappedEdges: Array<{ edgeId: string; fromBlockId: string; fromPort: string }>
): Map<string, ConstantValue> {
  const constants = new Map<string, ConstantValue>();

  for (const unmapped of unmappedEdges) {
    const sourceBlock = patch.blocks.get(unmapped.fromBlockId as any);
    if (!sourceBlock) continue;

    const blockDef = getAnyBlockDefinition(sourceBlock.type);
    if (!blockDef) continue;

    // Handle Const blocks
    if (sourceBlock.type === 'const') {
      const params: Record<string, unknown> = sourceBlock.params as any;
      const valueParam = params['value'];
      const outputPort = blockDef.outputs[0]; // Const has one output

      if (valueParam !== undefined && outputPort) {
        // Use basic float signal type
        const floatType = canonicalSignal(FLOAT);
        constants.set(unmapped.edgeId, {
          value: valueParam,
          type: floatType,
          reason: 'const-block',
          description: `Constant value from ${sourceBlock.type} block`,
        });
      }
    }

    // Handle other constant blocks (e.g., Pi, E, etc.)
    // These blocks have no params but output constant values
    if (sourceBlock.type === 'pi' || sourceBlock.type === 'e' || sourceBlock.type === 'tau') {
      let value: number;
      switch (sourceBlock.type) {
        case 'pi':
          value = Math.PI;
          break;
        case 'e':
          value = Math.E;
          break;
        case 'tau':
          value = Math.PI * 2;
          break;
        default:
          continue;
      }

      const floatType = canonicalSignal(FLOAT);
      constants.set(unmapped.edgeId, {
        value,
        type: floatType,
        reason: 'const-block',
        description: `Constant ${sourceBlock.type} = ${value.toFixed(6)}`,
      });
    }

    // TODO: Handle default sources with constant values
    // TODO: Handle computed constants (e.g., 2 + 3 folded to 5)
  }

  return constants;
}
