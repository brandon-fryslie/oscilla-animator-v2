# Unified Transforms (Lenses + Adapters) — Implementation Checklist

This is a short, do-in-order execution checklist for `plans/PLAN-UNIFIED-TRANSFORMS-LENSES-ADAPTERS.md`.

---

## 0) Make `just dev` run
- [ ] Fix TypeScript build errors blocking dev (start with `src/editor/adapters/AdapterRegistry.ts` broken identifiers).

---

## 1) Create transform facade modules (no behavior change)
- [ ] `src/editor/transforms/types.ts`
- [ ] `src/editor/transforms/normalize.ts`
- [ ] `src/editor/transforms/catalog.ts`
- [ ] `src/editor/transforms/validate.ts`
- [ ] `src/editor/transforms/apply.ts` (initially wrap existing compiler logic)

---

## 2) Unify adapter execution under AdapterRegistry
- [ ] Add `apply` to `AdapterDef`
- [ ] Move switch-based logic from `compileBusAware.ts` into adapter defs
- [ ] Compiler uses registry lookup to execute adapters

---

## 3) Unify lens scope + legality
- [ ] Expand `LensScope` to include `wire` and `lensParam`
- [ ] Update lens defs `allowedScopes` explicitly (no string matching)
- [ ] Add validation that rejects illegal scopes

---

## 4) Centralize transform application
- [ ] `compileBusAware.ts` imports `transforms/apply.ts` for adapter + lens application
- [ ] `lenses/lensResolution.ts` uses the same transform engine

---

## 5) Remove UI hardcoding (registry-driven lens UI)
- [ ] `src/editor/components/LensSelector.tsx` uses LensRegistry definitions for:
  - available lenses (filtered by scope/type)
  - param schema (`LensDef.params`)
- [ ] `src/editor/modulation-table/LensChainEditor.tsx` uses LensRegistry for:
  - adding lenses
  - rendering param editors

---

## 6) IR compiler consistency
- [ ] Option A: implement transform support in IR mode
- [ ] OR Option B: reject transforms in IR mode explicitly (no silent ignoring)

---

## 7) Manual verification (no tests)
- [ ] `just dev`
- [ ] Wire lens edit works
- [ ] Publisher lens edit works
- [ ] Listener lens edit works
- [ ] Phase lenses only appear/validate on phase endpoints
- [ ] No “ignored lens stack” behavior in IR mode

