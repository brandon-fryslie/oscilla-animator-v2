/**
 * Parametric Fragment Shader — Family A NagaBuilder emission
 *
 * Implements the fragment stage for Type 2 (Parametric Curve) shapes.
 * Per P3-4 (WebGPU Render Pass Deep Dive):
 *   - Receives interpolated VertexOutput from parametric vertex stage
 *   - Outputs premultiplied-alpha color (already premultiplied in vertex stage)
 *   - materialClass=0 for S02
 *
 * [LAW:one-source-of-truth] VertexOutput struct matches ParametricVertexShader.
 *
 * [LAW:no-string-math] No WGSL strings — everything goes through NagaBuilder.
 */

import {
  NagaBuilder,
  NagaScalarKind,
  type BlockContext,
  type NagaModule,
  type NagaStructField,
} from '../../compiler/ir/naga-emitter';

// =============================================================================
// Builder
// =============================================================================

const META: BlockContext = { visualBlockId: '__parametric_fragment' };

export interface ParametricFragmentShaderResult {
  readonly module: NagaModule;
}

/**
 * Build a parametric fragment shader module through NagaBuilder.
 *
 * Pass-through: receives interpolated VertexOutput, returns color.
 * Alpha is already premultiplied in the vertex stage.
 */
export function buildParametricFragmentShader(): ParametricFragmentShaderResult {
  const b = new NagaBuilder();

  // -- Shared types --
  const vec4f = b.getOrCreateVectorType(4, NagaScalarKind.Float);

  // -- Input struct (matches parametric vertex output) --
  const fragmentInputFields: NagaStructField[] = [
    { name: 'position', type: vec4f, builtin: 'position' },
    { name: 'color', type: vec4f, location: 0 },
  ];
  const fragmentInputType = b.getOrCreateStructType('FragmentInput', fragmentInputFields);

  // -- Fragment function --
  b.beginFunction('fragment_main', [
    { name: 'input', type: fragmentInputType },
  ], vec4f);

  const rootBlock = b.buildBlock(() => {
    const input = b.functionArgument(0, fragmentInputType, META);
    const color = b.accessIndex(input, 1, vec4f, META);
    b.returnStatement(color, META);
  });

  void rootBlock;
  b.endFunction();

  // -- Entry point --
  b.declareEntryPoint('fragment', 'fragment_main', [0, 0, 0]);

  return { module: b.buildModule() };
}
