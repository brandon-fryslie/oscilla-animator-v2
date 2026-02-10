# Plan: Fix Remaining 5 Demo Compilation Failures

## Context

After implementing Fixes 1-3 (unit solver merge, fieldOnly signal exclusion, CheaterAdapterUsed), 5 of 17 HCL demos still fail. Investigation reveals 3 distinct root causes:

| Root Cause | Demos Affected |
|---|---|
| Backend instance ID mismatch (frontend vs runtime) | perspective-camera, rect-mosaic, tile-grid-uv (3) |
| User-placed Broadcast uses concrete instance instead of var | path-field-demo (1) |
| Unresolved collect ports block `tryFinalizeStrict` | error-isolation-demo (1) |

---

## Fix 4: Backend Instance ID Rewriting for Source Blocks

**Problem:** When the cardinality solver promotes a Const block's output to `many` (via zipBroadcast propagation from a Multiply that mixes field + signal inputs), the output type carries the **frontend** instance ID (e.g., `circle:grid-elements`). But the Array block's lowering creates a **runtime** instance ID (e.g., `circle:inst-0`). At Multiply lowering time, `alignInputs()` sees mismatched instance IDs and throws "field+field zip requires matching instance domains".

**Root cause chain** (rect-mosaic example):
```
Array("grid-elements") → creates runtime inst-0
  → Array.t carries (circle:inst-0) after lowering
  → Multiply.a gets (circle:inst-0) via edge

Const("hue-range") → no incoming edges, inferInstanceContext returns undefined
  → outType carries (circle:grid-elements) from frontend solver
  → auto-propagation skipped (ctx.inferredInstance === undefined)
  → Multiply.b gets (circle:grid-elements) from frontend

alignInputs: inst-0 ≠ grid-elements → ERROR
```

**Fix in `src/compiler/backend/lower-blocks.ts`:**

After calling `inferInstanceContext()` (~line 312-330), add a fallback: if `inferredInstance` is undefined, check whether any of the block's resolved output port types (from `portTypes`) have `many` cardinality with a concrete instance. If so, look up that instance's frontend block ID in the builder's instance registry to find the matching runtime instance ID.

Specifically, in `lowerBlockInstance()`, after the `inferredInstance` variable is set (~line 470):

```
// Existing: infer from incoming edges
let inferredInstance = inferInstanceContext(blockIndex, edges, instanceContextByBlock);

// NEW FALLBACK: If no incoming edges provide instance context, check if
// any output port was solved to field (many) by the frontend. If so,
// find the matching runtime instance by domain type.
if (inferredInstance === undefined && portTypes) {
  for (const portName of Object.keys(blockDef.outputs)) {
    const pt = portTypes.get(portKey(blockIndex, portName, 'out'));
    if (!pt) continue;
    const card = requireInst(pt.extent.cardinality, 'cardinality');
    if (card.kind !== 'many') continue;
    // Find matching runtime instance by domain type + frontend ID
    for (const [instId, decl] of builder.getInstances()) {
      if (decl.domainType === card.instance.domainTypeId) {
        inferredInstance = instId;
        break;
      }
    }
    if (inferredInstance !== undefined) break;
  }
}
```

This connects the Const block to the runtime instance, so auto-propagation at line 559 fires and instance rewriting at line 567-611 rewrites the output types to use the runtime ID.

**Risk:** If multiple instances of the same domain type exist, this picks the first match. That's acceptable because:
- The frontend solver already validated instance identity consistency via zipBroadcast
- Multiple same-domain instances in the same graph would already cause frontend instance conflicts
- For the common case (one Array creates one instance domain), this is unambiguous

**Files:**
- `src/compiler/backend/lower-blocks.ts` (~line 470): Add fallback instance inference

---

## Fix 5: User-Placed Broadcast Uses Instance Var

**Problem:** In `rewriteTransform()`, the `isBroadcastAdapter` gate (line 427-430) only allows adapter-inserted Broadcasts to use instance vars. User-placed Broadcasts get a **concrete** `instanceRef(DOMAIN_SHAPE, block.id)`. When path-field-demo wires a user-placed Broadcast to RenderInstances2D.color alongside Array-sourced fields on RenderInstances2D.pos, the zipBroadcast tries to unify `shape:color-field` with `circle:instances` → instance conflict.

**Root cause:** A Broadcast block inherently does NOT "own" an instance domain. It broadcasts a signal into whatever field context it's consumed in. User-placed Broadcasts need the same instance-var behavior as adapter-inserted ones.

**Fix in `src/compiler/frontend/extract-constraints.ts`, function `rewriteTransform()` (line 427-430):**

Change the gate from adapter-specific to all Broadcast blocks:

```typescript
// Before:
const isBroadcastAdapter = block.type === 'Broadcast'
    && typeof block.origin === 'object'
    && (block.origin as { kind: string }).kind === 'elaboration'
    && (block.origin as { role: string }).role === 'adapter';

// After:
const isBroadcastAdapter = block.type === 'Broadcast';
```

Rename the variable to `isBroadcast` to match the broader semantics. Update the comment to explain: Broadcast blocks don't own instances — they adopt the downstream consumer's instance via solver unification.

**Why this is safe:**
- Broadcast's semantic is signal→field conversion using whatever instance context is downstream
- The `DOMAIN_SHAPE` in Broadcast's cardinality metadata is a registration-time placeholder; it never matters at runtime
- The solver already handles instance var unification correctly (proven by adapter-inserted Broadcasts working)

**Files:**
- `src/compiler/frontend/extract-constraints.ts` (line 427-430): Broaden gate

---

## Fix 6: Exclude Collect Ports from Strict Finalization

**Problem:** `tryFinalizeStrict()` checks ALL ports in `facts.ports` for `status: 'ok'`. Expression blocks' `refs` collect ports have unresolvable payload vars (no edges, no constraints → no evidence), causing `status: 'unknown'`. For the error-isolation-demo (where broken Expression blocks are intentionally disconnected), this blocks the entire graph from finalizing.

**Root cause chain:**
```
Expression.refs port → payloadVar('expr_refs') with no constraints
  → solver can't resolve → portPayloads has no entry
  → computePortHint → status: 'unknown'
  → tryFinalizeStrict iterates ALL ports → returns null
  → "Fixpoint normalization could not fully resolve the graph"
```

**Fix in `src/compiler/frontend/final-normalization.ts`, function `tryFinalizeStrict()` (line 486-488):**

Skip collect ports when checking port resolution status. Collect ports are inherently polymorphic (they accept any type from each connected edge) and their resolution is handled separately via `collectEdgeTypes`. They should not gate strict finalization.

```typescript
// Before:
for (const [key, hint] of facts.ports) {
    if (hint.status !== 'ok' || !hint.canonical) return null;
    portTypes.set(key, hint.canonical);
}

// After:
for (const [key, hint] of facts.ports) {
    // Collect ports are polymorphic — resolution handled via collectEdgeTypes
    if (collectPortKeys?.has(key)) continue;
    if (hint.status !== 'ok' || !hint.canonical) return null;
    portTypes.set(key, hint.canonical);
}
```

**Why this is safe:**
- Collect ports get their types from connected edges, not from payload/unit solving
- The `collectEdgeTypes` map (built at line 493-518) already handles collect port resolution using source output types
- Backend lowering uses `collectEdgeTypes` to type-check collect inputs, not `portTypes`
- This matches the existing design: collect ports are excluded from `collectVarConstraints` in extract-constraints.ts (line 157-162)

**Files:**
- `src/compiler/frontend/final-normalization.ts` (line 486-488): Skip collect ports

---

## Files to Modify

| File | Change |
|---|---|
| `src/compiler/backend/lower-blocks.ts` | Add fallback instance inference from output port types |
| `src/compiler/frontend/extract-constraints.ts` | Broaden Broadcast gate in `rewriteTransform()` |
| `src/compiler/frontend/final-normalization.ts` | Skip collect ports in `tryFinalizeStrict()` |

---

## Verification

1. **HCL demo tests**: `npx vitest run src/demo/hcl/__tests__/hcl-demos.test.ts` — all 17 demos should compile (currently 67/72 pass; target 72/72)
2. **Perspective camera test**: `npx vitest run src/demo/__tests__/perspective-camera.test.ts`
3. **Cardinality solver tests**: `npx vitest run src/compiler/frontend/cardinality/__tests__/`
4. **Payload/unit solver tests**: `npx vitest run src/compiler/frontend/payload-unit/__tests__/`
5. **Full suite**: `npx vitest run` — verify fix count improves (currently 86 failures)
6. **Typecheck**: `npm run typecheck`
