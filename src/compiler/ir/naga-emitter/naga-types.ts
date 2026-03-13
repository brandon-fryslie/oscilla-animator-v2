export type NagaHandle = number;

export type NagaBlock = readonly NagaHandle[];

export enum NagaScalarKind {
  Sint = 'Sint',
  Uint = 'Uint',
  Float = 'Float',
  Bool = 'Bool',
}

export type NagaType =
  | {
      readonly kind: 'Scalar';
      readonly scalar: NagaScalarKind;
      readonly width: 4;
    }
  | {
      readonly kind: 'Vector';
      readonly size: 2 | 3 | 4;
      readonly scalar: NagaScalarKind;
      readonly width: 4;
    }
  | {
      readonly kind: 'Matrix';
      readonly columns: 2 | 3 | 4;
      readonly rows: 2 | 3 | 4;
      readonly width: 4;
    }
  | {
      readonly kind: 'Array';
      readonly base: NagaHandle;
      readonly size: 'dynamic' | number;
    }
  | {
      readonly kind: 'Struct';
      readonly name: string;
      readonly fields: readonly NagaStructField[];
    };

export interface NagaStructField {
  readonly name: string;
  readonly type: NagaHandle;
  readonly builtin?: string;
  readonly location?: number;
}

export interface NagaConstant {
  readonly type: NagaHandle;
  readonly value: number | boolean | readonly number[];
}

export enum NagaBinaryOp {
  Add = 'Add',
  Subtract = 'Subtract',
  Multiply = 'Multiply',
  Divide = 'Divide',
  Modulo = 'Modulo',
  Less = 'Less',
  LessEqual = 'LessEqual',
  Greater = 'Greater',
  GreaterEqual = 'GreaterEqual',
  Equal = 'Equal',
  NotEqual = 'NotEqual',
}

export enum NagaMathFunction {
  Mix = 'Mix',
  Sin = 'Sin',
  Cos = 'Cos',
  Normalize = 'Normalize',
  Min = 'Min',
  Max = 'Max',
  Abs = 'Abs',
  Atan2 = 'Atan2',
  Ceil = 'Ceil',
  Clamp = 'Clamp',
  Exp = 'Exp',
  Floor = 'Floor',
  Fract = 'Fract',
  Log = 'Log',
  Pow = 'Pow',
  Round = 'Round',
  Sign = 'Sign',
  Sqrt = 'Sqrt',
  Tan = 'Tan',
  Trunc = 'Trunc',
}

export type NagaExpression =
  | { readonly type: 'Constant'; readonly constant: NagaHandle }
  | {
      readonly type: 'Binary';
      readonly op: NagaBinaryOp;
      readonly left: NagaHandle;
      readonly right: NagaHandle;
    }
  | {
      readonly type: 'Math';
      readonly fun: NagaMathFunction;
      readonly arg: NagaHandle;
      readonly arg1?: NagaHandle;
      readonly arg2?: NagaHandle;
    }
  | {
      readonly type: 'Select';
      readonly condition: NagaHandle;
      readonly accept: NagaHandle;
      readonly reject: NagaHandle;
    }
  | { readonly type: 'GlobalVariable'; readonly variable: NagaHandle }
  | { readonly type: 'Compose'; readonly ty: NagaHandle; readonly components: readonly NagaHandle[] }
  | { readonly type: 'ArrayLength'; readonly expr: NagaHandle }
  | { readonly type: 'Access'; readonly base: NagaHandle; readonly index: NagaHandle }
  | { readonly type: 'AccessIndex'; readonly base: NagaHandle; readonly index: number }
  | { readonly type: 'Load'; readonly pointer: NagaHandle }
  | { readonly type: 'As'; readonly expr: NagaHandle; readonly kind: NagaScalarKind; readonly convert: boolean }
  | { readonly type: 'FunctionArgument'; readonly index: number }
  | { readonly type: 'Call'; readonly function: NagaHandle; readonly arguments: readonly NagaHandle[] }
  | { readonly type: 'AtomicResult'; readonly kind: 'Add'; readonly pointer: NagaHandle; readonly value: NagaHandle };

export type NagaStatement =
  | {
      readonly type: 'StoreState';
      readonly stateKey: string;
      readonly value: NagaHandle;
    }
  | {
      readonly type: 'Store';
      readonly pointer: NagaHandle;
      readonly value: NagaHandle;
    }
  | {
      readonly type: 'Loop';
      readonly body: NagaBlock;
    }
  | {
      readonly type: 'If';
      readonly condition: NagaHandle;
      readonly accept: NagaBlock;
      readonly reject: NagaBlock;
    }
  | {
      readonly type: 'Break';
    }
  | {
      readonly type: 'Continue';
    }
  | {
      readonly type: 'Return';
      readonly value?: NagaHandle;
    }
  | {
      readonly type: 'Comment';
      readonly text: string;
    };

// =============================================================================
// Module-Level Types
// =============================================================================

export type NagaStorageClass = 'storage' | 'uniform';
export type NagaStorageAccess = 'read' | 'read_write';

export interface NagaGlobalVariable {
  readonly name: string;
  readonly storageClass: NagaStorageClass;
  readonly access: NagaStorageAccess;
  readonly binding: {
    readonly group: number;
    readonly binding: number;
  };
  readonly type: NagaHandle;
}

export type NagaBuiltinName =
  | 'global_invocation_id'
  | 'vertex_index'
  | 'instance_index'
  | 'position'
  | 'front_facing';

export interface NagaFunctionArgument {
  readonly name: string;
  readonly type: NagaHandle;
  readonly builtin?: NagaBuiltinName;
}

// [LAW:one-source-of-truth] Each NagaFunction owns its own expression and
// statement arenas, matching naga's Rust model where both are per-function scoped.
export interface NagaFunction {
  readonly name: string;
  readonly arguments: readonly NagaFunctionArgument[];
  readonly returnType: NagaHandle | null;
  readonly expressions: readonly NagaExpression[];
  readonly statements: readonly NagaStatement[];
  readonly body: NagaBlock;
}

export type NagaEntryPointStage = 'compute' | 'vertex' | 'fragment';

export interface NagaEntryPoint {
  readonly stage: NagaEntryPointStage;
  readonly function: string;
  readonly workgroupSize: readonly [number, number, number];
}

// [LAW:one-source-of-truth] NagaModule is the canonical structured IR
// representation consumed by the Rust/WASM Naga shim for WGSL emission.
export interface NagaModule {
  readonly types: readonly NagaType[];
  readonly constants: readonly NagaConstant[];
  readonly global_variables: readonly NagaGlobalVariable[];
  readonly functions: readonly NagaFunction[];
  readonly entry_points: readonly NagaEntryPoint[];
}

export class NagaArena<T> {
  private readonly items: T[] = [];

  public append(item: T): NagaHandle {
    this.items.push(item);
    return this.items.length - 1;
  }

  public get(handle: NagaHandle): T {
    const value = this.items[handle];
    if (value === undefined) {
      throw new Error('NagaArena: invalid handle ' + String(handle));
    }
    return value;
  }

  public length(): number {
    return this.items.length;
  }

  public toArray(): readonly T[] {
    return this.items;
  }
}

export interface NagaArenaReader<T> {
  get(handle: NagaHandle): T;
  length(): number;
  toArray(): readonly T[];
}
