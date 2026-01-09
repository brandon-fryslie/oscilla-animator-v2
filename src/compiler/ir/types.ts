/**
 * Intermediate Representation (IR) Types
 *
 * The IR is a low-level representation of the animation program.
 * It consists of:
 * - SigExpr: Signal expressions (evaluated once per frame)
 * - FieldExpr: Field expressions (evaluated per-element at sinks)
 * - EventExpr: Event expressions (edge-triggered)
 * - Steps: Execution schedule
 */

// Import canonical types as source of truth
import type { SignalType } from '../../core/canonical-types';

// Import ValueSlot for use in this file
import type { ValueSlot as _ValueSlot } from './Indices';
type ValueSlot = _ValueSlot;

// Re-export branded indices
export type {
  NodeIndex,
  PortIndex,
  BusIndex,
  ValueSlot,
  StepIndex,
  SigExprId,
  FieldExprId,
  EventExprId,
  TransformChainId,
  NodeId,
  BusId,
  StepId,
  ExprId,
  StateId,
  DomainId,
  SlotId,
} from './Indices';

export {
  nodeIndex,
  portIndex,
  busIndex,
  valueSlot,
  stepIndex,
  sigExprId,
  fieldExprId,
  eventExprId,
  nodeId,
  busId,
  stepId,
  exprId,
  stateId,
  domainId,
  slotId,
} from './Indices';

import type {
  SigExprId,
  FieldExprId,
  EventExprId,
  DomainId,
  SlotId,
} from './Indices';

// =============================================================================
// Signal Expressions
// =============================================================================

export type SigExpr =
  | SigExprConst
  | SigExprSlot
  | SigExprTime
  | SigExprExternal
  | SigExprMap
  | SigExprZip;

export interface SigExprConst {
  readonly kind: 'const';
  readonly value: number | string | boolean;
  readonly type: SignalType;
}

export interface SigExprSlot {
  readonly kind: 'slot';
  readonly slot: ValueSlot;
  readonly type: SignalType;
}

export interface SigExprTime {
  readonly kind: 'time';
  readonly which: 't' | 'dt' | 'phase' | 'pulse' | 'energy';
  readonly type: SignalType;
}

export interface SigExprExternal {
  readonly kind: 'external';
  readonly which: 'mouseX' | 'mouseY' | 'mouseOver';
  readonly type: SignalType;
}

export interface SigExprMap {
  readonly kind: 'map';
  readonly input: SigExprId;
  readonly fn: PureFn;
  readonly type: SignalType;
}

export interface SigExprZip {
  readonly kind: 'zip';
  readonly inputs: readonly SigExprId[];
  readonly fn: PureFn;
  readonly type: SignalType;
}

// =============================================================================
// Field Expressions
// =============================================================================

export type FieldExpr =
  | FieldExprConst
  | FieldExprSource
  | FieldExprBroadcast
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprMapIndexed;

export interface FieldExprConst {
  readonly kind: 'const';
  readonly value: number | string;
  readonly type: SignalType;
}

export interface FieldExprSource {
  readonly kind: 'source';
  readonly domain: DomainId;
  readonly sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex';
  readonly type: SignalType;
}

export interface FieldExprBroadcast {
  readonly kind: 'broadcast';
  readonly signal: SigExprId;
  readonly type: SignalType;
}

export interface FieldExprMap {
  readonly kind: 'map';
  readonly input: FieldExprId;
  readonly fn: PureFn;
  readonly type: SignalType;
}

export interface FieldExprZip {
  readonly kind: 'zip';
  readonly inputs: readonly FieldExprId[];
  readonly fn: PureFn;
  readonly type: SignalType;
}

export interface FieldExprZipSig {
  readonly kind: 'zipSig';
  readonly field: FieldExprId;
  readonly signals: readonly SigExprId[];
  readonly fn: PureFn;
  readonly type: SignalType;
}

export interface FieldExprMapIndexed {
  readonly kind: 'mapIndexed';
  readonly domain: DomainId;
  readonly fn: PureFn;
  readonly signals?: readonly SigExprId[];
  readonly type: SignalType;
}

// =============================================================================
// Event Expressions
// =============================================================================

export type EventExpr =
  | EventExprPulse
  | EventExprWrap
  | EventExprCombine;

export interface EventExprPulse {
  readonly kind: 'pulse';
  readonly source: 'timeRoot';
}

export interface EventExprWrap {
  readonly kind: 'wrap';
  readonly signal: SigExprId;
}

export interface EventExprCombine {
  readonly kind: 'combine';
  readonly events: readonly EventExprId[];
  readonly mode: 'any' | 'all';
}

// =============================================================================
// Pure Functions
// =============================================================================

export type PureFn =
  | { kind: 'opcode'; opcode: OpCode }
  | { kind: 'expr'; expr: string }
  | { kind: 'kernel'; name: string };

export enum OpCode {
  // Arithmetic
  Add = 'add',
  Sub = 'sub',
  Mul = 'mul',
  Div = 'div',
  Mod = 'mod',
  Neg = 'neg',
  Abs = 'abs',

  // Trigonometric
  Sin = 'sin',
  Cos = 'cos',
  Tan = 'tan',

  // Range
  Min = 'min',
  Max = 'max',
  Clamp = 'clamp',
  Lerp = 'lerp',

  // Comparison
  Eq = 'eq',
  Lt = 'lt',
  Gt = 'gt',

  // Phase
  Wrap01 = 'wrap01',
}

// =============================================================================
// Domains
// =============================================================================

export interface DomainDef {
  readonly id: DomainId;
  readonly kind: 'grid' | 'n' | 'path';
  readonly count: number;
  readonly elementIds: readonly string[];
  readonly params: Readonly<Record<string, unknown>>;
}

// =============================================================================
// Time Model
// =============================================================================

export type TimeModel =
  | { kind: 'finite'; durationMs: number }
  | { kind: 'infinite'; windowMs?: number }
  | { kind: 'cyclic'; periodMs: number };

// =============================================================================
// Schedule Steps
// =============================================================================

export type Step =
  | StepEvalSig
  | StepMaterialize
  | StepRender;

export interface StepEvalSig {
  readonly kind: 'evalSig';
  readonly expr: SigExprId;
  readonly target: ValueSlot;
}

export interface StepMaterialize {
  readonly kind: 'materialize';
  readonly field: FieldExprId;
  readonly domain: DomainId;
  readonly target: ValueSlot;
}

export interface StepRender {
  readonly kind: 'render';
  readonly domain: DomainId;
  readonly position: FieldExprId;
  readonly color: FieldExprId;
  readonly size?: SigExprId | FieldExprId;
}

// =============================================================================
// Complete IR Program
// =============================================================================

export interface IRProgram {
  readonly timeModel: TimeModel;
  readonly signals: ReadonlyMap<SigExprId, SigExpr>;
  readonly fields: ReadonlyMap<FieldExprId, FieldExpr>;
  readonly events: ReadonlyMap<EventExprId, EventExpr>;
  readonly domains: ReadonlyMap<DomainId, DomainDef>;
  readonly steps: readonly Step[];
  readonly slotCount: number;
}
