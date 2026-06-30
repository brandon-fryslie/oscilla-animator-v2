/**
 * src/pillars/persistence.ts
 *
 * The wire format for an authored `PillarPatch`: a pure, versioned, lossless
 * round-trip between a `PillarPatch` and a string. This module performs NO I/O —
 * it neither reads nor writes storage. [LAW:effects-at-boundaries] The effectful
 * shell (localStorage read/write, first-visit default) lives in
 * `src/services/PillarPatchPersistence.ts`; this is the pure core both that shell
 * and the round-trip test exercise without a storage mock.
 *
 * Deserialization is a trust boundary: the input string is untrusted (a user may
 * hand-edit it, or an older app version may have written it). It returns a
 * discriminated ok|error value, never throws and never silently produces a
 * partial patch. [LAW:types-are-the-program] [LAW:no-silent-failure]
 */

import { z } from 'zod';

import { PillarPatchSchema, type PillarPatch } from './types';

/**
 * The persisted envelope version. A blob written by a future, incompatible
 * schema must be REJECTED loudly rather than mis-parsed against today's shape;
 * `z.literal` makes any other value fail the parse. [LAW:no-silent-failure]
 * This is a single guard with one current value, not a mode to branch on.
 * [LAW:no-mode-explosion]
 */
export const PILLAR_PATCH_FORMAT_VERSION = 1 as const;

const SerializedPillarPatchSchema = z.object({
  version: z.literal(PILLAR_PATCH_FORMAT_VERSION),
  patch: PillarPatchSchema,
});

/** A deserialize attempt: a valid patch, or a human-readable reason it failed. */
export type DeserializeResult =
  | { readonly ok: true; readonly patch: PillarPatch }
  | { readonly ok: false; readonly error: string };

/** Serialize an authored patch to a versioned JSON string for storage. */
export function serializePillarPatch(patch: PillarPatch): string {
  return JSON.stringify({ version: PILLAR_PATCH_FORMAT_VERSION, patch });
}

/**
 * Parse a persisted string back into a `PillarPatch`. The two failure modes —
 * the string is not JSON, or the JSON is not a valid versioned patch — both
 * become a typed `{ ok: false }` so callers handle absence-of-valid-data as
 * data, not as a thrown exception. [LAW:dataflow-not-control-flow]
 */
export function deserializePillarPatch(text: string): DeserializeResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `not valid JSON: ${detail}` };
  }

  const parsed = SerializedPillarPatchSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `not a valid PillarPatch envelope: ${parsed.error.message}` };
  }
  return { ok: true, patch: parsed.data.patch };
}
