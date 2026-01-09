/**
 * Solver (Unification + Constraint Checking + Promotion)
 *
 * This is a working skeleton: it can unify types, enforce typeclasses,
 * and apply promotion rules to pick concrete worlds/domains.
 */
import { eqType, t, fmtType } from "./types";
export class TypeContext {
    nextVarId = 1;
    freshVar(name) {
        return { id: this.nextVarId++, name };
    }
}
function isVar(x) {
    return x.kind === "var";
}
function isCon(x) {
    return x.kind === "concrete";
}
function apply(subst, x) {
    if (x.kind === "var") {
        const ty = subst.get(x.v.id);
        if (ty)
            return { kind: "concrete", ty };
    }
    return x;
}
function bind(subst, v, ty, errors) {
    const existing = subst.get(v.id);
    if (!existing) {
        subst.set(v.id, ty);
        return;
    }
    if (!eqType(existing, ty)) {
        errors.push({
            message: `Type mismatch: ${fmtType(existing)} vs ${fmtType(ty)}`,
            detail: { varId: v.id },
        });
    }
}
function unifyTy(subst, a, b, errors) {
    const aa = apply(subst, a);
    const bb = apply(subst, b);
    if (isCon(aa) && isCon(bb)) {
        if (!eqType(aa.ty, bb.ty)) {
            errors.push({
                message: `Cannot unify ${fmtType(aa.ty)} with ${fmtType(bb.ty)}`,
            });
        }
        return;
    }
    if (isVar(aa) && isCon(bb)) {
        bind(subst, aa.v, bb.ty, errors);
        return;
    }
    if (isCon(aa) && isVar(bb)) {
        bind(subst, bb.v, aa.ty, errors);
        return;
    }
    if (isVar(aa) && isVar(bb)) {
        // nothing yet; could union-find, but simplest is: do nothing unless later bound
        return;
    }
}
function checkTypeclass(cls, ty) {
    // These are the only places you should encode domain sets.
    switch (cls) {
        case "Numeric":
            return ty.domain === "float" || ty.domain === "vec2" || ty.domain === "vec3";
        case "Comparable":
            return ty.domain === "float";
        case "Mixable":
            return ty.domain === "float" || ty.domain === "vec2" || ty.domain === "vec3" || ty.domain === "color";
        case "Combineable":
            // combine semantics exist per (world, domain) pair; refine as needed
            return ty.world === "signal" || ty.world === "field" || ty.world === "event";
        case "Mappable":
            return ty.world === "signal" || ty.world === "field";
        case "ZipWithable":
            return ty.world === "signal" || ty.world === "field";
    }
}
function enforceConstraint(subst, c, errors) {
    switch (c.kind) {
        case "Eq": {
            unifyTy(subst, c.a, c.b, errors);
            return;
        }
        case "SameWorld": {
            const a = apply(subst, c.a);
            const b = apply(subst, c.b);
            if (isCon(a) && isCon(b) && a.ty.world !== b.ty.world) {
                errors.push({ message: `World mismatch: ${a.ty.world} vs ${b.ty.world}` });
            }
            return;
        }
        case "SameDomain": {
            const a = apply(subst, c.a);
            const b = apply(subst, c.b);
            if (isCon(a) && isCon(b) && a.ty.domain !== b.ty.domain) {
                errors.push({ message: `Domain mismatch: ${a.ty.domain} vs ${b.ty.domain}` });
            }
            return;
        }
        case "HasWorld": {
            const a = apply(subst, c.a);
            if (isCon(a)) {
                if (a.ty.world !== c.world)
                    errors.push({ message: `Expected world ${c.world}, got ${a.ty.world}` });
                return;
            }
            // not bound yet; do nothing
            return;
        }
        case "HasDomain": {
            const a = apply(subst, c.a);
            if (isCon(a)) {
                if (a.ty.domain !== c.domain)
                    errors.push({ message: `Expected domain ${c.domain}, got ${a.ty.domain}` });
                return;
            }
            return;
        }
        case "InDomains": {
            const a = apply(subst, c.a);
            if (isCon(a) && !c.domains.includes(a.ty.domain)) {
                errors.push({ message: `Expected domain in [${c.domains.join(",")}], got ${a.ty.domain}` });
            }
            return;
        }
        case "InWorlds": {
            const a = apply(subst, c.a);
            if (isCon(a) && !c.worlds.includes(a.ty.world)) {
                errors.push({ message: `Expected world in [${c.worlds.join(",")}], got ${a.ty.world}` });
            }
            return;
        }
        case "Typeclass": {
            const a = apply(subst, c.a);
            if (isCon(a) && !checkTypeclass(c.cls, a.ty)) {
                errors.push({ message: `Type ${fmtType(a.ty)} does not satisfy ${c.cls}` });
            }
            return;
        }
        case "Promote": {
            // Promotion chooses output world based on a,b, then enforces out = chosen.
            const aa = apply(subst, c.a);
            const bb = apply(subst, c.b);
            if (!isCon(aa) || !isCon(bb))
                return;
            const outTy = promote(aa.ty, bb.ty, c.rule, errors);
            if (outTy)
                unifyTy(subst, c.out, { kind: "concrete", ty: outTy }, errors);
            return;
        }
    }
}
function promote(a, b, rule, errors) {
    // Canonical rules: static, global, deterministic.
    if (a.world === "event" || b.world === "event") {
        if (rule === "EventNone")
            return null;
        errors.push({ message: `Cannot promote event with non-event` });
        return null;
    }
    if (rule === "SameWorld") {
        if (a.world !== b.world) {
            errors.push({ message: `Expected same world, got ${a.world} and ${b.world}` });
            return null;
        }
        if (a.domain !== b.domain) {
            errors.push({ message: `Expected same domain, got ${a.domain} and ${b.domain}` });
            return null;
        }
        return a;
    }
    if (rule === "SignalField") {
        // domain must match, world becomes field if either is field
        if (a.domain !== b.domain) {
            errors.push({ message: `Cannot promote differing domains: ${a.domain} vs ${b.domain}` });
            return null;
        }
        const outWorld = (a.world === "field" || b.world === "field") ? "field" : "signal";
        return t(outWorld, a.domain);
    }
    errors.push({ message: `Unknown promotion rule` });
    return null;
}
export function solve(constraints) {
    const subst = new Map();
    const errors = [];
    // Iterate a few times so binds can unlock later checks.
    // Keep this simple and deterministic.
    for (let iter = 0; iter < 8; iter++) {
        const before = subst.size;
        for (const c of constraints)
            enforceConstraint(subst, c, errors);
        if (subst.size === before)
            break;
    }
    // Final pass to report constraints that remain unsatisfied due to unbound vars.
    // You can enforce "no unbound vars" at finalize() boundary.
    return { subst, errors };
}
export function finalizeType(subst, x) {
    const xx = apply(subst, x);
    if (xx.kind === "concrete")
        return xx.ty;
    return null;
}
/**
 * Get the substitution as a readonly map.
 */
export function getSubstitution(result) {
    return result.subst;
}
