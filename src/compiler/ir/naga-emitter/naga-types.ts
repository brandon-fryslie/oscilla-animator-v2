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
    };

export interface NagaConstant {
  readonly type: NagaHandle;
  readonly value: number | boolean | readonly number[];
}

export enum NagaBinaryOp {
  Add = 'Add',
  Subtract = 'Subtract',
  Multiply = 'Multiply',
  Divide = 'Divide',
}

export enum NagaMathFunction {
  Mix = 'Mix',
  Sin = 'Sin',
  Cos = 'Cos',
  Normalize = 'Normalize',
  Min = 'Min',
  Max = 'Max',
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
  | { readonly type: 'Load'; readonly pointer: NagaHandle }
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
    };

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
