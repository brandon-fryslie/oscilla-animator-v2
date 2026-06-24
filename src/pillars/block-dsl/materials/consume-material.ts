/**
 * src/pillars/block-dsl/materials/consume-material.ts
 *
 * The single seam through which a sink (Pillar 4) obtains the Material
 * (Pillar 3) wired into it. Every sink that consumes a material calls this
 * one function; none hand-reads `ctx.inputMaterials` or hand-checks field
 * names.
 *
 * Two invariants live here, together, because a sink never wants one without
 * the other — it wants "a usable material for this bundle":
 *   1. The material is PRESENT. A material-role edge that failed to resolve
 *      leaves the slot unfilled (the walker records the root-cause error and
 *      moves on, by design). The sink must surface its own symptom error on
 *      the undefined slot. [LAW:no-silent-failure]
 *   2. The bundle SATISFIES the material's data contract. `requiredFields` is
 *      the single source of truth for "what fields the paired bundle must
 *      contain"; this is the one place that validates against it.
 *      [LAW:single-enforcer]
 *
 * Folding both into one call that returns a validated MaterialSpec keeps the
 * promise closed: what you get back is present and satisfied by `bundle`.
 * [LAW:composability]
 *
 * This module is a leaf — it imports only block-api (for the LoweringContext,
 * MaterialSpec, and SourceBundle types). block-dsl → block-api is allowed; the
 * reverse is not. [LAW:one-way-deps]
 */

import type {
  LoweringContext,
  MaterialSpec,
  SourceBundle,
} from '../../block-api';

/**
 * Read the MaterialSpec wired into `slot` and assert `bundle` satisfies its
 * `requiredFields`. Throws — with a message that names the offending sink and
 * the available fields — if the material is missing or the contract is unmet.
 *
 * `sinkLabel` is the bracketed prefix the caller uses in its own errors (e.g.
 * `'DrawBundle'`), so a thrown message reads in the sink's voice.
 *
 * Pure apart from the throw: no side effects, returns the same material it read.
 */
export function consumeMaterial(
  ctx: LoweringContext,
  slot: string,
  bundle: SourceBundle,
  sinkLabel: string,
): MaterialSpec {
  const material = ctx.inputMaterials[slot];
  if (!material) {
    throw new Error(
      `[${sinkLabel}] requires a '${slot}' input — wire a Material block to ` +
        `this sink's ${slot} slot`,
    );
  }

  const missing = material.requiredFields.filter((f) => !(f in bundle));
  if (missing.length > 0) {
    const available = Object.keys(bundle).sort().join(', ') || '(none)';
    throw new Error(
      `[${sinkLabel}] bundle is missing material-required field(s) ` +
        `${missing.map((f) => `'${f}'`).join(', ')}. Available: ${available}`,
    );
  }

  return material;
}
