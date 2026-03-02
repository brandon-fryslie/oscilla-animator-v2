export type WgslAccessModeNode = 'read' | 'read_write';
export type WgslBinaryOpNode = '+' | '*' | '>=' | '||';

export type WgslTypeNode =
  | { readonly kind: 'named'; readonly name: string }
  | { readonly kind: 'array'; readonly elementType: string }
  | {
      readonly kind: 'var';
      readonly storageClass: 'uniform' | 'storage';
      readonly accessMode?: WgslAccessModeNode;
      readonly innerType: WgslTypeNode;
    };

export type WgslExpressionNode =
  | { readonly kind: 'identifier'; readonly name: string }
  | { readonly kind: 'u32_literal'; readonly value: number }
  | { readonly kind: 'member'; readonly target: WgslExpressionNode; readonly member: string }
  | { readonly kind: 'index'; readonly target: WgslExpressionNode; readonly index: WgslExpressionNode }
  | {
      readonly kind: 'binary';
      readonly op: WgslBinaryOpNode;
      readonly left: WgslExpressionNode;
      readonly right: WgslExpressionNode;
    };

export type WgslStatementNode =
  | { readonly kind: 'let'; readonly name: string; readonly expr: WgslExpressionNode }
  | { readonly kind: 'return' }
  | {
      readonly kind: 'if';
      readonly condition: WgslExpressionNode;
      readonly body: readonly WgslStatementNode[];
    }
  | {
      readonly kind: 'assign';
      readonly target: WgslExpressionNode;
      readonly value: WgslExpressionNode;
      readonly comment?: string;
    };

export interface WgslStructFieldNode {
  readonly name: string;
  readonly type: string;
  readonly comment?: string;
}

export type WgslDeclarationNode =
  | {
      readonly kind: 'struct';
      readonly name: string;
      readonly fields: readonly WgslStructFieldNode[];
    }
  | {
      readonly kind: 'binding';
      readonly group: number;
      readonly binding: number;
      readonly name: string;
      readonly type: WgslTypeNode;
    }
  | {
      readonly kind: 'const';
      readonly name: string;
      readonly type: string;
      readonly value: WgslExpressionNode;
    }
  | {
      readonly kind: 'compute_function';
      readonly name: string;
      readonly workgroupSize: number;
      readonly builtinGlobalInvocationParam: string;
      readonly body: readonly WgslStatementNode[];
    };

export interface WgslModuleNode {
  readonly headerComment?: string;
  readonly declarations: readonly WgslDeclarationNode[];
}

export interface DrawPrepWgslConfig {
  readonly workgroupSize: number;
  readonly recordWords: number;
  readonly drawPrepParamsComment?: string;
}

function ident(name: string): WgslExpressionNode {
  return { kind: 'identifier', name };
}

function u32(value: number): WgslExpressionNode {
  return { kind: 'u32_literal', value };
}

function member(target: WgslExpressionNode, field: string): WgslExpressionNode {
  return { kind: 'member', target, member: field };
}

function index(target: WgslExpressionNode, idx: WgslExpressionNode): WgslExpressionNode {
  return { kind: 'index', target, index: idx };
}

function binary(op: WgslBinaryOpNode, left: WgslExpressionNode, right: WgslExpressionNode): WgslExpressionNode {
  return { kind: 'binary', op, left, right };
}

export function createDrawPrepWgslAst(config: DrawPrepWgslConfig): WgslModuleNode {
  const gidX = member(ident('gid'), 'x');
  const recordIndex = ident('recordIndex');
  const recordCount = ident('recordCount');
  const maxRecords = ident('maxRecords');
  const base = ident('base');
  const drawPrepParams = ident('drawPrepParams');
  const drawPrepRecords = ident('drawPrepRecords');
  const indirectArgs = ident('indirectArgs');

  const recordCountExpr = member(member(drawPrepParams, 'v0'), 'x');
  const maxRecordsExpr = member(member(drawPrepParams, 'v0'), 'y');
  const baseExpr = binary('*', recordIndex, ident('DRAW_PREP_RECORD_WORDS'));

  const manifestFieldComments = [
    'indexCount',
    'instanceCount',
    'firstIndex',
    'baseVertex bits',
    'firstInstance',
  ] as const;

  const drawPrepCopies: WgslStatementNode[] = manifestFieldComments.map((comment, fieldIndex) => {
    const fieldOffset = binary('+', base, u32(fieldIndex));
    return {
      kind: 'assign',
      target: index(indirectArgs, fieldOffset),
      value: index(drawPrepRecords, fieldOffset),
      comment,
    };
  });

  const drawPrepComment =
    config.drawPrepParamsComment ??
    'v0 = [recordCount, maxRecords, _, _]';

  // [LAW:one-source-of-truth] Draw-prep shader structure is emitted from one
  // AST source so compiler and runtime defaults cannot drift.
  return {
    headerComment: 'Auto-generated draw-prep WGSL (v3 stage-3).',
    declarations: [
      {
        kind: 'struct',
        name: 'DrawPrepParams',
        fields: [
          {
            name: 'v0',
            type: 'vec4<u32>',
            comment: drawPrepComment,
          },
        ],
      },
      {
        kind: 'binding',
        group: 0,
        binding: 0,
        name: 'indirectArgs',
        type: {
          kind: 'var',
          storageClass: 'storage',
          accessMode: 'read_write',
          innerType: { kind: 'array', elementType: 'u32' },
        },
      },
      {
        kind: 'binding',
        group: 0,
        binding: 1,
        name: 'drawPrepRecords',
        type: {
          kind: 'var',
          storageClass: 'storage',
          accessMode: 'read',
          innerType: { kind: 'array', elementType: 'u32' },
        },
      },
      {
        kind: 'binding',
        group: 0,
        binding: 2,
        name: 'drawPrepParams',
        type: {
          kind: 'var',
          storageClass: 'uniform',
          innerType: { kind: 'named', name: 'DrawPrepParams' },
        },
      },
      {
        kind: 'const',
        name: 'DRAW_PREP_RECORD_WORDS',
        type: 'u32',
        value: u32(config.recordWords),
      },
      {
        kind: 'compute_function',
        name: 'cs_main',
        workgroupSize: config.workgroupSize,
        builtinGlobalInvocationParam: 'gid',
        body: [
          { kind: 'let', name: 'recordIndex', expr: gidX },
          { kind: 'let', name: 'recordCount', expr: recordCountExpr },
          { kind: 'let', name: 'maxRecords', expr: maxRecordsExpr },
          {
            kind: 'if',
            condition: binary(
              '||',
              binary('>=', recordIndex, recordCount),
              binary('>=', recordIndex, maxRecords),
            ),
            body: [{ kind: 'return' }],
          },
          { kind: 'let', name: 'base', expr: baseExpr },
          ...drawPrepCopies,
        ],
      },
    ],
  };
}

function expressionPrecedence(expr: WgslExpressionNode): number {
  switch (expr.kind) {
    case 'binary':
      switch (expr.op) {
        case '||':
          return 1;
        case '>=':
          return 2;
        case '+':
          return 3;
        case '*':
          return 4;
        default:
          return 0;
      }
    case 'member':
    case 'index':
      return 5;
    case 'identifier':
    case 'u32_literal':
      return 6;
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

function emitType(type: WgslTypeNode): string {
  switch (type.kind) {
    case 'named':
      return type.name;
    case 'array':
      return `array<${type.elementType}>`;
    case 'var': {
      if (type.storageClass === 'uniform') {
        return `var<uniform> ${emitType(type.innerType)}`;
      }
      return `var<storage, ${type.accessMode ?? 'read'}> ${emitType(type.innerType)}`;
    }
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function emitExpression(expr: WgslExpressionNode, parentPrecedence = 0): string {
  switch (expr.kind) {
    case 'identifier':
      return expr.name;
    case 'u32_literal':
      return `${expr.value}u`;
    case 'member':
      return `${emitExpression(expr.target, expressionPrecedence(expr))}.${expr.member}`;
    case 'index':
      return `${emitExpression(expr.target, expressionPrecedence(expr))}[${emitExpression(expr.index)}]`;
    case 'binary': {
      const precedence = expressionPrecedence(expr);
      const left = emitExpression(expr.left, precedence);
      const right = emitExpression(expr.right, precedence + 1);
      const output = `${left} ${expr.op} ${right}`;
      return precedence < parentPrecedence ? `(${output})` : output;
    }
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}

function emitStatement(statement: WgslStatementNode, indent: string): string[] {
  switch (statement.kind) {
    case 'let':
      return [`${indent}let ${statement.name} = ${emitExpression(statement.expr)};`];
    case 'return':
      return [`${indent}return;`];
    case 'assign': {
      const line = `${indent}${emitExpression(statement.target)} = ${emitExpression(statement.value)};`;
      return statement.comment ? [`${line} // ${statement.comment}`] : [line];
    }
    case 'if': {
      const lines: string[] = [`${indent}if (${emitExpression(statement.condition)}) {`];
      for (const child of statement.body) {
        lines.push(...emitStatement(child, `${indent}  `));
      }
      lines.push(`${indent}}`);
      return lines;
    }
    default: {
      const _exhaustive: never = statement;
      return _exhaustive;
    }
  }
}

export function emitWgslModule(module: WgslModuleNode): string {
  const lines: string[] = [];

  if (module.headerComment) {
    lines.push(`// ${module.headerComment}`);
  }

  for (const declaration of module.declarations) {
    if (lines.length > 0) {
      lines.push('');
    }

    switch (declaration.kind) {
      case 'struct': {
        lines.push(`struct ${declaration.name} {`);
        for (const field of declaration.fields) {
          if (field.comment) {
            lines.push(`  // ${field.comment}`);
          }
          lines.push(`  ${field.name}: ${field.type},`);
        }
        lines.push('};');
        break;
      }
      case 'binding': {
        lines.push(
          `@group(${declaration.group}) @binding(${declaration.binding}) ${emitType(declaration.type)} ${declaration.name}: ${emitType(declaration.type.kind === 'var' ? declaration.type.innerType : declaration.type)};`,
        );
        break;
      }
      case 'const': {
        lines.push(`const ${declaration.name}: ${declaration.type} = ${emitExpression(declaration.value)};`);
        break;
      }
      case 'compute_function': {
        lines.push(`@compute @workgroup_size(${declaration.workgroupSize})`);
        lines.push(
          `fn ${declaration.name}(@builtin(global_invocation_id) ${declaration.builtinGlobalInvocationParam}: vec3<u32>) {`,
        );
        for (const statement of declaration.body) {
          lines.push(...emitStatement(statement, '  '));
        }
        lines.push('}');
        break;
      }
      default: {
        const _exhaustive: never = declaration;
        void _exhaustive;
      }
    }
  }

  return lines.join('\n');
}
