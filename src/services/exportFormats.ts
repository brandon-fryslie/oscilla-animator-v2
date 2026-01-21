/**
 * Export Format Utilities
 *
 * Provides formatting functions for patch export to markdown/text.
 * Pure functions for transforming patch data into concise, readable representations.
 */

import type { Block, Edge } from '../graph/Patch';
import type { BlockDef } from '../blocks/registry';

/**
 * Formats a block into shorthand notation: "b1:Array(count=5000)"
 * Omits parentheses if no non-default config values.
 *
 * @param block - The block to format
 * @param definition - The block definition from registry (for defaults)
 * @returns Shorthand string representation
 */
export function formatBlockShorthand(block: Block, definition?: BlockDef): string {
  const configParts: string[] = [];

  if (definition) {
    // Iterate through block params and compare against defaults
    for (const [key, currentValue] of Object.entries(block.params)) {
      const inputDef = definition.inputs[key];
      if (!inputDef) continue;

      const defaultValue = inputDef.value;
      if (!isNonDefault(currentValue, defaultValue)) continue;

      // Non-default value - format it
      const formattedValue = formatConfigValue(currentValue);
      configParts.push(`${key}=${formattedValue}`);
    }
  }

  // Format: "b1:Array" or "b1:Array(count=5000, seed=42)"
  const config = configParts.length > 0 ? `(${configParts.join(', ')})` : '';
  return `${block.id}:${block.type}${config}`;
}

/**
 * Formats a connection/edge as arrow notation: "b1.instances → b2.instances"
 *
 * @param edge - The edge to format
 * @param blocks - Map of all blocks (for looking up block existence)
 * @returns Arrow notation string
 */
export function formatConnectionLine(edge: Edge, blocks: ReadonlyMap<string, Block>): string {
  const fromBlock = blocks.get(edge.from.blockId);
  const toBlock = blocks.get(edge.to.blockId);

  if (!fromBlock || !toBlock) {
    // Defensive: edge references non-existent block
    return `${edge.from.blockId}.${edge.from.slotId} → ${edge.to.blockId}.${edge.to.slotId} [INVALID]`;
  }

  return `${edge.from.blockId}.${edge.from.slotId} → ${edge.to.blockId}.${edge.to.slotId}`;
}

/**
 * Formats a config value for display.
 * Handles primitives, arrays, objects, and expression strings.
 *
 * @param value - The value to format
 * @returns String representation
 */
export function formatConfigValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value; // Expression strings are strings
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    // Format as [1, 2, 3]
    return `[${value.map(formatConfigValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    // Format as {x: 1, y: 2}
    const entries = Object.entries(value).map(
      ([k, v]) => `${k}: ${formatConfigValue(v)}`
    );
    return `{${entries.join(', ')}}`;
  }
  return String(value);
}

/**
 * Determines if a current value differs from the default value.
 *
 * @param current - Current value from block.params
 * @param defaultValue - Default value from block definition
 * @returns true if current differs from default (should be shown)
 */
export function isNonDefault(current: unknown, defaultValue: unknown): boolean {
  // Undefined default means no default exists - always show value
  if (defaultValue === undefined) return true;

  // Deep equality for arrays and objects
  if (Array.isArray(current) && Array.isArray(defaultValue)) {
    if (current.length !== defaultValue.length) return true;
    return current.some((val, idx) => isNonDefault(val, defaultValue[idx]));
  }

  if (
    typeof current === 'object' &&
    current !== null &&
    typeof defaultValue === 'object' &&
    defaultValue !== null
  ) {
    const currentKeys = Object.keys(current);
    const defaultKeys = Object.keys(defaultValue);
    if (currentKeys.length !== defaultKeys.length) return true;

    return currentKeys.some((key) =>
      isNonDefault(
        (current as Record<string, unknown>)[key],
        (defaultValue as Record<string, unknown>)[key]
      )
    );
  }

  // Primitive comparison
  return current !== defaultValue;
}
