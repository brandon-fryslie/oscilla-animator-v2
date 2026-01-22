---
command: /canonicalize-architecture ./design-docs design-docs/_new/renderer
files: design-docs/_new/renderer/8-before-render.md design-docs/_new/renderer/9-renderer.md design-docs/_new/renderer/10-multiple-backends.md design-docs/_new/renderer/11-svg.md
indexed: true
---

# Glossary Update: Renderer Architecture Integration

**Date**: 2026-01-22

---

## NEW Terms

### RenderAssembler

**Definition**: The runtime component that produces RenderFrameIR by walking render sinks, materializing field buffers, resolving shape2d handles, and reading scalar banks. Lives in runtime, not renderer.

**Type**: concept (architectural component)

**Canonical Form**: `RenderAssembler`

**Responsibilities**:
1. Materialize required fields via Materializer
2. Read scalar banks for uniforms
3. Resolve shape2d → (topologyId, pointsBuffer, flags/style)
4. Group into passes
5. Output RenderFrameIR with only concrete buffers and numeric topology IDs

**Source**: [05-runtime.md](./topics/05-runtime.md)

**Note**: Enforces the invariant "Renderer is sink-only" (I15). All interpretation happens here, not in renderer.

---

### RenderBackend

**Definition**: Generic interface implemented by each render target (Canvas2D, SVG, WebGL). Consumes RenderFrameIR, performs rasterization.

**Type**: interface

**Canonical Form**: `RenderBackend<TTarget>`

**Structure**:
```typescript
interface RenderBackend<TTarget> {
  beginFrame(target: TTarget, frameInfo: FrameInfo): void;
  executePass(pass: RenderPassIR): void;
  endFrame(): void;
}
```

**Source**: [06-renderer.md](./topics/06-renderer.md)

**Note**: Backends must not force changes to the meaning of RenderIR. Backend-specific adaptations (e.g., path tessellation for WebGL) are backend-local, not IR-level.

---

### PathTopologyDef

**Definition**: Immutable definition of a path's structural shape — the verbs (move, line, quad, cubic, close) and their arities. Registered at compile/init time and referenced by numeric ID.

**Type**: type

**Canonical Form**: `PathTopologyDef`

**Structure**:
```typescript
interface PathTopologyDef {
  verbs: Uint8Array;           // Sequence of path verbs
  pointsPerVerb: Uint8Array;   // Number of control points each verb consumes
}
```

**Source**: [06-renderer.md](./topics/06-renderer.md)

**Note**: Topology is immutable once registered. Control points change per-frame; topology does not. The `closed` flag from PathGeometryTemplate derives from verbs (last verb = close).

---

## COMPLEMENTARY Updates to Existing Terms

### RenderFrameIR (Update)

**Addition**: Produced by **RenderAssembler** (runtime component), not by the renderer. The renderer is a pure consumer of this IR.

---

### PathGeometryTemplate (Clarification)

**Relationship**: References a PathTopologyDef via `topologyId`. The topology defines the shape structure; the template provides concrete points for that structure.

---

## DEPRECATED Terms

### GeometryRegistry

**Deprecated**: Replace with topology registry using numeric IDs and array lookup.

**Use Instead**: PathTopologyDef + numeric topologyId array lookup

---

### GeometryAsset

**Deprecated**: Already deprecated per D34. Confirmed deprecated by new sources.

**Use Instead**: PathGeometryTemplate

---
