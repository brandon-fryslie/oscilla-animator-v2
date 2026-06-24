/**
 * src/pillars/block-dsl/materials/material-spec.ts
 *
 * The authoring vocabulary for Material blocks (Pillar 3): the
 * `defineMaterialSpec` constructor a material block's `lower()` uses to
 * build the value it returns.
 *
 * The MaterialSpec *type* lives in block-api.ts — it is part of the
 * `lower()` ABI (`LoweredMaterial`, `LoweringContext.inputMaterials`), and
 * block-api cannot import from block-dsl (dependency-cruiser leaf rule), so
 * the type cannot live here. This module re-exports it so block authors get
 * both the type and its constructor from one import. block-dsl → block-api
 * is the established direction (see `dot-material.ts`, `compute-from-bundle.ts`).
 * [LAW:one-source-of-truth] one MaterialSpec definition, here re-exported.
 *
 * This module is a leaf — it imports only block-api (for the MaterialSpec
 * type) and the boundary contract (for StatementIR / PipelineStateSpec).
 *
 * ## The `computeAst` contract
 *
 * A material serves two sink stages from one spec:
 *   - Render sinks (DrawBundle) consume `vertexAst` + `fragmentAst`. The
 *     vertex stage produces a `vec4<f32>` color varying named
 *     `colorVaryingName`; the fragment stage emits it.
 *   - Texture-materialize sinks (Materialize) consume `computeAst`, which
 *     has no vertex/fragment stage.
 *
 * `computeAst` is a list of statements with a single, consistent shape for
 * every material: its final statement `let_`-binds `colorVaryingName` to a
 * `vec4<f32>` value. The texture-materialize pass builder binds the spec's
 * `requiredFields` from the bundle, runs these statements, then appends a
 * `TextureStore` that reads `ref(colorVaryingName)`. The material owns how
 * the color is composed; the sink only stores the named result.
 * [LAW:single-enforcer] one color seam (`colorVaryingName`) across all stages.
 */

import type { PipelineStateSpec, StatementIR } from '../../../render/rust/boundary-contract';
import type { MaterialSpec } from '../../block-api';

export type { MaterialSpec };

/**
 * Arguments to `defineMaterialSpec`. Identical to MaterialSpec except
 * `colorVaryingName` is optional and defaults to `'color'` — the single
 * authoring affordance this constructor adds over an object literal, plus a
 * one place for future material-construction invariants to live.
 */
export interface DefineMaterialSpecArgs {
  readonly vertexAst: readonly StatementIR[];
  readonly fragmentAst: readonly StatementIR[];
  readonly computeAst?: readonly StatementIR[];
  readonly requiredFields: readonly string[];
  /** Defaults to 'color'. */
  readonly colorVaryingName?: string;
  readonly pipelineState: PipelineStateSpec;
  readonly wgslPreamble?: string;
}

/**
 * Construct a MaterialSpec, defaulting `colorVaryingName` to `'color'`.
 *
 * Pure: returns a fresh value per call, no side effects.
 */
export function defineMaterialSpec(args: DefineMaterialSpecArgs): MaterialSpec {
  // Default-first spread: an omitted colorVaryingName falls through to
  // 'color'; a provided one overrides. No branching. [LAW:dataflow-not-control-flow]
  return { colorVaryingName: 'color', ...args };
}
