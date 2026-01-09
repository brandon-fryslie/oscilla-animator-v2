/**
 * Generic Block Spec + Constraint Emission
 *
 * This is how you define "polymorphic blocks" without runtime polymorphism:
 * each block emits constraints, then gets monomorphized.
 */
// =============================================================================
// Block Registry
// =============================================================================
/**
 * Registry of block signatures by name.
 */
export class BlockSigRegistry {
    sigs = new Map();
    register(sig) {
        if (this.sigs.has(sig.name)) {
            throw new Error(`BlockSig already registered: ${sig.name}`);
        }
        this.sigs.set(sig.name, sig);
    }
    get(name) {
        return this.sigs.get(name);
    }
    has(name) {
        return this.sigs.has(name);
    }
    all() {
        return this.sigs.values();
    }
}
/**
 * Global block signature registry.
 */
export const blockSigRegistry = new BlockSigRegistry();
