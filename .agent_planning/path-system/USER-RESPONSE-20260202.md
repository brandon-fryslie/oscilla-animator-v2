# User Response: Path System Roadmap
Timestamp: 2026-02-02

## Approval
- **Sprint 0 (phase1-fix)**: APPROVED
- **Sprint 1 (bezier-support)**: APPROVED (combined with Sprint 0)
- **Sprint 2 (advanced-ops)**: Acknowledged, not yet approved for implementation
- **Sprint 3 (assets-crossdomain)**: Acknowledged, not yet approved for implementation

## Scope
User requested Sprint 0 + Sprint 1 be implemented together as a single pass.

## Design Decisions (from ChatGPT consultation)

### Architecture: Topology threading
- **Option A with required topologyId** on pathDerivative kernel
- Polygons get real topologies (no dual-mode API)
- Dispatch in materializer based on topology flags (hasCubic, hasQuad)

### Off-curve control point tangents
- **Leg tangent** approach: P1 gets normalize(P1-P0), P2 gets normalize(P3-P2)
- Handle direction from/to adjacent anchor
- Degenerate fallback: try next adjacent point, then (0,0,0)

### Bezier-producing block
- **RoundedPolygon(sides, cornerRadius)** block
- All-cubic topology (straight edges as degenerate cubics)
- Standard circular-arc cubic approximation: k = 4/3 * tan(φ/4)
- cornerRadius=0 → polygon, increasing → rounded corners
- Analytically derivable for testing

## Files
- Plan: SPRINT-20260202-phase1-fix-PLAN.md
- DoD: SPRINT-20260202-phase1-fix-DOD.md
- Context: SPRINT-20260202-phase1-fix-CONTEXT.md
- Plan: SPRINT-20260202-bezier-support-PLAN.md
- DoD: SPRINT-20260202-bezier-support-DOD.md
- Context: SPRINT-20260202-bezier-support-CONTEXT.md
