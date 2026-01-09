/**
 * Minimal IRBuilder + op shapes
 *
 * Just enough to plug in lowering functions.
 */
import type { Type, Domain } from "./types";
export type ValueSlot = number;
export type IROp = {
    kind: "SignalZipWith";
    op: BinaryOp;
    aSlot: ValueSlot;
    bSlot: ValueSlot;
    outSlot: ValueSlot;
    domain: Domain;
} | {
    kind: "FieldZipWith";
    op: BinaryOp;
    aSlot: ValueSlot;
    bSlot: ValueSlot;
    outSlot: ValueSlot;
    domain: Domain;
} | {
    kind: "SignalMap";
    op: UnaryOp;
    inSlot: ValueSlot;
    outSlot: ValueSlot;
    domain: Domain;
} | {
    kind: "FieldMap";
    op: UnaryOp;
    inSlot: ValueSlot;
    outSlot: ValueSlot;
    domain: Domain;
} | {
    kind: "BroadcastSignalToField";
    signalSlot: ValueSlot;
    outSlot: ValueSlot;
    domain: Domain;
} | {
    kind: "Const";
    value: number | boolean;
    outSlot: ValueSlot;
    domain: Domain;
};
export type BinaryOp = "add" | "sub" | "mul" | "div" | "min" | "max" | "mod";
export type UnaryOp = "neg" | "abs" | "sin" | "cos" | "tan" | "sqrt" | "floor" | "ceil";
export declare class IRBuilder {
    private nextSlot;
    ops: IROp[];
    slotTypes: Type[];
    allocSlot(ty: Type): ValueSlot;
    emit(op: IROp): void;
    /**
     * Get current slot count.
     */
    getSlotCount(): number;
    /**
     * Get all emitted ops.
     */
    getOps(): readonly IROp[];
    /**
     * Get all slot types.
     */
    getSlotTypes(): readonly Type[];
}
/**
 * Reference to a lowered value.
 */
export type LoweredValueRef = {
    kind: "slot";
    slot: ValueSlot;
    ty: Type;
};
