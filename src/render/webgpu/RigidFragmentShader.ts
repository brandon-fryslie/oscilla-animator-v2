/**
 * Rigid Fragment Shader — Family A NagaBuilder emission
 *
 * Implements the fragment stage for Type 1 (Rigid Stamp) shapes.
 * Per P3-4 (WebGPU Render Pass Deep Dive):
 *   - Receives interpolated VertexOutput from vertex stage
 *   - Outputs premultiplied-alpha color (already premultiplied in vertex stage)
 *
 * [LAW:one-source-of-truth] The VertexOutput struct definition is shared with
 * RigidVertexShader via identical field layout.
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

const META: BlockContext = { visualBlockId: '__rigid_fragment' };

export interface RigidFragmentShaderResult {
  readonly module: NagaModule;
}

/**
 * Build a rigid fragment shader module through NagaBuilder.
 *
 * The shader receives interpolated VertexOutput and passes the color through.
 * Alpha is already premultiplied in the vertex stage.
 */
export function buildRigidFragmentShader(): RigidFragmentShaderResult {
  const b = new NagaBuilder();

  // -- Shared types --
  const vec4f = b.getOrCreateVectorType(4, NagaScalarKind.Float);

  // -- Input struct (matches vertex output) --
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
    // Access the input struct's color field (index 1)
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
