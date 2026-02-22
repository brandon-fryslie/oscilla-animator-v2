import type { CompiledProgramIR } from '../compiler/ir/program';
import type { TopologyId } from '../shapes/types';

export type SerializableCompiledProgramIR = Omit<CompiledProgramIR, 'kernelRegistry'>;

// [LAW:one-source-of-truth] Worker payload serialization rules live in one module
// so runtime worker code and clone-safety tests cannot diverge.
export function stripKernelRegistry(program: CompiledProgramIR): SerializableCompiledProgramIR {
  const { kernelRegistry: _drop, ...serializableProgram } = program;
  return serializableProgram;
}

export function collectProgramTopologyIds(
  program: SerializableCompiledProgramIR
): readonly TopologyId[] {
  const ids = new Set<TopologyId>();
  for (const expr of program.valueExprs.nodes as readonly unknown[]) {
    if (!expr || typeof expr !== 'object') continue;

    const candidate = expr as {
      kind?: string;
      topologyId?: unknown;
      kernelKind?: string;
    };

    if (candidate.kind === 'shapeRef' && typeof candidate.topologyId === 'number') {
      ids.add(candidate.topologyId as TopologyId);
      continue;
    }

    if (
      candidate.kind === 'kernel' &&
      (candidate.kernelKind === 'pathDerivative' || candidate.kernelKind === 'pathSample') &&
      typeof candidate.topologyId === 'number'
    ) {
      ids.add(candidate.topologyId as TopologyId);
    }
  }
  return [...ids];
}
