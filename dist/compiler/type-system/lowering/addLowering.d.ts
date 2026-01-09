/**
 * Turning a Typed Block into Concrete IR Ops
 *
 * This is where the "functor/zipWith" model becomes real:
 * lowering is selected by _concrete_ `(world, domain)`.
 */
import type { Type } from "../types";
import type { LoweredValueRef, IRBuilder, BinaryOp } from "../irBuilder";
export declare function lowerAdd(b: IRBuilder, inA: LoweredValueRef, inB: LoweredValueRef, outTy: Type): LoweredValueRef;
export declare function lowerMul(b: IRBuilder, inA: LoweredValueRef, inB: LoweredValueRef, outTy: Type): LoweredValueRef;
export declare function lowerMin(b: IRBuilder, inA: LoweredValueRef, inB: LoweredValueRef, outTy: Type): LoweredValueRef;
export declare function lowerMax(b: IRBuilder, inA: LoweredValueRef, inB: LoweredValueRef, outTy: Type): LoweredValueRef;
/**
 * Generic binary operation lowering.
 *
 * Invariants: outTy is concrete; type solver already enforced promotion and domain match.
 * Choose lowering based on world.
 */
export declare function lowerBinaryOp(b: IRBuilder, op: BinaryOp, inA: LoweredValueRef, inB: LoweredValueRef, outTy: Type): LoweredValueRef;
