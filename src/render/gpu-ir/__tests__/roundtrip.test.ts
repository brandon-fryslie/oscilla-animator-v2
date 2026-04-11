/**
 * Roundtrip tests: IR → DSL → IR produces identical IR.
 *
 * Takes fixture ASTs, reverse-translates to DSL source, compiles back,
 * and verifies the IR is identical.
 */

import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { StatementIR, ExprIR, ComputePassSpec, DrawCallSpec, RenderPassSpec } from '../../rust/boundary-contract';
import { stmtsToSource } from '../reverse';
import { compileShaderBody, type ShaderContext } from '../walker';

/** Strip auto-injected semantic nodes (ApplyVP, ApplyTransform2D) for roundtrip comparison.
 *  These are injected by compileRenderEntry, not compileShaderBody, so the
 *  reverse → recompile cycle correctly excludes them. */
function stripSemanticNodes(stmts: readonly StatementIR[]): StatementIR[] {
  return stmts.map(s => {
    if (s.type !== 'ReturnVertex') return s;
    return { ...s, position: stripExpr(s.position) };
  });
}

function stripExpr(e: ExprIR): ExprIR {
  if (e.type === 'ApplyVP') return stripExpr(e.position);
  if (e.type === 'ApplyTransform2D') return stripExpr(e.position);
  return e;
}

function assertIRRoundtrip(stmts: readonly StatementIR[], ctx: ShaderContext, params: string[] = []): void {
  const source = stmtsToSource(stmts);
  const paramStr = params.join(', ');
  const wrappedSource = `(${paramStr}) => {\n${source}\n}`;
  const fn = new Function(`return (${wrappedSource})`)();
  const result = compileShaderBody(fn, ctx);
  if (result.diagnostics.length > 0) {
    throw new Error(`Roundtrip compilation failed:\n${result.diagnostics.map(d => d.message).join('\n')}\n\nGenerated source:\n${wrappedSource}`);
  }
  // Compare with semantic nodes stripped — they're auto-injected at compile level, not shader level
  expect(result.stmts).toStrictEqual(stripSemanticNodes(stmts));
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
    const fn = new Function('return () => { const x = TAU; }')();
    const result = compileShaderBody(fn, { stage: 'compute', manifest });
    expect(result.diagnostics).toHaveLength(0);
    const letStmt = result.stmts[0];
    expect(letStmt.type).toBe('Let');
    expect((letStmt as any).value.type).toBe('LiteralF32');
    expect((letStmt as any).value.value).toBeCloseTo(6.283185307179586, 10);
  });

  test('PI in shader body compiles to LiteralF32(3.14159...)', () => {
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
    const fn = new Function('return () => { const x = TAU + PI; }')();
    const result = compileShaderBody(fn, { stage: 'compute', manifest });
    const src = stmtsToSource(result.stmts);
    expect(src).toContain('TAU');
    expect(src).toContain('PI');
  });
});
