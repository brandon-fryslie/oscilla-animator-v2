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
export { t, isFieldType, eqType, fmtType, getDomainArity, getTypeArity, sigType, fieldType, eventType, configType, } from "./types";
export { concrete, tyVar, eq, hasWorld, hasDomain, inDomains, inWorlds, typeclass, sameWorld, sameDomain, promote, } from "./constraints";
// =============================================================================
// Solver
// =============================================================================
export { TypeContext, solve, finalizeType, getSubstitution, } from "./solver";
export { BlockSigRegistry, blockSigRegistry, } from "./blockSig";
export { inferBlockInstance, compileBlockInstance, } from "./compileBlockInstance";
export { IRBuilder } from "./irBuilder";
// =============================================================================
// Example Blocks
// =============================================================================
export { AddBlock, MulBlock, MixBlock, MinBlock, MaxBlock, } from "./blocks/add";
// =============================================================================
// Lowering
// =============================================================================
export { lowerAdd, lowerMul, lowerMin, lowerMax, lowerBinaryOp, } from "./lowering/addLowering";
