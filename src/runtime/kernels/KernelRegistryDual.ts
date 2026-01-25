/**
 * KernelRegistryDual
 *
 * This module defines a *single* dual-kernel dispatch surface for blocks that are
 * cardinality-polymorphic (Signal vs Field) but semantically identical.
 *
 * Architectural intent:
 * - Blocks SHOULD NOT implement per-block signal/field branching logic.
 * - The *only* allowed branching between SigExpr vs FieldExpr emission lives here.
 * - Domain/cardinality decisions are made by the constraint solver; lowering only
 *   follows the already-resolved ValueRef kinds.
 *
 * This keeps block lower() implementations uniform and prevents "SetZSignal" vs
 * "SetZField" style duplication.
 */

import type { SigExprId, FieldExprId } from '../compiler/ir/Indices';
import type { SignalType } from '../types';

export type ValueRef =
    | { k: 'sig'; id: SigExprId }
    | { k: 'field'; id: FieldExprId };

/**
 * Minimal structural type for the IR builder surface we need here.
 * We intentionally keep this narrow so the dispatch rules are centralized.
 */
export type KernelLowerCtx = {
    b: {
        opcode(op: string): any;
        kernel(name: string): any;

        sigMap(input: SigExprId, fn: any, outType: SignalType): SigExprId;
        sigZip(inputs: SigExprId[], fn: any, outType: SignalType): SigExprId;
        sigConst(value: number, outType: SignalType): SigExprId;

        fieldMap(input: FieldExprId, fn: any, outType: SignalType): FieldExprId;
        fieldZip(inputs: FieldExprId[], fn: any, outType: SignalType): FieldExprId;

        /** Broadcast a signal to a field explicitly (no implicit conversions). */
        Broadcast(sig: SigExprId, outFieldType: SignalType): FieldExprId;
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Dual-kernel emission helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emit a unary op that is semantically the same for signals and fields.
 *
 * - Signal path uses an opcode (scalar math).
 * - Field path uses a field kernel (buffer math).
 */
export function emitUnary(
    ctx: KernelLowerCtx,
    input: ValueRef,
    spec: {
        opcode: string;
        fieldKernel: string;
        outSigType: SignalType;
        outFieldType: SignalType;
    }
): ValueRef {
    if (input.k === 'sig') {
        const fn = ctx.b.opcode(spec.opcode);
        const id = ctx.b.sigMap(input.id, fn, spec.outSigType);
        return { k: 'sig', id };
    }
    const fn = ctx.b.kernel(spec.fieldKernel);
    const id = ctx.b.fieldMap(input.id, fn, spec.outFieldType);
    return { k: 'field', id };
}

/**
 * Emit a binary op that is semantically the same for signals and fields.
 *
 * Mixed signal/field inputs are handled *explicitly* by broadcasting the signal
 * to a field, then using a fieldZip.
 */
export function emitBinary(
    ctx: KernelLowerCtx,
    a: ValueRef,
    b: ValueRef,
    spec: {
        opcode: string;
        fieldKernel: string;
        outSigType: SignalType;
        outFieldType: SignalType;
    }
): ValueRef {
    if (a.k === 'sig' && b.k === 'sig') {
        const fn = ctx.b.opcode(spec.opcode);
        const id = ctx.b.sigZip([a.id, b.id], fn, spec.outSigType);
        return { k: 'sig', id };
    }

    // Field path (including mixed inputs)
    const aField = a.k === 'field' ? a.id : ctx.b.Broadcast(a.id, spec.outFieldType);
    const bField = b.k === 'field' ? b.id : ctx.b.Broadcast(b.id, spec.outFieldType);
    const fn = ctx.b.kernel(spec.fieldKernel);
    const id = ctx.b.fieldZip([aField, bField], fn, spec.outFieldType);
    return { k: 'field', id };
}

/** Convenience for building numeric constants for signal-only formulas. */
export function sigConst(ctx: KernelLowerCtx, value: number, t: SignalType): ValueRef {
    return { k: 'sig', id: ctx.b.sigConst(value, t) };
}