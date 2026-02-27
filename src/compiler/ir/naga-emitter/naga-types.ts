export type NagaHandle = number;

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
  Min = 'Min',
  Max = 'Max',
}

export enum NagaMathFunction {
  Mix = 'Mix',
  Sin = 'Sin',
  Cos = 'Cos',
  Normalize = 'Normalize',
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
  | { readonly type: 'ArrayLength'; readonly bufferKey: string }
  | { readonly type: 'BufferRead'; readonly bufferKey: string; readonly index: NagaHandle }
  | { readonly type: 'AtomicAdd'; readonly bufferKey: string; readonly index: NagaHandle; readonly value: NagaHandle };

export type NagaStatement =
  | {
      readonly type: 'StoreState';
      readonly stateKey: string;
      readonly value: NagaHandle;
    }
  | {
      readonly type: 'BufferWrite';
      readonly bufferKey: string;
      readonly index: NagaHandle;
      readonly value: NagaHandle;
    }
  | {
      readonly type: 'Loop';
      readonly body: NagaHandle;
    }
  | {
      readonly type: 'If';
      readonly condition: NagaHandle;
      readonly accept: NagaHandle;
      readonly reject: NagaHandle;
    }
  | {
      readonly type: 'Break';
    }
  | {
      readonly type: 'Continue';
    };

export interface NagaBlock {
  readonly statements: NagaHandle[];
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
