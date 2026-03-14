export {
  NagaScalarKind,
  NagaBinaryOp,
  NagaMathFunction,
  type NagaBlock,
  type NagaConstant,
  type NagaExpression,
  type NagaHandle,
  type NagaStatement,
  type NagaType,
  NagaArena,
} from './naga-types';

export { type BlockContext, ExprHandle, NagaBuilder } from './NagaBuilder';
export { ScopeEnvironment } from './ScopeEnvironment';
export { NagaValidationError, collectNagaValidationIssues, validateNagaBuilder } from './NagaValidator';
export {
  lowerScheduleToNagaModule,
  type NagaLoweringProgramIR,
  type NagaModuleIR,
  type NagaFunctionIR,
  type NagaExpressionIR,
  type NagaStatementIR,
  type NagaSourceMapEntryIR,
  type NagaComputeMetadataIR,
  type NagaLoweringCoverageIR,
  type HardDropReason,
  type NagaTypeIR,
  type NagaConstantIR,
  type NagaGlobalVariableIR,
  type NagaEntryPointIR,
  type NagaScalarKindIR,
  type NagaFunctionArgumentIR,
} from './ScheduleNagaLowering';
