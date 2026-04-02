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

describe('GPU-IR roundtrip: instanced-write IR → DSL → IR', () => {
  const payload = loadFixturePayload('instanced-write');
  const manifest = payload.manifest;

  test('compute pass AST roundtrips (Intrinsic + Cast)', () => {
    const computePass = payload.roster.find(e => e.type === 'Compute') as ComputePassSpec;
    assertIRRoundtrip(computePass.ast, { stage: 'compute', manifest });
  });

  test('vertex AST roundtrips (instance_index + varyings)', () => {
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    const drawCall = renderPass.drawCalls[0] as DrawCallSpec;
    // VP auto-injection wraps ReturnVertex.position — roundtrip tests the full injected AST
    assertIRRoundtrip(drawCall.vertexAst, { stage: 'vertex', manifest }, ['position']);
  });

  test('fragment AST roundtrips (varying passthrough)', () => {
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    const drawCall = renderPass.drawCalls[0] as DrawCallSpec;
    assertIRRoundtrip(drawCall.fragmentAst, { stage: 'fragment', manifest }, ['color']);
  });
});

describe('GPU-IR roundtrip: texture-readwrite IR → DSL → IR', () => {
  const payload = loadFixturePayload('texture-readwrite');
  const manifest = payload.manifest;

  test('compute pass AST roundtrips (TextureStore)', () => {
    const computePass = payload.roster.find(e => e.type === 'Compute') as ComputePassSpec;
    assertIRRoundtrip(computePass.ast, { stage: 'compute', manifest });
  });

  test('fragment AST roundtrips (TextureLoad)', () => {
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    const drawCall = renderPass.drawCalls[0] as DrawCallSpec;
    assertIRRoundtrip(drawCall.fragmentAst, { stage: 'fragment', manifest }, ['uv']);
  });
});

describe('GPU-IR roundtrip: atomic-boids IR → DSL → IR', () => {
  const payload = loadFixturePayload('atomic-boids');
  const manifest = payload.manifest;

  test('compute pass AST roundtrips (AtomicOpField)', () => {
    const computePass = payload.roster.find(e => e.type === 'Compute') as ComputePassSpec;
    assertIRRoundtrip(computePass.ast, { stage: 'compute', manifest });
  });
});

describe('GPU-IR roundtrip: atomic-histogram IR → DSL → IR', () => {
  const payload = loadFixturePayload('atomic-histogram');
  const manifest = payload.manifest;

  test('compute pass AST roundtrips (atomicLoad + assignResultTo)', () => {
    const computePass = payload.roster.find(e => e.type === 'Compute') as ComputePassSpec;
    assertIRRoundtrip(computePass.ast, { stage: 'compute', manifest });
  });
});

describe('GPU-IR math constants: forward + inverse', () => {
  const manifest = loadFixturePayload('instanced-write').manifest;

  test('TAU in shader body compiles to LiteralF32(6.283...)', () => {
    // eslint-disable-next-line no-new-func
    const fn = new Function('return () => { const x = TAU; }')();
    const result = compileShaderBody(fn, { stage: 'compute', manifest });
    expect(result.diagnostics).toHaveLength(0);
    const letStmt = result.stmts[0];
    expect(letStmt.type).toBe('Let');
    expect((letStmt as any).value.type).toBe('LiteralF32');
    expect((letStmt as any).value.value).toBeCloseTo(6.283185307179586, 10);
  });

  test('PI in shader body compiles to LiteralF32(3.14159...)', () => {
    // eslint-disable-next-line no-new-func
    const fn = new Function('return () => { const x = PI; }')();
    const result = compileShaderBody(fn, { stage: 'compute', manifest });
    expect(result.diagnostics).toHaveLength(0);
    expect((result.stmts[0] as any).value.value).toBeCloseTo(3.141592653589793, 10);
  });

  test('reverse emits TAU instead of 6.283185307179586', () => {
    const src = stmtsToSource([{ type: 'Let', name: 'x', value: { type: 'LiteralF32', value: 6.283185307179586 } }]);
    expect(src).toContain('TAU');
    expect(src).not.toContain('6.283');
  });

  test('math constant roundtrips: TAU → LiteralF32 → TAU', () => {
    // eslint-disable-next-line no-new-func
    const fn = new Function('return () => { const x = TAU + PI; }')();
    const result = compileShaderBody(fn, { stage: 'compute', manifest });
    const src = stmtsToSource(result.stmts);
    expect(src).toContain('TAU');
    expect(src).toContain('PI');
  });
});
