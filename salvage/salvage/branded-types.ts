/**
 * Branded Types - Zero-cost type safety for indices and IDs
 *
 * Prevents mixing up different index/ID types at compile time.
 * Runtime cost: zero (TypeScript erases brands).
 */

// =============================================================================
// Branded Numeric Index Types
// =============================================================================

export type NodeIndex = number & { readonly __brand: 'NodeIndex' };
export type PortIndex = number & { readonly __brand: 'PortIndex' };
export type BusIndex = number & { readonly __brand: 'BusIndex' };
export type ValueSlot = number & { readonly __brand: 'ValueSlot' };
export type StepIndex = number & { readonly __brand: 'StepIndex' };

// =============================================================================
// Branded String ID Types
// =============================================================================

export type NodeId = string & { readonly __brand: 'NodeId' };
export type BusId = string & { readonly __brand: 'BusId' };
export type StepId = string & { readonly __brand: 'StepId' };
export type ExprId = string & { readonly __brand: 'ExprId' };
export type StateId = string & { readonly __brand: 'StateId' };

// =============================================================================
// Factory Functions (zero-cost casts)
// =============================================================================

export const nodeIndex = (n: number): NodeIndex => n as NodeIndex;
export const portIndex = (n: number): PortIndex => n as PortIndex;
export const busIndex = (n: number): BusIndex => n as BusIndex;
export const valueSlot = (n: number): ValueSlot => n as ValueSlot;
export const stepIndex = (n: number): StepIndex => n as StepIndex;

export const nodeId = (s: string): NodeId => s as NodeId;
export const busId = (s: string): BusId => s as BusId;
export const stepId = (s: string): StepId => s as StepId;
export const exprId = (s: string): ExprId => s as ExprId;
export const stateId = (s: string): StateId => s as StateId;
