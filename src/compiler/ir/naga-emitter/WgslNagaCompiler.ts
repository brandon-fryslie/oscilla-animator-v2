import type { CanonicalType } from '../../../core/canonical-types';
import { OpCode } from '../types';
import { ExprHandle, NagaBuilder } from './NagaBuilder';
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
      readonly op: OpCode.Lerp;
      readonly outputId: string;
      readonly visualBlockId: string;
      readonly inputs: readonly [string, string, string];
    }
  | {
      readonly op: OpCode.Select;
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
    };

export class WgslNagaCompiler {
  private readonly builder = new NagaBuilder();
  // [LAW:one-source-of-truth] IR output ids resolve through this single handle map.
  private readonly irToNagaMap = new Map<string, ExprHandle>();

  public compileTopologicalGraph(instructions: readonly NagaEmitterInstruction[]): NagaBuilder {
    for (const instruction of instructions) {
      this.emitInstruction(instruction);
    }
    return this.builder;
  }

  public validate(): void {
    validateNagaBuilder(this.builder);
  }

  public getBuilder(): NagaBuilder {
    return this.builder;
  }

  private emitInstruction(instruction: NagaEmitterInstruction): void {
    const blockId = instruction.visualBlockId;
    const meta = { visualBlockId: blockId };

    // [LAW:dataflow-not-control-flow] Deterministic topological lowering; variability is in instruction data.
    switch (instruction.op) {
      case 'constFloat': {
        const outHandle = this.builder.literalFloat(instruction.value, meta);
        this.irToNagaMap.set(instruction.outputId, outHandle);
        return;
      }
      case 'constInt': {
        const outHandle = this.builder.literalInt(instruction.value, meta);
        this.irToNagaMap.set(instruction.outputId, outHandle);
        return;
      }
      case 'constBool': {
        const outHandle = this.builder.literalBool(instruction.value, meta);
        this.irToNagaMap.set(instruction.outputId, outHandle);
        return;
      }
      case 'constMat4': {
        const outHandle = this.builder.literalMatrix4(meta);
        this.irToNagaMap.set(instruction.outputId, outHandle);
        return;
      }
      case OpCode.Add: {
        const left = this.getHandle(instruction.inputs[0], blockId);
        const right = this.getHandle(instruction.inputs[1], blockId);
        const outHandle = this.builder.add(left, right, meta);
        this.irToNagaMap.set(instruction.outputId, outHandle);
        return;
      }
      case OpCode.Mul: {
        const left = this.getHandle(instruction.inputs[0], blockId);
        const right = this.getHandle(instruction.inputs[1], blockId);
        const outHandle = this.builder.mul(left, right, meta);
        this.irToNagaMap.set(instruction.outputId, outHandle);
        return;
      }
      case OpCode.Lerp: {
        const a = this.getHandle(instruction.inputs[0], blockId);
        const b = this.getHandle(instruction.inputs[1], blockId);
        const t = this.getHandle(instruction.inputs[2], blockId);
        const outHandle = this.builder.lerp(a, b, t, meta);
        this.irToNagaMap.set(instruction.outputId, outHandle);
        return;
      }
      case OpCode.Select: {
        const condition = this.getHandle(instruction.inputs[0], blockId);
        const accept = this.getHandle(instruction.inputs[1], blockId);
        const reject = this.getHandle(instruction.inputs[2], blockId);
        const outHandle = this.builder.select(condition, accept, reject, meta);
        this.irToNagaMap.set(instruction.outputId, outHandle);
        return;
      }
      case 'cast': {
        const value = this.getHandle(instruction.input, blockId);
        const outHandle = this.builder.cast(value, instruction.targetType, meta);
        this.irToNagaMap.set(instruction.outputId, outHandle);
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
    const handle = this.irToNagaMap.get(irNodeId);
    if (!handle) {
      throw new Error(
        'Topological Sort Failure: Attempted to read IR node ' +
          irNodeId +
          ' before it was evaluated (block ' +
          visualBlockId +
          ').',
      );
    }
    return handle;
  }
}
