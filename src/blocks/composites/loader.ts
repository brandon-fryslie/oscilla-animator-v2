/**
 * Composite Library Loader
 *
 * Functions for parsing, validating, and converting composite block definitions
 * between JSON format (storage/import/export) and internal CompositeBlockDef type.
 */

import type {
  CompositeBlockDef,
  InternalBlockId,
  InternalBlockDef,
  InternalEdge,
  ExposedInputPort,
  ExposedOutputPort,
} from '../composite-types';
import { internalBlockId } from '../composite-types';
import { CompositeDefJSONSchema, type CompositeDefJSON, type InternalBlockJSON } from './schema';
import { getBlockDefinition, type Capability } from '../registry';

// =============================================================================
// Result Type
// =============================================================================

/**
 * Result type for operations that can fail with validation errors.
 */
export type LoadResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      errors: string[];
    };

// =============================================================================
// JSON Parsing & Validation
// =============================================================================

/**
 * Parse and validate composite JSON data.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated CompositeDefJSON or validation errors
 */
export function parseCompositeJSON(data: unknown): LoadResult<CompositeDefJSON> {
  const result = CompositeDefJSONSchema.safeParse(data);

  if (result.success) {
    return { ok: true, value: result.data };
  }

  // Format Zod errors into user-friendly messages
  const errors = result.error.issues.map(e => {
    const path = e.path.length > 0 ? `${e.path.join('.')}: ` : '';
    return `${path}${e.message}`;
  });

  return { ok: false, errors };
}

// =============================================================================
// JSON to CompositeBlockDef Conversion
// =============================================================================

/**
 * Convert validated CompositeDefJSON to internal CompositeBlockDef type.
 *
 * This performs structural conversion and computes the capability based on
 * internal blocks. Does NOT validate block types against the registry - that
 * happens during registration.
 *
 * @param json - Validated composite JSON
 * @returns CompositeBlockDef ready for registration
 */
export function jsonToCompositeBlockDef(json: CompositeDefJSON): CompositeBlockDef {
  // Convert internalBlocks Record to Map
  const internalBlocks = new Map<InternalBlockId, InternalBlockDef>();
  for (const [id, blockJson] of Object.entries(json.internalBlocks)) {
    const block = blockJson as InternalBlockJSON;
    internalBlocks.set(internalBlockId(id), {
      type: block.type,
      params: block.params,
      displayName: block.displayName,
    });
  }

  // Convert edges from tuple format to object format
  const internalEdges: InternalEdge[] = json.internalEdges.map(e => ({
    fromBlock: internalBlockId(e.from[0]),
    fromPort: e.from[1],
    toBlock: internalBlockId(e.to[0]),
    toPort: e.to[1],
  }));

  // Convert exposed input ports
  const exposedInputs: ExposedInputPort[] = json.exposedInputs.map(e => ({
    externalId: e.external,
    internalBlockId: internalBlockId(e.internal[0]),
    internalPortId: e.internal[1],
    externalLabel: e.label,
  }));

  // Convert exposed output ports
  const exposedOutputs: ExposedOutputPort[] = json.exposedOutputs.map(e => ({
    externalId: e.external,
    internalBlockId: internalBlockId(e.internal[0]),
    internalPortId: e.internal[1],
    externalLabel: e.label,
  }));

  // Compute capability from internal blocks
  // Priority: state > render > io > pure
  let capability: Capability = 'pure';
  for (const block of internalBlocks.values()) {
    const def = getBlockDefinition(block.type);
    if (def?.capability === 'state') {
      capability = 'state';
      break; // State is highest priority
    }
    if (def?.capability === 'render' && capability === 'pure') {
      capability = 'render';
    }
    if (def?.capability === 'io' && capability === 'pure') {
      capability = 'io';
    }
  }

  return {
    type: json.type,
    form: 'composite',
    label: json.label,
    category: json.category,
    capability,
    description: json.description,
    internalBlocks,
    internalEdges,
    exposedInputs,
    exposedOutputs,
    inputs: {}, // Computed by registry on register
    outputs: {}, // Computed by registry on register
  };
}

// =============================================================================
// CompositeBlockDef to JSON Conversion
// =============================================================================

/**
 * Convert internal CompositeBlockDef to JSON format for storage/export.
 *
 * This is the reverse of jsonToCompositeBlockDef.
 *
 * @param def - CompositeBlockDef to convert
 * @returns CompositeDefJSON ready for serialization
 */
export function compositeDefToJSON(def: CompositeBlockDef): CompositeDefJSON {
  // Convert internal blocks Map to Record
  const internalBlocks: Record<
    string,
    { type: string; params?: Record<string, unknown>; displayName?: string }
  > = {};

  for (const [id, block] of def.internalBlocks) {
    internalBlocks[id] = {
      type: block.type,
      ...(block.params && { params: block.params }),
      ...(block.displayName && { displayName: block.displayName }),
    };
  }

  return {
    version: 1,
    type: def.type,
    label: def.label,
    category: def.category,
    ...(def.description && { description: def.description }),
    internalBlocks,
    internalEdges: def.internalEdges.map(e => ({
      from: [e.fromBlock, e.fromPort],
      to: [e.toBlock, e.toPort],
    })),
    exposedInputs: def.exposedInputs.map(e => ({
      external: e.externalId,
      internal: [e.internalBlockId, e.internalPortId],
      ...(e.externalLabel && { label: e.externalLabel }),
    })),
    exposedOutputs: def.exposedOutputs.map(e => ({
      external: e.externalId,
      internal: [e.internalBlockId, e.internalPortId],
      ...(e.externalLabel && { label: e.externalLabel }),
    })),
  };
}

// =============================================================================
// High-Level Loading Function
// =============================================================================

/**
 * Load a composite definition from a JSON string.
 *
 * This is the main entry point for importing composites from files or strings.
 * Combines JSON parsing, schema validation, and conversion to CompositeBlockDef.
 *
 * @param jsonString - JSON string containing composite definition
 * @returns Result with CompositeBlockDef or errors
 */
export function loadCompositeFromJSON(jsonString: string): LoadResult<CompositeBlockDef> {
  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return {
      ok: false,
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`],
    };
  }

  // Validate against schema
  const validated = parseCompositeJSON(parsed);
  if (!validated.ok) {
    return validated;
  }

  // Convert to internal type
  return { ok: true, value: jsonToCompositeBlockDef(validated.value) };
}
