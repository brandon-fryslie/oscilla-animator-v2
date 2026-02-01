/**
 * Canonical Type System for Oscilla v2.5
 *
 * Barrel re-export — consumers import from '@/core/canonical-types'
 * which resolves to this index.ts. Zero import changes needed.
 *
 * File-per-axis layout:
 *   units.ts, payloads.ts, const-values.ts, stride.ts,
 *   axis.ts, cardinality.ts, temporality.ts, binding.ts,
 *   perspective.ts, branch.ts, extent.ts,
 *   instance-ref.ts, canonical-type.ts, equality.ts, legacy.ts
 */

export {
  type UnitType,
  unitNone,
  unitScalar,
  unitNorm01,
  unitCount,
  unitPhase01,
  unitRadians,
  unitDegrees,
  unitMs,
  unitSeconds,
  unitNdc2,
  unitNdc3,
  unitWorld2,
  unitWorld3,
  unitRgba01,
  unitsEqual,
} from './units';

export {
  type CameraProjection,
  type ConcretePayloadType,
  type PayloadType,
  type PayloadKind,
  FLOAT,
  INT,
  BOOL,
  VEC2,
  VEC3,
  COLOR,
  CAMERA_PROJECTION,
  payloadFromKind,
  payloadsEqual,
  isValidPayloadUnit,
  defaultUnitForPayload,
} from './payloads';

export {
  type ConstValue,
  constValueMatchesPayload,
  floatConst,
  intConst,
  boolConst,
  vec2Const,
  vec3Const,
  colorConst,
  cameraProjectionConst,
  constValueAsNumber,
  constValueAsBool,
} from './const-values';

export { payloadStride } from './stride';

export {
  type Axis,
  axisVar,
  axisInst,
  isAxisVar,
  isAxisInst,
  requireInst,
} from './axis';

export {
  type CardinalityValue,
  type Cardinality,
  cardinalityZero,
  cardinalityOne,
  cardinalityMany,
  isMany,
  isOne,
  isZero,
} from './cardinality';

export {
  type TemporalityValue,
  type Temporality,
  temporalityContinuous,
  temporalityDiscrete,
} from './temporality';

export {
  type BindingValue,
  type Binding,
  DEFAULT_BINDING,
  bindingUnbound,
  bindingWeak,
  bindingStrong,
  bindingIdentity,
} from './binding';

export {
  type PerspectiveValue,
  type Perspective,
  DEFAULT_PERSPECTIVE,
} from './perspective';

export {
  type BranchValue,
  type Branch,
  DEFAULT_BRANCH,
} from './branch';

export { type Extent } from './extent';

export { type InstanceRef, instanceRef } from './instance-ref';

export {
  type CanonicalType,
  canonicalType,
  canonicalSignal,
  canonicalField,
  canonicalEvent,
  canonicalConst,
  requireManyInstance,
  withInstance,
} from './canonical-type';

export {
  cardinalitiesEqual,
  temporalitiesEqual,
  bindingsEqual,
  perspectivesEqual,
  branchesEqual,
  extentsEqual,
  typesEqual,
} from './equality';

