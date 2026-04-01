/**
 * Roundtrip tests: IR → DSL → IR produces identical IR.
 *
 * Takes the hand-written hello-triangle fixture's AST,
 * reverse-translates to DSL source, compiles back, and
 * verifies the IR is identical.
 */

import { describe, test, expect } from 'vitest';
import { helloTriangle } from '../../rust/fixtures/hello-triangle';
import type { StatementIR, ComputePassSpec, DrawCallSpec, RenderPassSpec } from '../../rust/boundary-contract';
import { stmtsToSource } from '../reverse';
import { compileShaderBody, type ShaderContext } from '../walker';

/**
 * Helper: take StatementIR[], reverse-translate to source, compile back,
 * assert the IR is identical.
 */
function assertIRRoundtrip(stmts: readonly StatementIR[], ctx: ShaderContext, params: string[] = []): void {
  const source = stmtsToSource(stmts);

  // Wrap in arrow function with original params for the walker
  const paramStr = params.join(', ');
  const wrappedSource = `(${paramStr}) => {\n${source}\n}`;

  // Create a function from the source string
  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (${wrappedSource})`)();

  const result = compileShaderBody(fn, ctx);
  if (result.diagnostics.length > 0) {
    throw new Error(`Roundtrip compilation failed:\n${result.diagnostics.map(d => d.message).join('\n')}\n\nGenerated source:\n${wrappedSource}`);
  }

  expect(result.stmts).toStrictEqual(stmts);
}

describe('GPU-IR roundtrip: IR → DSL → IR', () => {
  const manifest = helloTriangle.manifest;

  test('compute pass AST roundtrips', () => {
    const computePass = helloTriangle.roster[0] as ComputePassSpec;
    assertIRRoundtrip(computePass.ast, { stage: 'compute', manifest });
  });

  test('vertex AST roundtrips', () => {
    const renderPass = helloTriangle.roster[2] as RenderPassSpec;
    const drawCall = renderPass.drawCalls[0] as DrawCallSpec;
    assertIRRoundtrip(drawCall.vertexAst, { stage: 'vertex', manifest }, ['position']);
  });

  test('fragment AST roundtrips', () => {
    const renderPass = helloTriangle.roster[2] as RenderPassSpec;
    const drawCall = renderPass.drawCalls[0] as DrawCallSpec;
    assertIRRoundtrip(drawCall.fragmentAst, { stage: 'fragment', manifest });
  });
});
