# Definition of Done: assets-crossdomain
Generated: 2026-02-02
Status: RESEARCH REQUIRED
Plan: SPRINT-20260202-assets-crossdomain-PLAN.md

## Acceptance Criteria

### Path Asset Format (WI-1)
- [ ] JSON schema or TypeScript interface defined
- [ ] Save and load functions implemented
- [ ] Round-trip test passes
- [ ] Format is version-tagged

### Cross-Domain Path Following (WI-2)
- [ ] LayoutAlongPath block accepts path + instance count
- [ ] Even distribution by arc length
- [ ] Position and tangent outputs over target domain
- [ ] Works with polygon and bezier paths

### Dynamic Topology Queries (WI-3)
- [ ] Point-in-path query for closed paths
- [ ] Nearest-point-on-path query
- [ ] Works for polygon and bezier paths
- [ ] Performance: 10K queries/frame for simple paths

## Exit Criteria (for LOW items to reach MEDIUM)
- [ ] Path asset: storage mechanism decided, format schema drafted, SVG import scoped
- [ ] LayoutAlongPath: domain crossing mechanism designed, instance count strategy decided
- [ ] Topology queries: API approach decided, polygon implementation working
- [ ] All research questions in PLAN answered with evidence or explicit decisions
- [ ] User review and approval of design decisions
