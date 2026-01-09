/**
 * Dense Index Types for IR
 *
 * Branded types for dense numeric indices used in runtime lookups.
 * String IDs are for persistence and debugging; indices are for fast runtime access.
 */
/** Dense index for nodes in the NodeTable. */
export type NodeIndex = number & {
    readonly __brand: 'NodeIndex';
};
/** Dense index for ports within a node. */
export type PortIndex = number & {
    readonly __brand: 'PortIndex';
};
/** Dense index for buses in the BusTable. */
export type BusIndex = number & {
    readonly __brand: 'BusIndex';
};
/** Dense index for value slots in the ValueStore. */
export type ValueSlot = number & {
    readonly __brand: 'ValueSlot';
};
/** Dense index for steps in the Schedule. */
export type StepIndex = number & {
    readonly __brand: 'StepIndex';
};
/** Dense index for signal expressions. */
export type SigExprId = number & {
    readonly __brand: 'SigExprId';
};
/** Dense index for field expressions. */
export type FieldExprId = number & {
    readonly __brand: 'FieldExprId';
};
/** Dense index for event expressions. */
export type EventExprId = number & {
    readonly __brand: 'EventExprId';
};
/** Dense index for transform chains. */
export type TransformChainId = number & {
    readonly __brand: 'TransformChainId';
};
/** Stable string ID for nodes. */
export type NodeId = string & {
    readonly __brand: 'NodeId';
};
/** Stable string ID for buses. */
export type BusId = string & {
    readonly __brand: 'BusId';
};
/** Stable string ID for schedule steps. */
export type StepId = string & {
    readonly __brand: 'StepId';
};
/** Stable string ID for field expressions. */
export type ExprId = string & {
    readonly __brand: 'ExprId';
};
/** Stable string ID for state bindings. */
export type StateId = string & {
    readonly __brand: 'StateId';
};
/** Stable string ID for domains. */
export type DomainId = string & {
    readonly __brand: 'DomainId';
};
/** Stable string ID for slots. */
export type SlotId = string & {
    readonly __brand: 'SlotId';
};
export declare function nodeIndex(n: number): NodeIndex;
export declare function portIndex(n: number): PortIndex;
export declare function busIndex(n: number): BusIndex;
export declare function valueSlot(n: number): ValueSlot;
export declare function stepIndex(n: number): StepIndex;
export declare function sigExprId(n: number): SigExprId;
export declare function fieldExprId(n: number): FieldExprId;
export declare function eventExprId(n: number): EventExprId;
export declare function nodeId(s: string): NodeId;
export declare function busId(s: string): BusId;
export declare function stepId(s: string): StepId;
export declare function exprId(s: string): ExprId;
export declare function stateId(s: string): StateId;
export declare function domainId(s: string): DomainId;
export declare function slotId(s: string): SlotId;
