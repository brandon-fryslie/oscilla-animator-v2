import type { CompiledProgramIR } from '../compiler/ir/program';

// [LAW:one-source-of-truth] Worker payload serialization rules live in one module
// so runtime worker code and clone-safety tests cannot diverge.
export function stripKernelRegistry<TProgram extends CompiledProgramIR>(
  program: TProgram,
): Omit<TProgram, 'kernelRegistry'> {
  const { kernelRegistry: _drop, ...serializableProgram } = program;
  return serializableProgram;
}
