import type {
  NagaExpressionIR,
  NagaFunctionIR,
  NagaModuleIR,
  NagaScalarKindIR,
  NagaTypeIR,
} from '../ir/naga-lowering';

export interface ShimFormattedError {
  readonly message: string;
  readonly location: string;
  readonly path: string;
}

export interface ShimCompilationResult {
  readonly wgsl: string;
  readonly is_valid: boolean;
  readonly errors: readonly ShimFormattedError[];
}

let initialized = false;

export default async function init(): Promise<void> {
  initialized = true;
}

function formatScalarLiteral(value: number, scalar: NagaScalarKindIR): string {
  if (scalar === 'u32') {
    const integer = Math.trunc(value);
    return `${integer}u`;
  }
  if (Number.isInteger(value)) {
    return `${value}.0`;
  }
  return `${value}`;
}

function emitTypeRef(typeIndex: number, types: readonly NagaTypeIR[]): string {
  const totalTypes = types.length;
  const type = types[typeIndex];
  if (!type) {
    const indexInfo =
      typeIndex < 0
        ? 'index is negative'
        : typeIndex >= totalTypes
          ? 'index is beyond upper bound'
          : 'index is within bounds but type entry is missing';
    throw new Error(
      `emitTypeRef: missing type for index ${typeIndex} (types length=${totalTypes}; ${indexInfo})`,
    );
  }
  switch (type.kind) {
    case 'scalar':
      return type.scalar;
    case 'vector':
      return `vec${type.size}<${type.scalar}>`;
    case 'array':
      return `array<${emitTypeRef(type.base, types)}>`;
    case 'struct':
      return type.name;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function emitStructs(types: readonly NagaTypeIR[]): string[] {
  const lines: string[] = [];
  for (const type of types) {
    if (type.kind !== 'struct') continue;
    lines.push(`struct ${type.name} {`);
    for (const field of type.fields) {
      lines.push(`  ${field.name}: ${emitTypeRef(field.type, types)},`);
    }
    lines.push('};', '');
  }
  return lines;
}

function makeError(message: string, location: string, path: string): ShimCompilationResult {
  return {
    wgsl: '',
    is_valid: false,
    errors: [{ message, location, path }],
  };
}

function emitExpression(args: {
  readonly fn: NagaFunctionIR;
  readonly module: NagaModuleIR;
  readonly exprId: number;
  readonly cache: Map<number, string>;
  readonly stack: Set<number>;
}): ShimCompilationResult | string {
  const { fn, module, exprId, cache, stack } = args;
  const cached = cache.get(exprId);
  if (cached !== undefined) {
    return cached;
  }
  if (stack.has(exprId)) {
    return makeError(`Expression cycle detected`, `Expression [${exprId}]`, `Function [${fn.name}]`);
  }
  const expr = fn.expressions[exprId] as NagaExpressionIR | undefined;
  if (!expr) {
    return makeError(`Expression handle not found`, `Expression [${exprId}]`, `Function [${fn.name}]`);
  }

  stack.add(exprId);
  const done = (value: string): string => {
    cache.set(exprId, value);
    stack.delete(exprId);
    return value;
  };

  const recurse = (nextExprId: number): ShimCompilationResult | string =>
    emitExpression({ fn, module, exprId: nextExprId, cache, stack });

  switch (expr.kind) {
    case 'argument': {
      const arg = fn.arguments[expr.argument];
      if (!arg) {
        stack.delete(exprId);
        return makeError(
          `Argument handle not found`,
          `Expression [${exprId}]`,
          `Function [${fn.name}] -> Argument [${expr.argument}]`,
        );
      }
      return done(arg.name);
    }
    case 'constant': {
      const constant = module.constants[expr.constant];
      if (!constant) {
        stack.delete(exprId);
        return makeError(
          `Constant handle not found`,
          `Expression [${exprId}]`,
          `Function [${fn.name}] -> Constant [${expr.constant}]`,
        );
      }
      const type = module.types[constant.type];
      if (!type || type.kind !== 'scalar') {
        stack.delete(exprId);
        return makeError(
          `Constant scalar type is missing`,
          `Expression [${exprId}]`,
          `Function [${fn.name}] -> Constant [${expr.constant}]`,
        );
      }
      return done(formatScalarLiteral(constant.value, type.scalar));
    }
    case 'access_index': {
      const base = recurse(expr.base);
      if (typeof base !== 'string') return base;
      const components = ['x', 'y', 'z', 'w'];
      const component = components[expr.index];
      if (!component) {
        stack.delete(exprId);
        return makeError(
          `access_index out of range`,
          `Expression [${exprId}]`,
          `Function [${fn.name}]`,
        );
      }
      return done(`${base}.${component}`);
    }
    case 'binary': {
      const left = recurse(expr.left);
      if (typeof left !== 'string') return left;
      const right = recurse(expr.right);
      if (typeof right !== 'string') return right;
      const op = expr.op === 'add' ? '+' : '*';
      return done(`(${left} ${op} ${right})`);
    }
    case 'buffer_load': {
      const index = recurse(expr.index);
      if (typeof index !== 'string') return index;
      return done(`${expr.buffer}[${index}]`);
    }
    case 'as': {
      const value = recurse(expr.expr);
      if (typeof value !== 'string') return value;
      const to = expr.to === 'u32' ? 'u32' : 'f32';
      return done(`bitcast<${to}>(${value})`);
    }
    default: {
      const _exhaustive: never = expr;
      stack.delete(exprId);
      return _exhaustive;
    }
  }
}

function emitFunctionBody(fn: NagaFunctionIR, module: NagaModuleIR): ShimCompilationResult | string[] {
  const lines: string[] = [];
  const cache = new Map<number, string>();
  const stack = new Set<number>();
  for (let stmtIndex = 0; stmtIndex < fn.body.length; stmtIndex++) {
    const stmt = fn.body[stmtIndex];
    if (stmt.kind === 'comment') {
      lines.push(`  // ${stmt.text}`);
      continue;
    }
    const indexExpr = emitExpression({ fn, module, exprId: stmt.index, cache, stack });
    if (typeof indexExpr !== 'string') return indexExpr;
    const valueExpr = emitExpression({ fn, module, exprId: stmt.value, cache, stack });
    if (typeof valueExpr !== 'string') return valueExpr;
    lines.push(`  ${stmt.buffer}[${indexExpr}] = ${valueExpr}; // ${stmt.comment}`);
  }
  return lines;
}

export function compile_ir(module: NagaModuleIR, maxActiveLanes?: number): ShimCompilationResult {
  if (!initialized) {
    return makeError('Shim not initialized', 'Module', 'init');
  }
  const computeEntry = module.entry_points.find((entry) => entry.stage === 'compute');
  if (!computeEntry) {
    return makeError('Missing compute entry point', 'EntryPoint', 'Module');
  }
  const fn = module.functions.find((candidate) => candidate.name === computeEntry.function);
  if (!fn) {
    return makeError(
      `Entry point function "${computeEntry.function}" not found`,
      'EntryPoint',
      'Module',
    );
  }

  try {
    const lines: string[] = [
      '// Generated by oscilla_naga_shim.ts (P2-3 bridge stub)',
      ...emitStructs(module.types),
    ];

    for (const global of module.global_variables) {
      const typeRef = emitTypeRef(global.type, module.types);
      if (global.storageClass === 'uniform') {
        lines.push(`@group(${global.binding.group}) @binding(${global.binding.binding}) var<uniform> ${global.name}: ${typeRef};`);
        continue;
      }
      lines.push(
        `@group(${global.binding.group}) @binding(${global.binding.binding}) var<storage, ${global.access}> ${global.name}: ${typeRef};`,
      );
    }
    lines.push('');

    const argParts: string[] = fn.arguments.map((arg) => {
      const typeRef = emitTypeRef(arg.type, module.types);
      const builtinPrefix = arg.builtin ? `@builtin(${arg.builtin}) ` : '';
      return `${builtinPrefix}${arg.name}: ${typeRef}`;
    });
    const body = emitFunctionBody(fn, module);
    if (!Array.isArray(body)) {
      return body;
    }

    const gidArg = fn.arguments.find((arg) => arg.builtin === 'global_invocation_id');
    if (gidArg) {
      const resolvedMaxActiveLanes = maxActiveLanes;
      if (typeof resolvedMaxActiveLanes !== 'number' || !Number.isFinite(resolvedMaxActiveLanes)) {
        throw new Error('MAX_ACTIVE_LANES not found or invalid in source WGSL; cannot determine lane bound');
      }
      const laneBound = Math.max(1, Math.trunc(resolvedMaxActiveLanes));
      lines.push(`const MAX_ACTIVE_LANES: u32 = ${laneBound}u;`);
    }

    lines.push(
      `@compute @workgroup_size(${computeEntry.workgroupSize[0]}, ${computeEntry.workgroupSize[1]}, ${computeEntry.workgroupSize[2]})`,
      `fn ${fn.name}(${argParts.join(', ')}) {`,
    );
    if (gidArg) {
      lines.push(
        `  let lane = ${gidArg.name}.x;`,
        '  if (lane >= MAX_ACTIVE_LANES) {',
        '    return;',
        '  }',
      );
    }
    lines.push(...body, '}');

    return {
      wgsl: lines.join('\n'),
      is_valid: true,
      errors: [],
    };
  } catch (error) {
    return makeError(
      `Emission Failure: ${error instanceof Error ? error.message : String(error)}`,
      'Module',
      'WGSL emit',
    );
  }
}
