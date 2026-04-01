/**
 * Roundtrip tests: IR → DSL → IR produces identical IR.
 *
 * Takes fixture ASTs, reverse-translates to DSL source, compiles back,
 * and verifies the IR is identical.
 */

import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { StatementIR, ComputePassSpec, DrawCallSpec, RenderPassSpec } from '../../rust/boundary-contract';
import { stmtsToSource } from '../reverse';
import { compileShaderBody, type ShaderContext } from '../walker';

function assertIRRoundtrip(stmts: readonly StatementIR[], ctx: ShaderContext, params: string[] = []): void {
  const source = stmtsToSource(stmts);
  const paramStr = params.join(', ');
  const wrappedSource = `(${paramStr}) => {\n${source}\n}`;
  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (${wrappedSource})`)();
  const result = compileShaderBody(fn, ctx);
  if (result.diagnostics.length > 0) {
    throw new Error(`Roundtrip compilation failed:\n${result.diagnostics.map(d => d.message).join('\n')}\n\nGenerated source:\n${wrappedSource}`);
  }
  expect(result.stmts).toStrictEqual(stmts);
}

describe('GPU-IR roundtrip: hello-triangle IR → DSL → IR', () => {
  const payload = loadFixturePayload('hello-triangle');
  const manifest = payload.manifest;

  test('compute pass AST roundtrips', () => {
    const computePass = payload.roster[0] as ComputePassSpec;
    assertIRRoundtrip(computePass.ast, { stage: 'compute', manifest });
  });

  test('vertex AST roundtrips', () => {
    const renderPass = payload.roster[2] as RenderPassSpec;
    const drawCall = renderPass.drawCalls[0] as DrawCallSpec;
    assertIRRoundtrip(drawCall.vertexAst, { stage: 'vertex', manifest }, ['position']);
  });

  test('fragment AST roundtrips', () => {
    const renderPass = payload.roster[2] as RenderPassSpec;
    const drawCall = renderPass.drawCalls[0] as DrawCallSpec;
    assertIRRoundtrip(drawCall.fragmentAst, { stage: 'fragment', manifest });
  });
});

describe('GPU-IR roundtrip: instanced-write IR → DSL → IR', () => {
  const payload = loadFixturePayload('instanced-write');
  const manifest = payload.manifest;

  test('compute pass AST roundtrips (Intrinsic + Cast)', () => {
    const computePass = payload.roster[0] as ComputePassSpec;
    assertIRRoundtrip(computePass.ast, { stage: 'compute', manifest });
  });

  test('vertex AST roundtrips (instance_index + varyings)', () => {
    const renderPass = payload.roster[2] as RenderPassSpec;
    const drawCall = renderPass.drawCalls[0] as DrawCallSpec;
    assertIRRoundtrip(drawCall.vertexAst, { stage: 'vertex', manifest }, ['position']);
  });

  test('fragment AST roundtrips (varying passthrough)', () => {
    const renderPass = payload.roster[2] as RenderPassSpec;
    const drawCall = renderPass.drawCalls[0] as DrawCallSpec;
    assertIRRoundtrip(drawCall.fragmentAst, { stage: 'fragment', manifest }, ['color']);
  });
});

describe('GPU-IR roundtrip: texture-readwrite IR → DSL → IR', () => {
  const payload = loadFixturePayload('texture-readwrite');
  const manifest = payload.manifest;

  test('compute pass AST roundtrips (TextureStore)', () => {
    const computePass = payload.roster[0] as ComputePassSpec;
    assertIRRoundtrip(computePass.ast, { stage: 'compute', manifest });
  });

  test('fragment AST roundtrips (TextureLoad)', () => {
    const renderPass = payload.roster[3] as RenderPassSpec;
    const drawCall = renderPass.drawCalls[0] as DrawCallSpec;
    assertIRRoundtrip(drawCall.fragmentAst, { stage: 'fragment', manifest }, ['uv']);
  });
});

describe('GPU-IR roundtrip: atomic-boids IR → DSL → IR', () => {
  const payload = loadFixturePayload('atomic-boids');
  const manifest = payload.manifest;

  test('compute pass AST roundtrips (AtomicOpField)', () => {
    const computePass = payload.roster[0] as ComputePassSpec;
    assertIRRoundtrip(computePass.ast, { stage: 'compute', manifest });
  });
});
