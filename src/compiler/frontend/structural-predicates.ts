/**
 * Structural CT/ICT Predicates for Frontend Decision Paths
 *
 * These predicates identify block categories using structural properties
 * (adapterSpec, capability, CT/ICT cardinality policies) instead of
 * block-name string matching.
 *
 * // [LAW:one-source-of-truth] Block identity derives from declared port types
 * // and capability, not from name strings.
 * // [LAW:single-enforcer] All structural block classification lives here.
 */

import { getBlockDefinition } from '../../blocks/registry';
import { isAxisVar, resolveCardinalityPolicy } from '../../core/canonical-types';

/**
 * Is this block type a time source (e.g. InfiniteTimeRoot)?
 *
 * Structural: capability === 'time'.
 * Time sources are unique singleton blocks that provide time values.
 * The default-source policy wires to existing time sources instead of
 * creating new derived blocks.
 */
export function isTimeSourceBlock(blockType: string): boolean {
  const def = getBlockDefinition(blockType);
  return def?.capability === 'time';
}

/**
 * Is this block type a payload anchor adapter?
 *
 * Structural: adapter category + no adapterSpec.
 *
 * All real type adapters self-declare their conversion pattern via
 * adapterSpec. A block in the adapter category WITHOUT an adapterSpec
 * is a policy-inserted anchor (e.g., PayloadAnchorFloat) — it fixes
 * unresolved payload vars without performing type conversion.
 *
 * The create-derived-obligations pass skips edges touching payload anchors
 * to prevent elaboration-on-elaboration loops.
 */
export function isPayloadAnchorAdapter(blockType: string): boolean {
  const def = getBlockDefinition(blockType);
  if (!def) return false;
  // [LAW:one-source-of-truth] Real adapters self-declare via adapterSpec.
  // Adapter-category blocks WITHOUT adapterSpec are policy-inserted anchors.
  return def.category === 'adapter' && !def.adapterSpec;
}

/**
 * Is this block type a one-only default source?
 *
 * Structural: no inputs + at least one output port with a cardinality var
 * declaring acceptance:'oneOnly'.
 *
 * One-only default sources produce one-cardinality defaults. When the
 * cardinality adapter policy encounters one feeding a many port, it
 * replaces it with a many default source (acceptance:'manyOnly').
 */
export function isOneOnlyDefaultSource(blockType: string): boolean {
  const def = getBlockDefinition(blockType);
  if (!def) return false;
  if (Object.keys(def.inputs).length > 0) return false;
  // [LAW:one-source-of-truth] Identity comes from CT/ICT port policy.
  for (const portDef of Object.values(def.outputs)) {
    const card = portDef.type?.extent?.cardinality;
    if (!card || !isAxisVar(card)) continue;
    const policy = resolveCardinalityPolicy(card);
    if (policy?.acceptance === 'oneOnly') return true;
  }
  return false;
}
