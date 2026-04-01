/**
 * Walker unit tests: every DSL pattern.
 */

import { describe, test, expect } from 'vitest';
import { compileShaderBody, type ShaderContext, type WalkerResult } from '../walker';
import * as B from '../ir-builders';
import type { MemoryManifest, ExprIR, StatementIR } from '../../rust/boundary-contract';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const MINIMAL_MANIFEST: MemoryManifest = {
  preserveStateOnRecompile: false,
  globals: { 'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 } },
  arenaScalars: { 'sys:tri_active': { type: 'u32', clearValue: 1 } },
  domains: {
    tri: {
      capacity: 1,
      activeLanesSymbol: 'sys:tri_active',
      fields: {
        color_r: { type: 'f32', clearValue: 0 },
        color_g: { type: 'f32', clearValue: 0 },
        color_b: { type: 'f32', clearValue: 0 },
      },
    },
  },
  textures: {},
  samplers: {},
  shapeBank: {},
  dataStreams: {},
};

function computeCtx(manifest = MINIMAL_MANIFEST): ShaderContext {
  return { stage: 'compute', manifest };
}

function vertexCtx(manifest = MINIMAL_MANIFEST): ShaderContext {
  return { stage: 'vertex', manifest };
}

function fragmentCtx(manifest = MINIMAL_MANIFEST): ShaderContext {
  return { stage: 'fragment', manifest };
}

/** Compile and assert no errors, return stmts */
function compileOk(fn: Function, ctx: ShaderContext): StatementIR[] {
  const result = compileShaderBody(fn, ctx);
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return result.stmts;
}

/** Compile and return the single expression from a const declaration */
function compileExpr(fn: Function, ctx = computeCtx()): ExprIR {
  const stmts = compileOk(fn, ctx);
  expect(stmts).toHaveLength(1);
  expect(stmts[0].type).toBe('Let');
  return (stmts[0] as any).value;
}

// Ambient declarations for shader DSL (never called — walker parses fn.toString())
declare const $global: any;
declare const $scalar: any;
declare const $domains: any;
declare const $thread: any;
declare const $instance: any;
declare const $vertex: any;
declare function sin(x: any): any;
declare function cos(x: any): any;
declare function abs(x: any): any;
declare function clamp(a: any, b: any, c: any): any;
declare function min(a: any, b: any): any;
declare function max(a: any, b: any): any;
declare function dot(a: any, b: any): any;
declare function normalize(a: any): any;
declare function hash_u32(x: any): any;
declare function f32(x: any): any;
declare function u32(x: any): any;
declare function i32(x: any): any;
declare function vec2(a: any, b: any): any;
declare function vec3(a: any, b: any, c: any): any;
declare function vec4(a: any, b: any, c: any, d: any): any;
declare function vec2i(a: any, b: any): any;
declare function vertex(pos: any, varyings?: any): any;
declare function fragment(outputs: any): any;
declare const unknownVar: any;
declare function badFunc(x: any): any;

// ---------------------------------------------------------------------------
// Literals
// ---------------------------------------------------------------------------

describe('walker-acorn: literals', () => {
  test('f32 literal', () => {
    expect(compileExpr(() => { const x = 3.14; })).toEqual(B.litF32(3.14));
  });

  test('integer literal → f32 (default)', () => {
    expect(compileExpr(() => { const x = 42; })).toEqual(B.litF32(42));
  });

  test('bool true', () => {
    expect(compileExpr(() => { const x = true; })).toEqual(B.litBool(true));
  });

  test('bool false', () => {
    expect(compileExpr(() => { const x = false; })).toEqual(B.litBool(false));
  });

  test('negative literal optimization', () => {
    expect(compileExpr(() => { const x = -1.5; })).toEqual(B.litF32(-1.5));
  });
});

// ---------------------------------------------------------------------------
// $-chain resolution
// ---------------------------------------------------------------------------

describe('walker-acorn: $-chain resolution', () => {
  test('$global.X → LoadGlobal', () => {
    const stmts = compileOk(() => { const t = $global.time; }, computeCtx());
    expect(stmts[0]).toEqual(B.let_('t', B.loadGlobal('sys:time')));
  });

  test('$scalar.X → LoadScalar', () => {
    const stmts = compileOk(() => { const a = $scalar.tri_active; }, computeCtx());
    expect(stmts[0]).toEqual(B.let_('a', B.loadScalar('sys:tri_active')));
  });

  test('$thread.x → Intrinsic', () => {
    const stmts = compileOk(() => { const idx = $thread.x; }, computeCtx());
    expect(stmts[0]).toEqual(B.let_('idx', B.intrinsic('global_invocation_id.x')));
  });

  test('$instance.index → Intrinsic', () => {
    const stmts = compileOk(() => { const i = $instance.index; }, vertexCtx());
    expect(stmts[0]).toEqual(B.let_('i', B.intrinsic('instance_index')));
  });

  test('$vertex.index → Intrinsic', () => {
    const stmts = compileOk(() => { const v = $vertex.index; }, vertexCtx());
    expect(stmts[0]).toEqual(B.let_('v', B.intrinsic('vertex_index')));
  });

  test('$domains.D.F[idx] → LoadField', () => {
    const stmts = compileOk(() => { const r = $domains.tri.color_r[0]; }, computeCtx());
    expect(stmts[0]).toEqual(B.let_('r', B.loadField('tri:color_r', B.litU32(0))));
  });

  test('$domains.D.$active → LoadScalar', () => {
    const stmts = compileOk(() => { const a = $domains.tri.$active; }, computeCtx());
    expect(stmts[0]).toEqual(B.let_('a', B.loadScalar('sys:tri_active')));
  });
});

// ---------------------------------------------------------------------------
// Binary operators
// ---------------------------------------------------------------------------

describe('walker-acorn: binary operators', () => {
  test('arithmetic', () => {
    expect(compileExpr(() => { const x = 1 + 2; })).toEqual(B.binop('+', B.litF32(1), B.litF32(2)));
  });

  test('=== maps to ==', () => {
    // Use variables to prevent esbuild constant folding
    const stmts = compileOk(() => {
      const a = $global.time;
      const b = a === 1;
    }, computeCtx());
    expect((stmts[1] as any).value).toEqual(B.binop('==', B.ref('a'), B.litF32(1)));
  });

  test('!== maps to !=', () => {
    const stmts = compileOk(() => {
      const a = $global.time;
      const b = a !== 1;
    }, computeCtx());
    expect((stmts[1] as any).value).toEqual(B.binop('!=', B.ref('a'), B.litF32(1)));
  });

  test('logical &&', () => {
    const stmts = compileOk(() => {
      const a = $global.time;
      const b = a && true;
    }, computeCtx());
    expect((stmts[1] as any).value).toEqual(B.binop('&&', B.ref('a'), B.litBool(true)));
  });

  test('bitwise ops', () => {
    expect(compileExpr(() => { const x = 1 | 2; })).toEqual(B.binop('|', B.litF32(1), B.litF32(2)));
    expect(compileExpr(() => { const x = 1 & 2; })).toEqual(B.binop('&', B.litF32(1), B.litF32(2)));
    expect(compileExpr(() => { const x = 1 ^ 2; })).toEqual(B.binop('^', B.litF32(1), B.litF32(2)));
    expect(compileExpr(() => { const x = 1 << 2; })).toEqual(B.binop('<<', B.litF32(1), B.litF32(2)));
    expect(compileExpr(() => { const x = 1 >> 2; })).toEqual(B.binop('>>', B.litF32(1), B.litF32(2)));
  });
});

// ---------------------------------------------------------------------------
// Unary operators
// ---------------------------------------------------------------------------

describe('walker-acorn: unary operators', () => {
  test('-x', () => {
    const stmts = compileOk(() => {
      const a = 5;
      const b = -a;
    }, computeCtx());
    // -a is not literal opt since 'a' is an identifier
    expect((stmts[1] as any).value).toEqual(B.unaryOp('-', B.ref('a')));
  });

  test('!x', () => {
    // Use variable to prevent esbuild constant folding of !true → false
    const stmts = compileOk(() => {
      const a = $global.time;
      const b = !a;
    }, computeCtx());
    expect((stmts[1] as any).value).toEqual(B.unaryOp('!', B.ref('a')));
  });

  test('~x', () => {
    expect(compileExpr(() => { const x = ~1; })).toEqual(B.unaryOp('~', B.litF32(1)));
  });
});

// ---------------------------------------------------------------------------
// Calls: builtin, cast, constructor
// ---------------------------------------------------------------------------

describe('walker-acorn: calls', () => {
  test('builtin call', () => {
    expect(compileExpr(() => { const x = sin(3.14); }))
      .toEqual(B.callBuiltin('sin', [B.litF32(3.14)]));
  });

  test('cast with literal optimization', () => {
    expect(compileExpr(() => { const x = u32(5); })).toEqual(B.litU32(5));
  });

  test('cast non-literal', () => {
    const stmts = compileOk(() => {
      const a = 5;
      const b = u32(a);
    }, computeCtx());
    expect((stmts[1] as any).value).toEqual(B.cast('u32', B.ref('a')));
  });

  test('constructor vec4', () => {
    expect(compileExpr(() => { const x = vec4(1, 2, 3, 4); }))
      .toEqual(B.construct('vec4<f32>', [B.litF32(1), B.litF32(2), B.litF32(3), B.litF32(4)]));
  });

  test('constructor vec2i', () => {
    expect(compileExpr(() => { const x = vec2i(1, 2); }))
      .toEqual(B.construct('vec2<i32>', [B.litF32(1), B.litF32(2)]));
  });
});

// ---------------------------------------------------------------------------
// Swizzle
// ---------------------------------------------------------------------------

describe('walker-acorn: swizzle', () => {
  test('position.xy', () => {
    const stmts = compileOk((position: any) => {
      const xy = position.xy;
    }, vertexCtx());
    expect((stmts[0] as any).value).toEqual(B.swizzle(B.ref('position'), 'xy'));
  });
});

// ---------------------------------------------------------------------------
// Control flow
// ---------------------------------------------------------------------------

describe('walker-acorn: control flow', () => {
  test('for with i++', () => {
    const stmts = compileOk(() => {
      for (let i = 0; i < 10; i++) {
        $domains.tri.color_r[i] = 1.0;
      }
    }, computeCtx());
    expect(stmts).toHaveLength(1);
    const forStmt = stmts[0] as any;
    expect(forStmt.type).toBe('For');
    expect(forStmt.init).toEqual(B.var_('i', undefined, B.litF32(0)));
    expect(forStmt.condition).toEqual(B.binop('<', B.ref('i'), B.litF32(10)));
    // i++ → Assign(ref(i), BinaryOp(+, ref(i), litU32(1)))
    expect(forStmt.update).toEqual(B.assign(B.ref('i'), B.binop('+', B.ref('i'), B.litU32(1))));
    expect(forStmt.body).toHaveLength(1);
  });

  test('if/else', () => {
    const stmts = compileOk(() => {
      if (true) {
        $domains.tri.color_r[0] = 1.0;
      } else {
        $domains.tri.color_r[0] = 0.0;
      }
    }, computeCtx());
    expect(stmts).toHaveLength(1);
    const ifStmt = stmts[0] as any;
    expect(ifStmt.type).toBe('If');
    expect(ifStmt.condition).toEqual(B.litBool(true));
    expect(ifStmt.accept).toHaveLength(1);
    expect(ifStmt.reject).toHaveLength(1);
  });

  test('break and continue', () => {
    const stmts = compileOk(() => {
      for (let i = 0; i < 10; i++) {
        if (true) { break; } else { continue; }
      }
    }, computeCtx());
    const forBody = (stmts[0] as any).body;
    const ifStmt = forBody[0];
    expect(ifStmt.accept[0]).toEqual(B.break_());
    expect(ifStmt.reject[0]).toEqual(B.continue_());
  });
});

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

describe('walker-acorn: declarations', () => {
  test('const → Let', () => {
    const stmts = compileOk(() => { const x = 42; }, computeCtx());
    expect(stmts[0].type).toBe('Let');
  });

  test('let → Var', () => {
    const stmts = compileOk(() => { let x = 42; }, computeCtx());
    expect(stmts[0].type).toBe('Var');
  });
});

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

describe('walker-acorn: assignments', () => {
  test('local variable', () => {
    const stmts = compileOk(() => {
      let x = 0;
      x = 42;
    }, computeCtx());
    expect(stmts[1]).toEqual(B.assign(B.ref('x'), B.litF32(42)));
  });

  test('$scalar.X = value → StoreScalar', () => {
    const stmts = compileOk(() => {
      $scalar.tri_active = u32(1);
    }, computeCtx());
    expect(stmts[0]).toEqual(B.storeScalar('sys:tri_active', B.litU32(1)));
  });

  test('$domains.D.F[idx] = value → StoreField', () => {
    const stmts = compileOk(() => {
      $domains.tri.color_r[0] = 1.0;
    }, computeCtx());
    expect(stmts[0]).toEqual(B.storeField('tri:color_r', B.litU32(0), B.litF32(1)));
  });

  test('$domains.D.$active = value → StoreScalar', () => {
    const stmts = compileOk(() => {
      $domains.tri.$active = u32(1);
    }, computeCtx());
    expect(stmts[0]).toEqual(B.storeScalar('sys:tri_active', B.litU32(1)));
  });
});

// ---------------------------------------------------------------------------
// Returns: vertex and fragment
// ---------------------------------------------------------------------------

describe('walker-acorn: returns', () => {
  test('vertex with varyings', () => {
    const stmts = compileOk((position: any) => {
      const uv = vec2(0, 0);
      return vertex(vec4(position.x, position.y, 0, 1), { uv: vec2(0, 0) });
    }, vertexCtx());
    const ret = stmts[1] as any;
    expect(ret.type).toBe('ReturnVertex');
    expect(ret.position.type).toBe('Construct');
    expect(Object.keys(ret.varyings)).toEqual(['uv']);
  });

  test('vertex with shorthand varyings', () => {
    const stmts = compileOk((position: any) => {
      const uv = vec2(0, 0);
      return vertex(vec4(0, 0, 0, 1), { uv });
    }, vertexCtx());
    const ret = stmts[1] as any;
    expect(ret.varyings.uv).toEqual(B.ref('uv'));
  });

  test('fragment with outputs', () => {
    const stmts = compileOk(() => {
      return fragment({ color: vec4(1, 0, 0, 1) });
    }, fragmentCtx());
    expect(stmts[0].type).toBe('ReturnFragment');
    expect(Object.keys((stmts[0] as any).outputs)).toEqual(['color']);
  });
});

// ---------------------------------------------------------------------------
// Free variables
// ---------------------------------------------------------------------------

describe('walker-acorn: free variables', () => {
  test('free variable → NaN placeholder', () => {
    const stmts = compileOk(() => {
      const x = unknownVar;
    }, computeCtx());
    expect((stmts[0] as any).value).toEqual({ type: 'LiteralF32', value: NaN });
  });
});

// ---------------------------------------------------------------------------
// Object destructuring params
// ---------------------------------------------------------------------------

describe('walker-acorn: object destructuring params', () => {
  test('destructured params become locals', () => {
    const stmts = compileOk(({ uv }: any) => {
      const x = uv;
    }, fragmentCtx());
    expect((stmts[0] as any).value).toEqual(B.ref('uv'));
  });
});

// ---------------------------------------------------------------------------
// Error diagnostics
// ---------------------------------------------------------------------------

describe('walker-acorn: error diagnostics', () => {
  test('unknown function → diagnostic', () => {
    const result = compileShaderBody(() => { const x = badFunc(1); }, computeCtx());
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].message).toContain('Unknown function call');
    // Walk still produces a result (NaN sentinel)
    expect(result.stmts).toHaveLength(1);
  });

  test('acorn parse error → diagnostic', () => {
    // Force a parse error by providing a non-function
    const badFn = { toString: () => '???invalid syntax{{{' } as unknown as Function;
    const result = compileShaderBody(badFn, computeCtx());
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.stmts).toEqual([]);
  });
});

