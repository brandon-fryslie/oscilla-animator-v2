/**
 * Reference Tokenizer for Expression Editor
 *
 * Parses expression text to identify block.port references and tokenize them.
 * Used by TokenExpressionEditor to render references as atomic chips.
 *
 * Algorithm:
 * 1. Scan expression text for IDENT.IDENT patterns
 * 2. For each pattern, check if it resolves to a valid block.port via AddressRegistry
 * 3. Return array of segments (text spans + metadata)
 */

import type { AddressRegistry } from '../../graph/address-registry';

// =============================================================================
// Types
// =============================================================================

/**
 * Tokenized segment of expression text.
 *
 * Each segment is either:
 * - Plain text (isReference = false)
 * - Valid reference (isReference = true, metadata populated)
 */
export interface TokenizedSegment {
  /** The text of this segment */
  readonly text: string;

  /** Whether this segment is a valid block.port reference */
  readonly isReference: boolean;

  /** Only for references: canonical block name (e.g., "circle_1") */
  readonly canonicalName?: string;

  /** Only for references: port ID (e.g., "radius") */
  readonly portId?: string;

  /** Only for references: full canonical address */
  readonly sourceAddress?: string;

  /** Only for references: whether this reference has a collect edge */
  readonly isConnected?: boolean;
}

// =============================================================================
// Tokenizer
// =============================================================================

/**
 * Regular expression to match potential block.port references.
 *
 * Matches: IDENT.IDENT where IDENT is [a-zA-Z_][a-zA-Z0-9_]*
 * Example: circle_1.radius, block_A.out0
 */
const REFERENCE_PATTERN = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;

/**
 * Tokenize expression text into segments.
 *
 * Identifies block.port references and marks them as reference segments.
 * Other text is marked as plain text segments.
 *
 * @param text - Expression text to tokenize
 * @param addressRegistry - Registry for resolving shorthands to canonical addresses
 * @param connectedShorthands - Set of shorthand strings that have collect edges
 * @returns Array of tokenized segments
 *
 * @example
 * ```typescript
 * const registry = AddressRegistry.buildFromPatch(patch);
 * const connected = new Set(['circle_1.radius']);
 * const segments = tokenizeExpression(
 *   'sin(circle_1.radius * 2)',
 *   registry,
 *   connected
 * );
 * // Returns:
 * // [
 * //   { text: 'sin(', isReference: false },
 * //   { text: 'circle_1.radius', isReference: true, ... },
 * //   { text: ' * 2)', isReference: false },
 * // ]
 * ```
 */
export function tokenizeExpression(
  text: string,
  addressRegistry: AddressRegistry,
  connectedShorthands: ReadonlySet<string>
): TokenizedSegment[] {
  const segments: TokenizedSegment[] = [];
  let lastIndex = 0;

  // Find all potential block.port patterns
  const matches = Array.from(text.matchAll(REFERENCE_PATTERN));

  for (const match of matches) {
    const fullMatch = match[0]; // Full "block.port" string
    const blockName = match[1]; // Block part
    const portName = match[2]; // Port part
    const matchIndex = match.index!;

    // Add plain text before this match
    if (matchIndex > lastIndex) {
      segments.push({
        text: text.substring(lastIndex, matchIndex),
        isReference: false,
      });
    }

    // Try to resolve this as a shorthand
    const shorthand = `${blockName}.${portName}`;
    const canonicalAddress = addressRegistry.resolveShorthand(shorthand);

    if (canonicalAddress) {
      // Valid reference - add as reference segment
      const isConnected = connectedShorthands.has(shorthand);
      segments.push({
        text: fullMatch,
        isReference: true,
        canonicalName: blockName,
        portId: portName,
        sourceAddress: canonicalAddress.kind === 'output'
          ? `v1:blocks.${canonicalAddress.blockId}.outputs.${canonicalAddress.portId}`
          : undefined,
        isConnected,
      });
    } else {
      // Not a valid reference - treat as plain text
      segments.push({
        text: fullMatch,
        isReference: false,
      });
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    segments.push({
      text: text.substring(lastIndex),
      isReference: false,
    });
  }

  // Handle edge case: empty text
  if (segments.length === 0) {
    segments.push({
      text: '',
      isReference: false,
    });
  }

  return segments;
}
