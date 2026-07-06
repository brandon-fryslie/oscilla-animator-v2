/**
 * neutral-projection - project V1 backend facts into the editor's neutral
 * presentation vocabulary.
 *
 * Shared by the V1 providers (PatchStoreAdapter, CompositeStoreAdapter) so the
 * V1→neutral mapping lives in exactly one place. [LAW:one-source-of-truth]
 */

import { canonicalType, FLOAT } from '../../core/canonical-types';
import type { InferenceCanonicalType } from '../../core/inference-types';
import type { DefaultSource } from '../../types';
import { formatTypeForDisplay, formatTypeForTooltip, getTypeColor } from '../reactFlowEditor/typeValidation';
import { isTimeDefaultSource } from '../defaultSourcePresentation';
import { graphColors } from './graph-tokens';
import type { PortTypeDisplay, PortDecoration } from './types';

/** Neutral type shown for a port with no known type (matches V1's float default). */
export const UNTYPED_TYPE: InferenceCanonicalType = canonicalType(FLOAT);

/** Neutral presentation of a (possibly resolved) V1 canonical type. */
export function typeDisplayFor(t: InferenceCanonicalType): PortTypeDisplay {
  const label = formatTypeForDisplay(t);
  return {
    label,
    tooltip: formatTypeForTooltip(t),
    color: getTypeColor(t.payload),
    // Display-only grouping token; wiring legality is a separate concern.
    compatibilityToken: label,
  };
}

/** Indicator dot color for a default source (time roots read distinctly). */
export function indicatorColor(ds: DefaultSource): string {
  return isTimeDefaultSource(ds) ? graphColors.timeRootIndicator : graphColors.defaultSourceIndicator;
}

/** A default-source indicator decoration (renderer hides it while connected). */
export function defaultSourceIndicator(ds: DefaultSource, tooltip: string): PortDecoration {
  return { kind: 'indicator', color: indicatorColor(ds), tooltip };
}
