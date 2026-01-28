/**
 * Canonical Name Utilities
 *
 * Canonical names are normalized, unique identifiers derived from Block displayNames.
 * They form the basis for the addressing system, providing stable, human-readable
 * references to graph elements.
 *
 * SINGLE SOURCE OF TRUTH: This module is the ONLY place where canonical name
 * normalization is implemented. All other modules MUST use these functions.
 */

import type { Patch } from '../graph/Patch';

/**
 * Special characters allowed in displayName but stripped for canonical names.
 * These are removed entirely (not replaced).
 *
 * NOTE: Hyphens (-), underscores (_), and numbers are PRESERVED as they're useful
 * for readable names like "my-circle", "block_1", etc.
 *
 * Stripped chars: ! @ # $ & ( ) [ ] { } | ' " + = * ^ % < > ? .
 */
const CANONICAL_STRIP_CHARS = /[!@#$&()\[\]{}|'"+=*^%<>?.]/g;

/**
 * Convert displayName to canonical name.
 *
 * Normalization rules:
 * 1. Strip special characters: !@#$&()[]{}|'"+=*^%<>?.
 * 2. Replace whitespace sequences with single underscores
 * 3. Convert to lowercase
 *
 * PRESERVED: Hyphens, underscores, alphanumerics
 *
 * Examples:
 * - "My Circle!" → "my_circle"
 * - "My Block! (it's a great block-o)" → "my_block_its_a_great_block-o"
 * - "My Block" → "my_block"
 * - "my block" → "my_block" (collision!)
 *
 * This is the SINGLE SOURCE OF TRUTH for canonical naming.
 * Never duplicate this logic elsewhere.
 *
 * @param displayName - The human-readable display name
 * @returns Normalized canonical name (may be empty string for invalid inputs)
 */
export function normalizeCanonicalName(displayName: string): string {
  return displayName
    .replace(CANONICAL_STRIP_CHARS, '') // Strip special chars
    .replace(/\s+/g, '_') // Replace whitespace with underscores
    .toLowerCase(); // Lowercase
}

/**
 * Detect if displayNames produce collisions in canonical form.
 *
 * Collisions occur when multiple displayNames normalize to the same canonical name:
 * - "My Block!" and "My block" both → "my_block"
 * - "Circle 1" and "Circle  1" both → "circle_1" (multiple spaces)
 *
 * @param displayNames - Array of display names to check
 * @returns Object with collisions array containing canonical names that appear >1 time
 */
export function detectCanonicalNameCollisions(displayNames: string[]): {
  collisions: string[];
} {
  const canonical = new Map<string, string[]>();

  for (const name of displayNames) {
    const norm = normalizeCanonicalName(name);
    if (!canonical.has(norm)) {
      canonical.set(norm, []);
    }
    canonical.get(norm)!.push(name);
  }

  return {
    collisions: Array.from(canonical.entries())
      .filter(([_, names]) => names.length > 1)
      .map(([norm]) => norm),
  };
}

/**
 * Validate that all block displayNames are unique in canonical form.
 *
 * This enforces the uniqueness constraint required for addressing:
 * - Each canonical name must map to exactly one block
 * - Case-insensitive: "My Block" and "my block" are collisions
 *
 * @param patch - The patch to validate
 * @returns Error object if collisions found, null if valid
 */
export function validateDisplayNameUniqueness(patch: Patch): PatchError | null {
  const displayNames = Array.from(patch.blocks.values())
    .map(b => b.displayName)
    .filter((name): name is string => name !== null && name !== '');

  const { collisions } = detectCanonicalNameCollisions(displayNames);

  if (collisions.length > 0) {
    // Build detailed error message showing which displayNames collide
    const canonical = new Map<string, string[]>();
    for (const block of patch.blocks.values()) {
      if (!block.displayName) continue;
      const norm = normalizeCanonicalName(block.displayName);
      if (!canonical.has(norm)) {
        canonical.set(norm, []);
      }
      canonical.get(norm)!.push(block.displayName);
    }

    const details = collisions
      .map(norm => {
        const names = canonical.get(norm) || [];
        return `  "${norm}" ← [${names.map(n => `"${n}"`).join(', ')}]`;
      })
      .join('\n');

    return {
      kind: 'DISPLAYNAME_COLLISION',
      message:
        `Block displayName collisions detected. The following canonical names are not unique:\n${details}\n\n` +
        `DisplayNames must be unique when normalized (special chars stripped, lowercase).`,
    };
  }

  return null;
}

/**
 * Check if a value is a valid displayName.
 *
 * DisplayNames are very permissive - any non-empty string is valid.
 * Empty strings and null are allowed (blocks without displayNames fall back to blockId).
 *
 * @param name - Value to check
 * @returns True if valid displayName (non-empty string), false otherwise
 */
export function isValidDisplayName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0;
}

/**
 * Error type for patch validation failures.
 */
export interface PatchError {
  readonly kind: string;
  readonly message: string;
}

// =============================================================================
// Adapter ID Generation (Sprint 2026-01-27)
// =============================================================================

/**
 * Generate a deterministic adapter ID from a source address.
 *
 * Adapter IDs are used for resource addressing:
 *   `v1:blocks.{block}.inputs.{port}.adapters.{adapter_id}`
 *
 * The ID is derived from the source address to ensure:
 * - Determinism: Same source address always produces same ID
 * - Uniqueness: Different source addresses produce different IDs
 * - Readability: IDs are short and human-readable
 *
 * Format: `adapter_{hash}` where hash is a short alphanumeric string
 * derived from the source address.
 *
 * @param sourceAddress - Canonical address of the source output (e.g., "v1:blocks.c1.outputs.value")
 * @returns Deterministic adapter ID
 */
export function generateAdapterId(sourceAddress: string): string {
  // Use a simple hash based on the source address
  // We want short, readable IDs that are still deterministic
  const hash = simpleHash(sourceAddress);
  return `adapter_${hash}`;
}

/**
 * Generate a deterministic adapter ID with an explicit index.
 *
 * Use this when you need to generate multiple adapter IDs for the same port
 * and want explicit ordering control.
 *
 * @param portId - The input port ID
 * @param index - Sequential index (0-based)
 * @returns Deterministic adapter ID like "adapter_0", "adapter_1", etc.
 */
export function generateAdapterIdByIndex(portId: string, index: number): string {
  return `adapter_${index}`;
}

/**
 * Simple string hash that produces a short alphanumeric string.
 *
 * This is NOT cryptographic - it's for generating deterministic IDs.
 * Collisions are theoretically possible but extremely unlikely for
 * the expected input space (canonical addresses).
 *
 * @param str - Input string to hash
 * @returns 6-character alphanumeric hash
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to positive number and then to base36 (alphanumeric)
  const positive = Math.abs(hash);
  return positive.toString(36).slice(0, 6).padStart(6, '0');
}
