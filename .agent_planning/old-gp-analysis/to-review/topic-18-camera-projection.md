---
topic: 18
name: Camera & Projection
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/18-camera-projection.md
category: to-review
audited: 2026-01-24T00:00:00Z
item_count: 3
---

# Topic 18: Camera & Projection - TO-REVIEW Items

## R-1: ProjectionOutputs Type Shape Differs from Spec

**Spec requirement (lines 82-87):**
```typescript
interface ProjectionOutputs {
  screenPosition: Field<vec2>;  // over instanceId
  depth: Field<float>;          // range [0, 1]
  visible: Field<bool>;         // false = do not draw
}
```

**Implementation (src/runtime/RenderAssembler.ts, lines 97-106):**
```typescript
export interface ProjectionOutput {
  screenPosition: Float32Array;    // stride 2
  screenRadius: Float32Array;      // per-instance (not in spec)
  depth: Float32Array;
  visible: Uint8Array;             // 1=visible, 0=culled
}
```

**Differences:**
1. `screenRadius` is an extra field not in spec's `ProjectionOutputs` contract (but useful for size projection)
2. `visible` is `Uint8Array` (0/1) instead of `Field<bool>` (functionally equivalent)
3. `screenPosition` is `Float32Array` not `Field<vec2>` (same thing at runtime)

**Assessment:** The extra `screenRadius` field is a practical addition for the size-projection pipeline. The type differences are trivial (Float32Array IS the runtime representation of Field<vec2>). Possible concern: the spec contract type is meant as a stable API boundary -- adding screenRadius may create coupling. Consider whether it should be a separate output or merged.

---

## R-2: Ortho Near/Far Defaults Differ from Spec

**Spec requirement (line 37):**
> near: 0.01, far: 100.0

**Implementation (src/projection/ortho-kernel.ts, lines 37-40):**
```typescript
export const ORTHO_CAMERA_DEFAULTS: OrthoCameraParams = Object.freeze({
  near: -100.0,
  far: 100.0,
});
```

**Difference:** Spec says `near: 0.01`, implementation uses `near: -100.0`. The implementation allows negative Z values (behind the default XY plane) to be visible, which makes sense for the current flat-layout usage. The spec's `near: 0.01` would cull everything at z <= 0.01.

**Assessment:** The implementation choice is arguably better for the default case (all layouts at z=0 are visible with -100 near plane). But it diverges from spec. When Camera block is implemented, these should be reconcilable via camera params.

---

## R-3: CameraDeclIR Uses Separate centerX/centerY Slots (Spec Says vec2)

**Spec requirement (lines 119-128):**
Camera block port: `center` is `Signal<vec2>`.

**CameraDeclIR implementation (src/compiler/ir/program.ts, lines 48-49):**
```typescript
readonly centerXSlot: ValueSlot;  // float unit=norm01
readonly centerYSlot: ValueSlot;  // float unit=norm01
```

**Difference:** The spec defines `center` as a single `vec2` port. The IR splits it into two scalar slots (centerX, centerY). This is a common lowering pattern (vec2 -> 2 scalars at IR level) and may be intentional.

**Assessment:** Likely intentional. Vec2 ports are commonly lowered to separate scalar slots in the IR. The Camera block definition (when built) should accept vec2 and the lowering pass splits it. No action needed unless the spec mandates vec2 slots at the IR level (it does not appear to).
