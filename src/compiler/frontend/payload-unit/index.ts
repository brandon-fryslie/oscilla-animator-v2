/**
 * Payload/Unit Solver — barrel export.
 *
 * Consumers import from '@/compiler/frontend/payload-unit'.
 */

export {
  solvePayloadUnit,
  buildPortVarMapping,
  type PayloadUnitConstraint,
  type PayloadEqConstraint,
  type UnitEqConstraint,
  type RequirePayloadInConstraint,
  type RequireUnitlessConstraint,
  type ConcretePayloadConstraint,
  type ConcreteUnitConstraint,
  type ConstraintOrigin,
  type PUSolveError,
  type PUSolveErrorClass,
  type PayloadUnitSolveResult,
  type PayloadUnitEdgeVerification,
  type EqualEdgeVerification,
  type CollectEdgeVerification,
} from './solve';
