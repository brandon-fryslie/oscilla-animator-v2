# Sprint: verification - V1 Migration Audit & Documentation

Generated: 2026-01-26
Confidence: HIGH: 2, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Complete the v1→v2 render pipeline migration verification and unblock intrinsics documentation.

## Scope

**Deliverables:**
- Audit codebase for any remaining v1 render paths
- Close ms5.8 with verification evidence
- Unblock and complete ms5.11 (intrinsics documentation)

## Work Items

### P0: Audit for remaining v1 render code [HIGH]

**Bead:** ms5.8
**Acceptance Criteria:**
- [ ] No references to legacy numeric shape encoding (0=circle, 1=rect)
- [ ] No "v1" comments in active render code (documentation OK)
- [ ] No dual code paths based on v1/v2 detection
- [ ] RenderAssembler uses only v2 shape resolution
- [ ] Canvas2DRenderer has no legacy rendering paths
- [ ] Document findings (none expected based on exploration)

**Technical Notes:**
- Exploration already confirmed v2 is architecturally complete
- This sprint formally audits and closes
- Search patterns: `v1`, `legacy`, `deprecated.*render`, numeric shape literals

### P1: Align intrinsics documentation with implementation [HIGH]

**Bead:** ms5.11
**Acceptance Criteria:**
- [ ] `.claude/rules/compiler/intrinsics.md` matches actual implementation
- [ ] All intrinsics documented: index, normalizedIndex, randomId, position, radius
- [ ] Documentation for `position` describes actual layout-based behavior
- [ ] Documentation for `radius` describes actual layout-based behavior
- [ ] No misleading or outdated information

**Technical Notes:**
- Current docs in `.claude/rules/compiler/intrinsics.md`
- Check `src/runtime/Materializer.ts` for actual implementation
- Verify position/radius behavior matches documentation
- Update if discrepancies found

**Blocked Status:**
- Bead shows as blocked on parent (ms5)
- Can unblock by updating dependency or completing other items first
- Parent doesn't actually block this work

## Dependencies

- Sprint 1 (quick-wins) should be done first
- ms5.11 is listed as blocked but can proceed

## Risks

- **Low risk**: Exploration already verified clean state
- This sprint is mostly verification and documentation
