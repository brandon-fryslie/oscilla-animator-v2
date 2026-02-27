import { canonicalScalar, type CanonicalType, INT } from '../../../core/canonical-types';
import { OpCode } from '../types';
import { ExprHandle, NagaBuilder } from './NagaBuilder';
import { ScopeEnvironment } from './ScopeEnvironment';
import type { NagaBlock } from './naga-types';
import { validateNagaBuilder } from './NagaValidator';

export type NagaEmitterInstruction =
  | {
      readonly op: 'constFloat';
      readonly outputId: string;
      readonly visualBlockId: string;
      readonly value: number;
    }
  | {
      readonly op: 'constInt';
      readonly outputId: string;
      readonly visualBlockId: string;
      readonly value: number;
    }
  | {
      readonly op: 'constBool';
      readonly outputId: string;
      readonly visualBlockId: string;
      readonly value: boolean;
    }
  | {
      readonly op: 'constMat4';
      readonly outputId: string;
      readonly visualBlockId: string;
    }
  | {
      readonly op: OpCode.Add | OpCode.Mul;
      readonly outputId: string;
      readonly visualBlockId: string;
      readonly inputs: readonly [string, string];
    }
  | {
      readonly op: OpCode.Lerp | OpCode.Select;
      readonly outputId: string;
      readonly visualBlockId: string;
      readonly inputs: readonly [string, string, string];
    }
  | {
      readonly op: 'cast';
      readonly outputId: string;
      readonly visualBlockId: string;
      readonly input: string;
      readonly targetType: CanonicalType;
    }
  | {
      readonly op: 'bufferReadDynamic';
      readonly outputId: string;
      readonly visualBlockId: string;
      readonly bufferKey: string;
      readonly indexId: string;
      readonly targetType: CanonicalType;
    }
  | {
      readonly op: 'bufferWriteDynamic';
      readonly visualBlockId: string;
      readonly bufferKey: string;
      readonly indexId: string;
      readonly valueId: string;
    }
  | {
      readonly op: 'atomicAdd';
      readonly outputId: string;
      readonly visualBlockId: string;
      readonly bufferKey: string;
      readonly indexId: string;
      readonly valueId: string;
    }
  | {
      readonly op: 'loop';
      readonly visualBlockId: string;
      readonly body: readonly NagaEmitterInstruction[];
    }
  | {
      readonly op: 'if';
      readonly visualBlockId: string;
      readonly condition: string;
      readonly acceptBody: readonly NagaEmitterInstruction[];
      readonly rejectBody: readonly NagaEmitterInstruction[];
    }
  | {
      readonly op: 'break' | 'continue';
      readonly visualBlockId: string;
    };

export class WgslNagaCompiler {
  private readonly builder = new NagaBuilder();

  // [LAW:one-source-of-truth] ID resolution lives in one lexical environment chain.
  private currentScope = new ScopeEnvironment();
  private loopDepth = 0;
  private hasCompiled = false;

  public compileRootGraph(instructions: readonly NagaEmitterInstruction[]): NagaBuilder {
    // [LAW:one-source-of-truth] Compiler instances are single-use to prevent cross-graph state aliasing.
    if (this.hasCompiled) {
      throw new Error('CRITICAL FAIL: WgslNagaCompiler instances are single-use; create a new compiler per graph.');
    }
    this.hasCompiled = true;
    this.compileBlock(instructions);
    return this.builder;
  }

  public compileTopologicalGraph(instructions: readonly NagaEmitterInstruction[]): NagaBuilder {
    return this.compileRootGraph(instructions);
  }

  public validate(): void {
    validateNagaBuilder(this.builder);
  }

  public getBuilder(): NagaBuilder {
    return this.builder;
  }

  private compileBlock(instructions: readonly NagaEmitterInstruction[]): NagaBlock {
    return this.builder.buildBlock(() => {
      const parentScope = this.currentScope;
      this.currentScope = new ScopeEnvironment(parentScope);
      try {
        for (const instruction of instructions) {
          this.emitInstruction(instruction);
        }
      } finally {
        this.currentScope = parentScope;
      }
    });
  }

  private compileLoopBody(instructions: readonly NagaEmitterInstruction[]): NagaBlock {
    this.loopDepth += 1;
    try {
      return this.compileBlock(instructions);
    } finally {
      this.loopDepth -= 1;
    }
  }

  private emitInstruction(instruction: NagaEmitterInstruction): void {
    const blockId = instruction.visualBlockId;
    const meta = { visualBlockId: blockId };

    // [LAW:dataflow-not-control-flow] Deterministic instruction traversal; variability is encoded in data values.
    switch (instruction.op) {
      case 'constFloat': {
        this.currentScope.set(instruction.outputId, this.builder.literalFloat(instruction.value, meta));
        return;
      }
      case 'constInt': {
        this.currentScope.set(instruction.outputId, this.builder.literalInt(instruction.value, meta));
        return;
      }
      case 'constBool': {
        this.currentScope.set(instruction.outputId, this.builder.literalBool(instruction.value, meta));
        return;
      }
      case 'constMat4': {
        this.currentScope.set(instruction.outputId, this.builder.literalMatrix4(meta));
        return;
      }
      case OpCode.Add: {
        const left = this.getHandle(instruction.inputs[0], blockId);
        const right = this.getHandle(instruction.inputs[1], blockId);
        this.currentScope.set(instruction.outputId, this.builder.add(left, right, meta));
        return;
      }
      case OpCode.Mul: {
        const left = this.getHandle(instruction.inputs[0], blockId);
        const right = this.getHandle(instruction.inputs[1], blockId);
        this.currentScope.set(instruction.outputId, this.builder.mul(left, right, meta));
        return;
      }
      case OpCode.Lerp: {
        const a = this.getHandle(instruction.inputs[0], blockId);
        const b = this.getHandle(instruction.inputs[1], blockId);
        const t = this.getHandle(instruction.inputs[2], blockId);
        this.currentScope.set(instruction.outputId, this.builder.lerp(a, b, t, meta));
        return;
      }
      case OpCode.Select: {
        const condition = this.getHandle(instruction.inputs[0], blockId);
        const accept = this.getHandle(instruction.inputs[1], blockId);
        const reject = this.getHandle(instruction.inputs[2], blockId);
        this.currentScope.set(instruction.outputId, this.builder.select(condition, accept, reject, meta));
        return;
      }
      case 'cast': {
        const value = this.getHandle(instruction.input, blockId);
        this.currentScope.set(instruction.outputId, this.builder.cast(value, instruction.targetType, meta));
        return;
      }
      case 'bufferReadDynamic': {
        const rawIndex = this.getHandle(instruction.indexId, blockId);

        // [LAW:single-enforcer] Dynamic index clamping is enforced only at this memory-read entrypoint.
        const lengthHandle = this.builder.arrayLength(instruction.bufferKey, meta);
        const lengthAsIntHandle = this.builder.cast(lengthHandle, canonicalScalar(INT), meta);
        const zeroHandle = this.builder.literalInt(0, meta);
        const oneHandle = this.builder.literalInt(1, meta);
        const maxIndexHandle = this.builder.sub(lengthAsIntHandle, oneHandle, meta);
        const safeMaxIndexHandle = this.builder.max(maxIndexHandle, zeroHandle, meta);
        const nonNegativeIndexHandle = this.builder.max(rawIndex, zeroHandle, meta);
        const safeIndexHandle = this.builder.min(nonNegativeIndexHandle, safeMaxIndexHandle, meta);

        const outHandle = this.builder.bufferRead(
          instruction.bufferKey,
          safeIndexHandle,
          instruction.targetType,
          meta,
        );
        this.currentScope.set(instruction.outputId, outHandle);
        return;
      }
      case 'bufferWriteDynamic': {
        const indexHandle = this.getHandle(instruction.indexId, blockId);
        const valueHandle = this.getHandle(instruction.valueId, blockId);
        this.builder.bufferWrite(instruction.bufferKey, indexHandle, valueHandle, meta);
        return;
      }
      case 'atomicAdd': {
        const indexHandle = this.getHandle(instruction.indexId, blockId);
        const valueHandle = this.getHandle(instruction.valueId, blockId);
        const outHandle = this.builder.atomicAdd(instruction.bufferKey, indexHandle, valueHandle, meta);
        this.currentScope.set(instruction.outputId, outHandle);
        return;
      }
      case 'loop': {
        const loopBody = this.compileLoopBody(instruction.body);
        this.builder.loopStatement(loopBody, meta);
        return;
      }
      case 'if': {
        const condition = this.getHandle(instruction.condition, blockId);
        const acceptBlock = this.compileBlock(instruction.acceptBody);
        const rejectBlock = this.compileBlock(instruction.rejectBody);
        this.builder.ifStatement(condition, acceptBlock, rejectBlock, meta);
        return;
      }
      case 'break': {
        if (this.loopDepth <= 0) {
          throw new Error('CRITICAL FAIL: break used outside loop in block ' + blockId + '.');
        }
        this.builder.breakStatement(meta);
        return;
      }
      case 'continue': {
        if (this.loopDepth <= 0) {
          throw new Error('CRITICAL FAIL: continue used outside loop in block ' + blockId + '.');
        }
        this.builder.continueStatement(meta);
        return;
      }
      default: {
        const neverInstruction: never = instruction;
        throw new Error(
          'CRITICAL FAIL: Unrecognized OpCode ' +
            String((neverInstruction as { op?: string }).op ?? 'unknown') +
            ' from block ' +
            blockId +
            '.',
        );
      }
    }
  }

  private getHandle(irNodeId: string, visualBlockId: string): ExprHandle {
    const handle = this.currentScope.get(irNodeId);
    if (handle === undefined) {
      throw new Error(
        'Topological Sort Failure: Attempted to read IR node ' +
          irNodeId +
          ' before it was evaluated (block ' +
          visualBlockId +
          '). This may indicate a variable scope leak where a block tried to access an ID generated inside a sibling or child block.',
      );
    }
    return handle;
  }
}
