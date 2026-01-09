/**
 * Turning a Typed Block into Concrete IR Ops
 *
 * This is where the "functor/zipWith" model becomes real:
 * lowering is selected by _concrete_ `(world, domain)`.
 */
export function lowerAdd(b, inA, inB, outTy) {
    return lowerBinaryOp(b, "add", inA, inB, outTy);
}
export function lowerMul(b, inA, inB, outTy) {
    return lowerBinaryOp(b, "mul", inA, inB, outTy);
}
export function lowerMin(b, inA, inB, outTy) {
    return lowerBinaryOp(b, "min", inA, inB, outTy);
}
export function lowerMax(b, inA, inB, outTy) {
    return lowerBinaryOp(b, "max", inA, inB, outTy);
}
/**
 * Generic binary operation lowering.
 *
 * Invariants: outTy is concrete; type solver already enforced promotion and domain match.
 * Choose lowering based on world.
 */
export function lowerBinaryOp(b, op, inA, inB, outTy) {
    if (outTy.world === "signal") {
        // signal + signal => SignalZipWith(op)
        const outSlot = b.allocSlot(outTy);
        b.emit({
            kind: "SignalZipWith",
            op,
            aSlot: inA.slot,
            bSlot: inB.slot,
            outSlot,
            domain: outTy.domain,
        });
        return { kind: "slot", slot: outSlot, ty: outTy };
    }
    if (outTy.world === "field") {
        // field+field => FieldZipWith(op)
        // signal+field => Broadcast + FieldZipWith (or a specialized FieldZipWith that accepts a signal)
        //
        // For simplicity, we handle broadcast explicitly if input types differ.
        // The type solver ensures domain matches, so we just need to check world.
        let aSlot = inA.slot;
        let bSlot = inB.slot;
        // Broadcast signal inputs to field if needed
        if (inA.ty.world === "signal") {
            const broadcastSlot = b.allocSlot(outTy);
            b.emit({
                kind: "BroadcastSignalToField",
                signalSlot: inA.slot,
                outSlot: broadcastSlot,
                domain: outTy.domain,
            });
            aSlot = broadcastSlot;
        }
        if (inB.ty.world === "signal") {
            const broadcastSlot = b.allocSlot(outTy);
            b.emit({
                kind: "BroadcastSignalToField",
                signalSlot: inB.slot,
                outSlot: broadcastSlot,
                domain: outTy.domain,
            });
            bSlot = broadcastSlot;
        }
        const outSlot = b.allocSlot(outTy);
        b.emit({
            kind: "FieldZipWith",
            op,
            aSlot,
            bSlot,
            outSlot,
            domain: outTy.domain,
        });
        return { kind: "slot", slot: outSlot, ty: outTy };
    }
    throw new Error(`Binary op lowering: unsupported world ${outTy.world}`);
}
