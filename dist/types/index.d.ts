/**
 * Core type definitions for Oscilla v2
 *
 * This module consolidates all types from core/types.ts and compiler/ir/Indices.ts.
 * It provides a single import point for common types.
 */
export type { Block, Edge, Endpoint, Patch, PortRef, BlockType } from '../graph/Patch';
export type { TypeWorld, Domain, TypeCategory, TypeDesc, CoreDomain, InternalDomain, } from '../core/types';
export { createTypeDesc, getTypeArity, inferBundleLanes, sigType, fieldType, scalarType, eventType, } from '../core/types';
import type { TypeWorld as CoreTypeWorld } from '../core/types';
export type World = CoreTypeWorld;
export type { NodeIndex, PortIndex, BusIndex, ValueSlot, StepIndex, SigExprId, FieldExprId, EventExprId, TransformChainId, NodeId, BusId, StepId, ExprId, StateId, DomainId, SlotId, } from '../compiler/ir/Indices';
export { nodeIndex, portIndex, busIndex, valueSlot, stepIndex, sigExprId, fieldExprId, eventExprId, nodeId, busId, stepId, exprId, stateId, domainId, slotId, } from '../compiler/ir/Indices';
declare const BlockIdBrand: unique symbol;
declare const PortIdBrand: unique symbol;
export type BlockId = string & {
    readonly [BlockIdBrand]: never;
};
export type PortId = string & {
    readonly [PortIdBrand]: never;
};
export declare function blockId(s: string): BlockId;
export declare function portId(s: string): PortId;
/**
 * Check if source type can connect to target type.
 * Returns the conversion needed, or null if incompatible.
 */
export declare function getConversion(source: {
    world: string;
    domain: string;
}, target: {
    world: string;
    domain: string;
}): Conversion | null;
export type Conversion = {
    kind: 'direct';
} | {
    kind: 'promote';
    from: 'scalar';
    to: 'signal';
} | {
    kind: 'broadcast';
} | {
    kind: 'promote-broadcast';
};
export type SlotWorld = 'signal' | 'field' | 'scalar' | 'config';
export type CombineMode = 'last' | 'first' | 'sum' | 'average' | 'max' | 'min';
import type { TypeDesc } from '../core/types';
export type TransformStep = AdapterStep | LensStep;
export interface AdapterStep {
    readonly kind: 'adapter';
    readonly from: TypeDesc;
    readonly to: TypeDesc;
    readonly adapter: string;
    readonly adapterId?: string;
    readonly params?: Record<string, unknown>;
}
export interface LensStep {
    readonly kind: 'lens';
    readonly lens: LensInstance;
}
export interface LensInstance {
    readonly lensId: string;
    readonly params: Record<string, LensParamBinding>;
    readonly enabled?: boolean;
    readonly sortKey?: number;
}
export type LensParamBinding = {
    readonly kind: 'literal';
    readonly value: unknown;
} | {
    readonly kind: 'default';
    readonly defaultSourceId: string;
};
export type SlotDirection = 'input' | 'output';
export interface Slot {
    readonly id: string;
    readonly label: string;
    readonly type: TypeDesc;
    readonly direction: SlotDirection;
    readonly optional?: boolean;
    readonly defaultValue?: unknown;
    readonly defaultSource?: DefaultSource;
}
export interface DefaultSource {
    readonly value: unknown;
    readonly world?: SlotWorld;
}
export type UIControlHint = {
    kind: 'slider';
    min: number;
    max: number;
    step: number;
} | {
    kind: 'int';
    min?: number;
    max?: number;
    step?: number;
} | {
    kind: 'float';
    min?: number;
    max?: number;
    step?: number;
} | {
    kind: 'select';
    options: {
        value: string;
        label: string;
    }[];
} | {
    kind: 'color';
} | {
    kind: 'boolean';
} | {
    kind: 'text';
} | {
    kind: 'xy';
};
