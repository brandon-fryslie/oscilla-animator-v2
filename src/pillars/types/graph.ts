/**
 * src/pillars/types/graph.ts
 *
 * The user-authored graph type. PillarPatch is the input to the frontend.
 * Compiler-internal types (NormalizedGraph, LoweringContext, BlockDefinition,
 * etc.) live in block-api.ts and the phase directories.
 *
 * The shape is expressed as Zod schemas so the runtime validator (used at the
 * persistence trust boundary — see src/pillars/persistence.ts), the JSON
 * round-trip, and the TypeScript type are ONE artifact rather than three that
 * drift. [LAW:one-source-of-truth] This mirrors the type-system layer in
 * `schemas.ts`: a hand-edited or stale-version persisted patch fails
 * `PillarPatchSchema.safeParse` at runtime AND a structurally-wrong literal is
 * unassignable at compile time. [LAW:types-are-the-program]
 */

import { z } from 'zod';

export const PillarKindSchema = z.enum(['generator', 'modifier', 'material', 'intent']);
export type PillarKind = z.infer<typeof PillarKindSchema>;

/** The edge's role; see PillarEdgeSchema. */
export const PillarEdgeRoleSchema = z.enum(['primary', 'secondary', 'material']);
export type PillarEdgeRole = z.infer<typeof PillarEdgeRoleSchema>;

/**
 * A block's config is an open bag of authored control values (numbers, strings,
 * booleans). It is deliberately `unknown`-valued here — the block's own schema
 * validates the payload on compile, so the persistence boundary only asserts the
 * *envelope* shape, never re-validates config semantics. [LAW:single-enforcer]
 */
export const PillarBlockSchema = z
  .object({
    id: z.string(),
    kind: PillarKindSchema,
    type: z.string(),
    config: z.record(z.string(), z.unknown()).readonly(),
  })
  .readonly();
export type PillarBlock = z.infer<typeof PillarBlockSchema>;

export const PillarEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    inputSlot: z.string(),
    role: PillarEdgeRoleSchema,
  })
  .readonly();
export type PillarEdge = z.infer<typeof PillarEdgeSchema>;

export const PillarPatchSchema = z
  .object({
    blocks: z.array(PillarBlockSchema).readonly(),
    edges: z.array(PillarEdgeSchema).readonly(),
  })
  .readonly();
export type PillarPatch = z.infer<typeof PillarPatchSchema>;
