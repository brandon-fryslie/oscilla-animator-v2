/**
 * Composite Library Schema
 *
 * Zod schema for validating composite block JSON definitions.
 * Used for import/export and localStorage persistence.
 */

import { z } from 'zod';

// =============================================================================
// Internal Block Schema
// =============================================================================

/**
 * Schema for an internal block within a composite.
 */
const InternalBlockSchema = z.object({
  type: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
  displayName: z.string().optional(),
});

// =============================================================================
// Internal Edge Schema
// =============================================================================

/**
 * Schema for an edge connecting two internal blocks.
 */
const InternalEdgeSchema = z.object({
  from: z.tuple([z.string(), z.string()]), // [blockId, portId]
  to: z.tuple([z.string(), z.string()]), // [blockId, portId]
});

// =============================================================================
// Exposed Port Schema
// =============================================================================

/**
 * Schema for an exposed port (input or output).
 */
const ExposedPortSchema = z.object({
  external: z.string(),
  internal: z.tuple([z.string(), z.string()]), // [blockId, portId]
  label: z.string().optional(),
});

// =============================================================================
// Composite Definition Schema
// =============================================================================

/**
 * Schema for a complete composite block definition in JSON format.
 * This is the canonical format for import/export and storage.
 */
export const CompositeDefJSONSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    type: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Type must be a valid identifier (start with letter, alphanumeric + underscore)'),
    label: z.string().min(1, 'Label is required'),
    category: z.string().min(1, 'Category is required'),
    description: z.string().optional(),
    internalBlocks: z
      .record(z.string(), InternalBlockSchema)
      .refine(obj => Object.keys(obj).length > 0, 'Must have at least one internal block'),
    internalEdges: z.array(InternalEdgeSchema),
    exposedInputs: z.array(ExposedPortSchema),
    exposedOutputs: z.array(ExposedPortSchema),
  })
  .refine(
    def => def.exposedInputs.length > 0 || def.exposedOutputs.length > 0,
    'Must expose at least one input or output port'
  );

// =============================================================================
// Type Exports
// =============================================================================

export type CompositeDefJSON = z.infer<typeof CompositeDefJSONSchema>;
export type InternalBlockJSON = z.infer<typeof InternalBlockSchema>;
export type InternalEdgeJSON = z.infer<typeof InternalEdgeSchema>;
export type ExposedPortJSON = z.infer<typeof ExposedPortSchema>;
