/**
 * Expression Autocomplete Suggestions
 *
 * Data service for IDE-style autocomplete in the expression editor.
 * Provides suggestions for:
 * - Built-in functions (sin, cos, lerp, etc.)
 * - Block references (from patch)
 * - Port references (from block definitions)
 * - Output ports (block.port combinations)
 *
 * This is a pure data service with no UI coupling.
 */

import type { Patch } from '../graph/Patch';
import type { AddressRegistry } from '../graph/address-registry';
import type { PayloadType } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../core/canonical-types';
import { BLOCK_DEFS_BY_TYPE } from '../blocks/registry';
import { addressToString } from '../types/canonical-address';

// =============================================================================
// Suggestion Data Types
// =============================================================================

/**
 * Discriminated union for suggestion types.
 */
export type SuggestionType = 'function' | 'block' | 'port' | 'output';

/**
 * Base suggestion interface.
 *
 * All suggestions share:
 * - label: Display text (e.g., "sin(", "Circle1")
 * - type: Discriminator for UI rendering
 * - description: Optional help text
 * - sortOrder: Numeric rank for sorting (lower = higher priority)
 */
export interface Suggestion {
  readonly label: string;
  readonly type: SuggestionType;
  readonly description?: string;
  readonly sortOrder: number;
}

/**
 * Function suggestion with signature metadata.
 *
 * Example: { label: "sin(", type: "function", arity: 1, returnType: "float", ... }
 */
export interface FunctionSuggestion extends Suggestion {
  readonly type: 'function';
  readonly arity: number;
  readonly returnType: PayloadType;
}

/**
 * Block reference suggestion.
 *
 * Example: { label: "Circle1", type: "block", portCount: 3, displayName: "Circle" }
 */
export interface BlockSuggestion extends Suggestion {
  readonly type: 'block';
  readonly portCount: number;
  readonly displayName?: string;
}

/**
 * Port reference suggestion (for member access).
 *
 * Example: { label: "radius", type: "port", payloadType: "float", cardinality: "one" }
 */
export interface PortSuggestion extends Suggestion {
  readonly type: 'port';
  readonly payloadTypeStr: string;
  readonly cardinality: 'one' | 'many';
}

/**
 * Output suggestion (flat block.port combinations).
 *
 * Example: { label: "Circle.radius", type: "output", blockId: "Circle", portId: "radius", sourceAddress: "blocks.Circle.outputs.radius" }
 */
export interface OutputSuggestion extends Suggestion {
  readonly type: 'output';
  readonly blockId: string;
  readonly portId: string;
  readonly sourceAddress: string;
  readonly payloadType: string;
}

// =============================================================================
// Function Signature Export
// =============================================================================

/**
 * Function signature metadata for autocomplete.
 */
export interface FunctionSignature {
  readonly name: string;
  readonly arity: number;
  readonly returnType: PayloadType;
  readonly description: string;
}

/**
 * Built-in expression function signatures.
 *
 * This is the authoritative list of all expression functions.
 * Kept in sync with typecheck.ts FUNCTION_SIGNATURES.
 *
 * Note: Labels include opening paren for autocomplete (e.g., "sin(" not "sin").
 */
const FUNCTION_SIGNATURES: readonly FunctionSignature[] = [
  // Trigonometric
  { name: 'sin', arity: 1, returnType: FLOAT, description: 'Sine function (radians)' },
  { name: 'cos', arity: 1, returnType: FLOAT, description: 'Cosine function (radians)' },
  { name: 'tan', arity: 1, returnType: FLOAT, description: 'Tangent function (radians)' },

  // Unary
  { name: 'abs', arity: 1, returnType: FLOAT, description: 'Absolute value' },
  { name: 'sqrt', arity: 1, returnType: FLOAT, description: 'Square root' },
  { name: 'floor', arity: 1, returnType: INT, description: 'Round down to integer' },
  { name: 'ceil', arity: 1, returnType: INT, description: 'Round up to integer' },
  { name: 'round', arity: 1, returnType: INT, description: 'Round to nearest integer' },

  // Binary
  { name: 'min', arity: 2, returnType: FLOAT, description: 'Minimum of two values' },
  { name: 'max', arity: 2, returnType: FLOAT, description: 'Maximum of two values' },

  // Interpolation
  { name: 'lerp', arity: 3, returnType: FLOAT, description: 'Linear interpolation: lerp(a, b, t) = a + t*(b-a)' },
  { name: 'mix', arity: 3, returnType: FLOAT, description: 'Linear interpolation (alias for lerp)' },
  { name: 'smoothstep', arity: 3, returnType: FLOAT, description: 'Smooth Hermite interpolation' },
  { name: 'clamp', arity: 3, returnType: FLOAT, description: 'Clamp value to range: clamp(x, min, max)' },

  // Phase/fractional
  { name: 'wrap', arity: 1, returnType: FLOAT, description: 'Wrap to [0, 1) range' },
  { name: 'fract', arity: 1, returnType: FLOAT, description: 'Fractional part (same as wrap)' },
] as const;

/**
 * Get all function signatures for autocomplete.
 *
 * @returns Read-only array of function signatures
 */
export function getFunctionSignatures(): readonly FunctionSignature[] {
  return FUNCTION_SIGNATURES;
}

// =============================================================================
// SuggestionProvider Service
// =============================================================================

/**
 * Service for providing autocomplete suggestions.
 *
 * Collects suggestions from:
 * - Built-in expression functions
 * - Block references from the patch
 * - Port references from block definitions
 * - Output ports (flat block.port combinations)
 *
 * Usage:
 * ```typescript
 * const provider = new SuggestionProvider(patch, registry);
 * const allFunctions = provider.suggestFunctions();
 * const filtered = provider.filterSuggestions("sin", "function");
 * ```
 */
export class SuggestionProvider {
  /**
   * Create a suggestion provider.
   *
   * @param patch - The patch to extract block/port suggestions from
   * @param registry - Address registry for resolving block references
   */
  constructor(
    readonly patch: Patch,
    readonly registry: AddressRegistry
  ) {}

  /**
   * Get all function suggestions.
   *
   * Returns functions sorted by sortOrder (all have sortOrder 100).
   * Labels include opening paren: "sin(" not "sin".
   *
   * @returns Read-only array of function suggestions
   */
  suggestFunctions(): readonly FunctionSuggestion[] {
    return FUNCTION_SIGNATURES.map((sig, index) => ({
      label: `${sig.name}(`,
      type: 'function' as const,
      arity: sig.arity,
      returnType: sig.returnType,
      description: sig.description,
      sortOrder: 100 + index, // Functions start at 100, preserve order
    }));
  }

  /**
   * Get all block name suggestions from the patch.
   *
   * Returns block names (not full addresses) sorted by name.
   * Each block has sortOrder 300.
   *
   * @returns Read-only array of block suggestions
   */
  suggestBlocks(): readonly BlockSuggestion[] {
    const suggestions: BlockSuggestion[] = [];

    for (const block of this.patch.blocks.values()) {
      const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);
      const outputCount = blockDef?.outputs ? Object.keys(blockDef.outputs).length : 0;
      // Use displayName if set, otherwise type+id for readability
      const displayName = block.displayName ?? `${block.type}_${block.id}`;

      suggestions.push({
        label: displayName,
        type: 'block',
        description: `Block: ${block.type}`,
        portCount: outputCount,
        displayName: block.type,
        sortOrder: 300,
      });
    }

    // Sort by label for deterministic ordering
    return suggestions.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Get port suggestions for a specific block.
   *
   * Returns output ports for the block (inputs are not addressable in expressions).
   * Each port has sortOrder 400.
   *
   * @param blockName - The block ID (e.g., "Circle1")
   * @returns Read-only array of port suggestions, or empty if block not found
   */
  suggestBlockPorts(blockName: string): readonly PortSuggestion[] {
    // Find block by display name (or fall back to ID)
    let block = this.patch.blocks.get(blockName as any);
    if (!block) {
      // Search by display name
      for (const b of this.patch.blocks.values()) {
        if ((b.displayName ?? b.id) === blockName) {
          block = b;
          break;
        }
      }
    }
    if (!block) {
      return [];
    }

    const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);
    if (!blockDef?.outputs) {
      return [];
    }

    const suggestions: PortSuggestion[] = [];

    for (const [portId, outputDef] of Object.entries(blockDef.outputs)) {
      // Resolve port type from registry if available
      const shorthand = `${blockName}.${portId}`;
      const canonicalAddr = this.registry.resolveShorthand(shorthand);
      let payloadTypeStr: string = `(error: payloadType not resolved)`; // Default fallback
      let cardinality: 'one' | 'many' = 'one';

      if (canonicalAddr) {
        const addrString = addressToString(canonicalAddr);
        const resolved = this.registry.resolve(addrString);
        if (resolved?.kind === 'output') {
          payloadTypeStr = resolved.type.payload.kind;
          // Extract cardinality from CanonicalType's extent axes
          const cardinalityAxis = resolved.type.extent.cardinality;
          if (cardinalityAxis.kind === 'inst') {
            // Cardinality is a discriminated union: { kind: 'one' } | { kind: 'many', instance: ... }
            cardinality = cardinalityAxis.value.kind === 'one' ? 'one' : 'many';
          }
        }
      }

      suggestions.push({
        label: portId,
        type: 'port',
        description: `Output: ${payloadTypeStr} (${cardinality})`,
        payloadTypeStr: payloadTypeStr,
        cardinality,
        sortOrder: 400,
      });
    }

    return suggestions;
  }

  /**
   * Get all output suggestions (flat block.port combinations).
   *
   * Returns suggestions formatted as "BlockName.portId" (e.g., "Circle.radius").
   * Each suggestion includes blockId, portId, and sourceAddress for wiring.
   * Results are sorted alphabetically by label.
   *
   * @param excludeBlockId - Optional block ID to exclude (e.g., self-reference prevention)
   * @returns Read-only array of output suggestions
   */
  suggestAllOutputs(excludeBlockId?: string): readonly OutputSuggestion[] {
    const suggestions: OutputSuggestion[] = [];

    for (const block of this.patch.blocks.values()) {
      // Skip excluded block (e.g., Expression block can't reference itself)
      if (block.id === excludeBlockId) continue;

      const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);
      if (!blockDef?.outputs) continue;

      // Use displayName if set, otherwise type+id for readability
      const displayName = block.displayName ?? `${block.type}_${block.id}`;

      for (const [portId, outputDef] of Object.entries(blockDef.outputs)) {
        const sourceAddress = `blocks.${block.id}.outputs.${portId}`;

        suggestions.push({
          label: `${displayName}.${portId}`,
          type: 'output',
          description: `${block.type} output`,
          blockId: block.id,
          portId,
          sourceAddress,
          payloadType: outputDef.type.payload.kind,
          sortOrder: 250, // Between inputs (200) and blocks (300)
        });
      }
    }

    // Sort by label for deterministic ordering
    return suggestions.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Filter suggestions by prefix and optionally by type.
   *
   * Uses case-insensitive substring matching (fuzzy filter).
   * Results are sorted by:
   * 1. Match quality (exact prefix > substring)
   * 2. Original sortOrder
   *
   * Empty prefix returns all suggestions of the given type (or all if no type).
   *
   * @param prefix - Search string (case-insensitive)
   * @param type - Optional type filter (function, input, block, port, output)
   * @param excludeBlockId - Optional block ID to exclude from output suggestions
   * @returns Filtered and sorted suggestions
   */
  filterSuggestions(prefix: string, type?: SuggestionType, excludeBlockId?: string): readonly Suggestion[] {
    // Collect all suggestions based on type filter
    let allSuggestions: Suggestion[];

    if (type === 'function') {
      allSuggestions = [...this.suggestFunctions()];
    } else if (type === 'block') {
      allSuggestions = [...this.suggestBlocks()];
    } else if (type === 'port') {
      // Port suggestions require a block context, return empty
      allSuggestions = [];
    } else if (type === 'output') {
      allSuggestions = [...this.suggestAllOutputs(excludeBlockId)];
    } else {
      // No type filter - include all except ports (which need context)
      allSuggestions = [
        ...this.suggestFunctions(),
        ...this.suggestAllOutputs(excludeBlockId),
        ...this.suggestBlocks(),
      ];
    }

    // Empty prefix - return all sorted by sortOrder
    if (!prefix) {
      return allSuggestions.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // Filter by prefix (case-insensitive substring match)
    const lowerPrefix = prefix.toLowerCase();
    const filtered = allSuggestions
      .map(suggestion => {
        const lowerLabel = suggestion.label.toLowerCase();
        const exactPrefixMatch = lowerLabel.startsWith(lowerPrefix);
        const substringMatch = lowerLabel.includes(lowerPrefix);

        if (!substringMatch) {
          return null; // No match
        }

        // Compute match quality score (lower is better)
        // Exact prefix: 0, substring: 1
        const matchQuality = exactPrefixMatch ? 0 : 1;

        return { suggestion, matchQuality };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // Sort by match quality, then sortOrder
    filtered.sort((a, b) => {
      if (a.matchQuality !== b.matchQuality) {
        return a.matchQuality - b.matchQuality;
      }
      return a.suggestion.sortOrder - b.suggestion.sortOrder;
    });

    return filtered.map(item => item.suggestion);
  }
}
