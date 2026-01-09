/**
 * Intermediate Representation (IR) Types
 *
 * The IR is a low-level representation of the animation program.
 * It consists of:
 * - SigExpr: Signal expressions (evaluated once per frame)
 * - FieldExpr: Field expressions (evaluated per-element at sinks)
 * - EventExpr: Event expressions (edge-triggered)
 * - Steps: Execution schedule
 *
 * @deprecated This file contains legacy IR types.
 * The authoritative IR schema is in ./program.ts (CompiledProgramIR).
 * This file will be removed once runtime migration is complete.
 */
export { nodeIndex, portIndex, busIndex, valueSlot, stepIndex, sigExprId, fieldExprId, eventExprId, nodeId, busId, stepId, exprId, stateId, domainId, slotId, } from './Indices';
export var OpCode;
(function (OpCode) {
    // Arithmetic
    OpCode["Add"] = "add";
    OpCode["Sub"] = "sub";
    OpCode["Mul"] = "mul";
    OpCode["Div"] = "div";
    OpCode["Mod"] = "mod";
    OpCode["Neg"] = "neg";
    OpCode["Abs"] = "abs";
    // Trigonometric
    OpCode["Sin"] = "sin";
    OpCode["Cos"] = "cos";
    OpCode["Tan"] = "tan";
    // Range
    OpCode["Min"] = "min";
    OpCode["Max"] = "max";
    OpCode["Clamp"] = "clamp";
    OpCode["Lerp"] = "lerp";
    // Comparison
    OpCode["Eq"] = "eq";
    OpCode["Lt"] = "lt";
    OpCode["Gt"] = "gt";
    // Phase
    OpCode["Wrap01"] = "wrap01";
})(OpCode || (OpCode = {}));
