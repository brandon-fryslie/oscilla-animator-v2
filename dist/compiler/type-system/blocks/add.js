/**
 * Example: One "Add" Block (Generic over World + Domain)
 *
 * This single block replaces `add_signal`, `add_field`, `add_scalar`, etc.
 */
export const AddBlock = {
    name: "Add",
    buildTypes(env) {
        const A = env.tc.freshVar("A"); // input a
        const B = env.tc.freshVar("B"); // input b
        const O = env.tc.freshVar("O"); // output
        const a = { kind: "var", v: A };
        const b = { kind: "var", v: B };
        const out = { kind: "var", v: O };
        const constraints = [
            // Add is defined for numeric-ish domains
            { kind: "Typeclass", a: a, cls: "Numeric" },
            { kind: "Typeclass", a: b, cls: "Numeric" },
            // Domain must match between a and b
            { kind: "SameDomain", a, b },
            // Promote: signal+field -> field; otherwise same world.
            { kind: "Promote", out, a, b, rule: "SignalField" },
            // Output domain matches inputs.
            { kind: "SameDomain", a: out, b: a },
            // Output must be mappable/zipWithable (for lowering correctness)
            { kind: "Typeclass", a: out, cls: "ZipWithable" },
        ];
        return {
            inputs: { a, b },
            outputs: { out },
            constraints,
        };
    },
};
/**
 * Mul block - same structure as Add
 */
export const MulBlock = {
    name: "Mul",
    buildTypes(env) {
        const A = env.tc.freshVar("A");
        const B = env.tc.freshVar("B");
        const O = env.tc.freshVar("O");
        const a = { kind: "var", v: A };
        const b = { kind: "var", v: B };
        const out = { kind: "var", v: O };
        const constraints = [
            { kind: "Typeclass", a: a, cls: "Numeric" },
            { kind: "Typeclass", a: b, cls: "Numeric" },
            { kind: "SameDomain", a, b },
            { kind: "Promote", out, a, b, rule: "SignalField" },
            { kind: "SameDomain", a: out, b: a },
            { kind: "Typeclass", a: out, cls: "ZipWithable" },
        ];
        return {
            inputs: { a, b },
            outputs: { out },
            constraints,
        };
    },
};
/**
 * Mix/Lerp block
 */
export const MixBlock = {
    name: "Mix",
    buildTypes(env) {
        const A = env.tc.freshVar("A");
        const B = env.tc.freshVar("B");
        const T = env.tc.freshVar("T"); // interpolation factor
        const O = env.tc.freshVar("O");
        const a = { kind: "var", v: A };
        const b = { kind: "var", v: B };
        const t = { kind: "var", v: T };
        const out = { kind: "var", v: O };
        const constraints = [
            // Mixable types
            { kind: "Typeclass", a: a, cls: "Mixable" },
            { kind: "Typeclass", a: b, cls: "Mixable" },
            // Domain must match
            { kind: "SameDomain", a, b },
            // T must be float
            { kind: "HasDomain", a: t, domain: "float" },
            // Promotion
            { kind: "Promote", out, a, b, rule: "SignalField" },
            { kind: "SameDomain", a: out, b: a },
            { kind: "Typeclass", a: out, cls: "ZipWithable" },
        ];
        return {
            inputs: { a, b, t },
            outputs: { out },
            constraints,
        };
    },
};
/**
 * Min block
 */
export const MinBlock = {
    name: "Min",
    buildTypes(env) {
        const A = env.tc.freshVar("A");
        const B = env.tc.freshVar("B");
        const O = env.tc.freshVar("O");
        const a = { kind: "var", v: A };
        const b = { kind: "var", v: B };
        const out = { kind: "var", v: O };
        const constraints = [
            { kind: "Typeclass", a: a, cls: "Comparable" },
            { kind: "Typeclass", a: b, cls: "Comparable" },
            { kind: "SameDomain", a, b },
            { kind: "Promote", out, a, b, rule: "SignalField" },
            { kind: "SameDomain", a: out, b: a },
            { kind: "Typeclass", a: out, cls: "ZipWithable" },
        ];
        return {
            inputs: { a, b },
            outputs: { out },
            constraints,
        };
    },
};
/**
 * Max block
 */
export const MaxBlock = {
    name: "Max",
    buildTypes(env) {
        const A = env.tc.freshVar("A");
        const B = env.tc.freshVar("B");
        const O = env.tc.freshVar("O");
        const a = { kind: "var", v: A };
        const b = { kind: "var", v: B };
        const out = { kind: "var", v: O };
        const constraints = [
            { kind: "Typeclass", a: a, cls: "Comparable" },
            { kind: "Typeclass", a: b, cls: "Comparable" },
            { kind: "SameDomain", a, b },
            { kind: "Promote", out, a, b, rule: "SignalField" },
            { kind: "SameDomain", a: out, b: a },
            { kind: "Typeclass", a: out, cls: "ZipWithable" },
        ];
        return {
            inputs: { a, b },
            outputs: { out },
            constraints,
        };
    },
};
