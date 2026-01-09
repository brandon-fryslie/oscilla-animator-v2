/**
 * Minimal IRBuilder + op shapes
 *
 * Just enough to plug in lowering functions.
 */
export class IRBuilder {
    nextSlot = 0;
    ops = [];
    slotTypes = [];
    allocSlot(ty) {
        const s = this.nextSlot++;
        this.slotTypes[s] = ty;
        return s;
    }
    emit(op) {
        this.ops.push(op);
    }
    /**
     * Get current slot count.
     */
    getSlotCount() {
        return this.nextSlot;
    }
    /**
     * Get all emitted ops.
     */
    getOps() {
        return this.ops;
    }
    /**
     * Get all slot types.
     */
    getSlotTypes() {
        return this.slotTypes;
    }
}
