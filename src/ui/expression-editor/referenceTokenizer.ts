/**
 * Reference Tokenizer for Expression Editor
 *
 * Parses expression text to identify block.port references and tokenize them.
 * Used by TokenExpressionEditor to render references as atomic chips.
 *
 * Algorithm:
 * 1. Scan expression text for IDENT.IDENT patterns and bare IDENTs
 * 2. Resolve IDENT.IDENT to block.port references via AddressRegistry
 * 3. Resolve bare IDENTs to named expression constants
 * 4. Return array of segments (text spans + metadata)
 */

import type { AddressRegistry } from '../../graph/address-registry';
import { resolveExpressionConstant } from '../../expr/constants';
import { addressToString } from '../../types/canonical-address';

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

  /** Whether this segment is a named constant chip */
  readonly isConstant?: boolean;

  /** Only for constants: canonical constant identifier (e.g., "pi") */
  readonly constantName?: string;

  /** Only for constants: rendered chip label (e.g., "π") */
  readonly constantDisplay?: string;
}

// =============================================================================
// Tokenizer
// =============================================================================

/**
 * Regular expression to match either:
 * - IDENT.IDENT block references
 * - IDENT bare identifiers (constants, functions, variables)
 *
 * Note: block-reference alternative appears first to prevent splitting
 * "block.port" into two separate identifier matches.
 */
const TOKEN_PATTERN = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b|\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;

/**
 * Tokenize expression text into segments.
 *
 * Identifies block.port references and marks them as reference segments.
 * Other text is marked as plain text segments.
 *
 * @param text - Expression text to tokenize
 * @param addressRegistry - Registry for resolving shorthands to canonical addresses
 * @param connectedAddresses - Set of canonical output address strings that have collect edges
 * @returns Array of tokenized segments
 *
 * @example
 * ```typescript
 * const registry = AddressRegistry.buildFromPatch(patch);
 * const connected = new Set(['v1:blocks.circle_1.outputs.radius']);
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
  connectedAddresses: ReadonlySet<string>
): TokenizedSegment[] {
  const segments: TokenizedSegment[] = [];
  let lastIndex = 0;

  const matches = Array.from(text.matchAll(TOKEN_PATTERN));

  for (const match of matches) {
    const fullMatch = match[0];
    const blockName = match[1];
    const portName = match[2];
    const ident = match[3];
    const matchIndex = match.index!;

    // Add plain text before this match
    if (matchIndex > lastIndex) {
      segments.push({
        text: text.substring(lastIndex, matchIndex),
        isReference: false,
      });
    }

    if (blockName && portName) {
      const shorthand = `${blockName}.${portName}`;
      const canonicalAddress = addressRegistry.resolveShorthand(shorthand);

      if (canonicalAddress?.kind === 'output') {
        // [LAW:one-source-of-truth] Reference identity and connection state are
        // derived from the canonical output address, never from aliases.
        const sourceAddress = addressToString(canonicalAddress);
        const isConnected = connectedAddresses.has(sourceAddress);
        segments.push({
          text: fullMatch,
          isReference: true,
          canonicalName: blockName,
          portId: portName,
          sourceAddress,
          isConnected,
        });
      } else {
        segments.push({
          text: fullMatch,
          isReference: false,
          isConstant: false,
        });
      }
    } else if (ident) {
      const constant = resolveExpressionConstant(ident);
      if (constant) {
        segments.push({
          text: ident,
          isReference: false,
          isConstant: true,
          constantName: constant.name,
          constantDisplay: constant.chipLabel,
        });
      } else {
        segments.push({
          text: ident,
          isReference: false,
          isConstant: false,
        });
      }
    } else {
      segments.push({
        text: fullMatch,
        isReference: false,
        isConstant: false,
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
