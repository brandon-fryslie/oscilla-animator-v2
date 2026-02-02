/**
 * HCL Emission Utilities
 *
 * Shared helpers for emitting HCL text.
 * Used by both patch and composite serializers.
 */

/**
 * Check if a string is a valid HCL identifier.
 * Valid identifiers start with [a-zA-Z_] and continue with [a-zA-Z0-9_-].
 *
 * @param key - The string to check
 * @returns True if valid identifier, false otherwise
 */
export function isValidIdentifier(key: string): boolean {
  if (key.length === 0) return false;
  // Must start with letter or underscore
  if (!/[a-zA-Z_]/.test(key[0])) return false;
  // Rest must be alphanumeric, underscore, or dash
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(key)) return false;
  return true;
}

/**
 * Emit a key for an attribute or object entry.
 * If the key is not a valid identifier, quote it.
 *
 * @param key - The key to emit
 * @returns Quoted or unquoted key string
 */
export function emitKey(key: string): string {
  if (isValidIdentifier(key)) {
    return key;
  } else {
    // Quote the key and escape any quotes inside it
    return `"${key.replace(/"/g, '\\"')}"`;
  }
}

/**
 * Emit a value (HCL literal).
 *
 * Handles: number, string, boolean, null, arrays, objects.
 *
 * @param value - The value to emit
 * @returns HCL text representation
 */
export function emitValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'string') {
    // Escape double quotes
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  if (typeof value === 'boolean') {
    return value.toString();
  }
  if (value === null || value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(emitValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${emitKey(k)} = ${emitValue(v)}`)
      .join(', ');
    return `{ ${entries} }`;
  }
  // Fallback for unknown types
  return 'null';
}
