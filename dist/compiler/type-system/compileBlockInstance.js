/**
 * The "One True" Pipeline: infer -> solve -> finalize -> lower
 *
 * This module provides the entry point for compiling block instances
 * from generic signatures to concrete, monomorphized types.
 */
import { solve, finalizeType, TypeContext } from "./solver";
export function inferBlockInstance(sig, bindings) {
    const tc = new TypeContext();
    const { inputs, outputs, constraints } = sig.buildTypes({ tc });
    // Add constraints from already-known input types (from edges).
    const extra = [];
    for (const b of bindings) {
        const portTy = inputs[b.port];
        if (!portTy)
            continue;
        if (b.inferredTy) {
            extra.push({ kind: "Eq", a: portTy, b: { kind: "concrete", ty: b.inferredTy } });
        }
    }
    const all = [...constraints, ...extra];
    const res = solve(all);
    if (res.errors.length) {
        return { instanceTypes: null, errors: res.errors, rawConstraints: all };
    }
    // Finalize: every port must become concrete; otherwise compilation fails.
    const inConcrete = {};
    const outConcrete = {};
    for (const [k, v] of Object.entries(inputs)) {
        const ty = finalizeType(res.subst, v);
        if (!ty) {
            return {
                instanceTypes: null,
                errors: [{ message: `Unresolved input type for port ${k}` }],
                rawConstraints: all,
            };
        }
        inConcrete[k] = ty;
    }
    for (const [k, v] of Object.entries(outputs)) {
        const ty = finalizeType(res.subst, v);
        if (!ty) {
            return {
                instanceTypes: null,
                errors: [{ message: `Unresolved output type for port ${k}` }],
                rawConstraints: all,
            };
        }
        outConcrete[k] = ty;
    }
    return {
        instanceTypes: { inputs: inConcrete, outputs: outConcrete },
        errors: [],
        rawConstraints: all,
    };
}
export function compileBlockInstance(sig, bindings, nodeId) {
    const result = inferBlockInstance(sig, bindings);
    // Add nodeId to error blame if provided
    const errors = nodeId
        ? result.errors.map(e => ({
            ...e,
            blame: { ...e.blame, nodeId },
        }))
        : result.errors;
    return {
        ok: result.instanceTypes !== null,
        instanceTypes: result.instanceTypes ?? undefined,
        errors,
        rawConstraints: result.rawConstraints,
    };
}
