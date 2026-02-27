import type { CompiledProgramIR } from '../compiler/ir/program';
import type { TopologyId } from '../shapes/types';
import type { SerializableCompiledProgramIR } from './compile-worker-protocol';

// [LAW:one-source-of-truth] Worker payload serialization rules live in one module
// so runtime worker code and clone-safety tests cannot diverge.
export function stripKernelRegistry(program: CompiledProgramIR): SerializableCompiledProgramIR {
  const { kernelRegistry: _drop, ...serializableProgram } = program;
  return serializableProgram;
}

export function collectProgramTopologyIds(
  program: SerializableCompiledProgramIR
): readonly TopologyId[] {
  // [LAW:one-source-of-truth] Compiler-emitted shapeTable is the authoritative
  // topology contract for worker payload export.
  return program.shapeTable.topologyIds;
}
