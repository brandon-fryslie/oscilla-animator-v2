/**
 * src/render/scene-plan/asset-validation.ts
 *
 * Pre-install validation of a ScenePlan's asset references against the registry
 * that will resolve them. A plan names textures by {@link TextureRef} into a
 * {@link TextureDef} that carries an {@link AssetId}; this checks — *before* any
 * decode — that every such id resolves in the registry and names a texture-
 * decodable asset, returning the complete set of problems.
 *
 * Scope source: ticket oscilla-pillars-scene-nt56.6 ("a diagnostic for a
 *   missing/unsupported asset reference before renderer install").
 *
 * [LAW:effects-at-boundaries] Pure data → data: no decode, no IO, no Three. The
 *   effectful decode stays in the loading bridge; this is the computation that
 *   decides whether that decode can possibly succeed.
 * [LAW:single-enforcer] Asset-reference validity is decided here, once, at the
 *   install seam both the demo and editor paths share — not re-checked ad hoc.
 * [LAW:types-are-the-program] An issue is a discriminated union: `undecodableKind`
 *   carries the offending kind, `missing` has none — so "undecodable without a
 *   kind" is unrepresentable and the human message is derived, never stored.
 */

import type { AssetId } from '../../core/ids';
import type { AssetKind, AssetRegistry } from '../../assets';
import { isTextureDecodable } from '../../assets';
import type { ScenePlan } from './plan';
import type { TextureRef } from './refs';

/** One unresolvable/unsupported texture-asset reference found in a plan. */
export type PlanAssetIssue =
  | { readonly reason: 'missing'; readonly ref: TextureRef; readonly assetId: AssetId }
  | {
      readonly reason: 'undecodableKind';
      readonly ref: TextureRef;
      readonly assetId: AssetId;
      readonly kind: AssetKind;
    };

/**
 * Every texture-asset reference in `plan` that cannot be resolved+decoded by
 * `registry`, in the plan's texture-table order. An empty array means the plan's
 * assets are installable.
 *
 * A `data` texture (a compiler-baked lookup table) resolves to no asset, so
 * there is nothing in the registry to validate — it is self-contained and always
 * installable. Only `asset` textures are checked against the registry.
 *
 * [LAW:dataflow-not-control-flow] Every texture entry is examined the same way;
 *   variability lives in the returned issue list, not in whether a check runs.
 * [LAW:single-enforcer] The decode-coverage rule stays the one registry check;
 *   the `data` arm skips it because the rule is about asset-backed decode, not
 *   because the check is bypassed — a data texture has no decode to validate.
 */
export function validatePlanAssets(plan: ScenePlan, registry: AssetRegistry): readonly PlanAssetIssue[] {
  const issues: PlanAssetIssue[] = [];
  for (const [refKey, def] of Object.entries(plan.resources.textures)) {
    const ref = refKey as TextureRef;
    if (def.kind === 'data') continue;
    const { assetId } = def;
    if (!registry.has(assetId)) {
      issues.push({ reason: 'missing', ref, assetId });
      continue;
    }
    const { kind } = registry.getMetadata(assetId);
    if (!isTextureDecodable(kind)) {
      issues.push({ reason: 'undecodableKind', ref, assetId, kind });
    }
  }
  return issues;
}

/** A one-line human description of a single issue (derived from its fields). */
export function formatPlanAssetIssue(issue: PlanAssetIssue): string {
  switch (issue.reason) {
    case 'missing':
      return `texture '${issue.ref}' references asset '${issue.assetId}', which is not registered`;
    case 'undecodableKind':
      return `texture '${issue.ref}' references asset '${issue.assetId}' of kind '${issue.kind}', which has no texture decoder`;
  }
}

/** A newline-joined description of every issue, for a single aggregated failure. */
export function formatPlanAssetIssues(issues: readonly PlanAssetIssue[]): string {
  return issues.map((issue) => `  - ${formatPlanAssetIssue(issue)}`).join('\n');
}
