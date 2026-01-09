/**
 * Canonical Type System
 *
 * This module provides the single authoritative type representation
 * used by editor, compiler, and IR.
 *
 * Key concepts:
 * - World: "signal" | "field" | "event" | "config"
 * - Domain: "float" | "bool" | "vec2" | "vec3" | "color" | "trigger" | "domain2d" | "path2d" | "unknown"
 * - Type: The canonical type representation
 * - Constraints: Type variables and constraint system for generics
 * - Solver: Unification and monomorphization
 */
export type { World, Domain, Type, FieldDomainRef, } from "./types";
export { t, isFieldType, eqType, fmtType, getDomainArity, getTypeArity, sigType, fieldType, eventType, configType, } from "./types";
export type { TypeVarId, TypeVar, Ty, Constraint, TypeclassName, PromoteRule, TypeError, } from "./constraints";
export { concrete, tyVar, eq, hasWorld, hasDomain, inDomains, inWorlds, typeclass, sameWorld, sameDomain, promote, } from "./constraints";
export { TypeContext, solve, finalizeType, getSubstitution, } from "./solver";
export type { SolveResult } from "./solver";
export type { PortName, BlockTypeEnv, BlockSig, BlockInstanceTypes, } from "./blockSig";
export { BlockSigRegistry, blockSigRegistry, } from "./blockSig";
export type { PortBinding, InferResult, CompileBlockResult, } from "./compileBlockInstance";
export { inferBlockInstance, compileBlockInstance, } from "./compileBlockInstance";
export type { ValueSlot, IROp, BinaryOp, UnaryOp, LoweredValueRef, } from "./irBuilder";
export { IRBuilder } from "./irBuilder";
export { AddBlock, MulBlock, MixBlock, MinBlock, MaxBlock, } from "./blocks/add";
export { lowerAdd, lowerMul, lowerMin, lowerMax, lowerBinaryOp, } from "./lowering/addLowering";
