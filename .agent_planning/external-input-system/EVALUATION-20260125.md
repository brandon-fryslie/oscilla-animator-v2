# Evaluation: External Input System (Full Implementation)

**Date:** 2026-01-25
**Verdict:** CONTINUE — Ready for sprint planning

## Summary

The External Input System spec is well-defined across 4 design documents. The codebase currently has minimal hardcoded mouse support that violates the spec's "no device-specific logic in IR" principle. Full implementation requires replacing the current approach with a generic channel-based system.

## Current State

### What Exists (Hardcoded Mouse Only)
- `ExternalInputs` interface: `mouseX`, `mouseY`, `mouseOver`, `smoothX`, `smoothY`
- `SigExprExternal.which: 'mouseX' | 'mouseY' | 'mouseOver'` (literal union)
- `SignalEvaluator`: hardcoded switch statement for 3 mouse values
- `IRBuilder.sigExternal()`: only accepts the 3 hardcoded mouse names
- No blocks exist for external input access in patches

### What's Missing (Per Spec)
- **Channel system**: ExternalWriteBus, ExternalChannelSnapshot, commit semantics
- **Generic IR**: `which: string` instead of literal union
- **Channel kinds**: value/pulse/accum semantics for different input types
- **Block layer**: ExternalInput, ExternalGate, ExternalVec2 blocks
- **Device adapters**: MIDI, OSC, keyboard, audio writers

## Spec Roadmap Summary

The design docs define 8 phases:
1. **Phase 0**: Lock the contract (spec doc)
2. **Phase 1**: Minimal infrastructure (channels + snapshot)
3. **Phase 2**: IR support (sigExternal) + evaluator integration
4. **Phase 3**: Block surface (ExternalInput + utilities)
5. **Phase 4**: Migrate existing hardcoded externals (mouse)
6. **Phase 5**: Device adapters (MIDI, OSC)
7. **Phase 6**: Audio analysis integration (FFT/RMS)
8. **Phase 7**: Type tightening + registry
9. **Phase 8**: Higher-level UX (later)

Phases 0-4 form the **critical path** — they enable the generic channel system and migrate mouse away from hardcoded handling.

Phases 5-7 are **parallel/incremental** — each device adapter is independent work once the foundation exists.

Phase 8 is **deferred** — UX improvements after core system is solid.

## Confidence Assessment

| Phase | Confidence | Rationale |
|-------|------------|-----------|
| Phase 1 (Infrastructure) | HIGH | Spec is precise, data structures well-defined |
| Phase 2 (IR + Evaluator) | HIGH | Small changes, clear before/after |
| Phase 3 (Blocks) | HIGH | Standard block implementation pattern |
| Phase 4 (Mouse Migration) | HIGH | Straightforward migration once Phases 1-3 exist |
| Phase 5-7 (Devices/Audio) | MEDIUM | External dependencies (WebMIDI, OSC libs, audio APIs) |
| Phase 8 (UX) | LOW | UI design questions, not immediate priority |

## Blocking Issues

None. The spec is clear and implementation path is well-defined.

## Recommended Sprint Structure

**Sprint 1: Channel Infrastructure** (Phases 1-2)
- ExternalWriteBus, ExternalChannelSnapshot, ExternalChannelSystem
- IR changes: SigExprExternal.which → string
- Evaluator simplification: remove switch, use snapshot.getFloat()
- Commit lifecycle in executeFrame

**Sprint 2: Block Surface** (Phase 3)
- ExternalInput block implementation
- ExternalGate block (optional convenience)
- ExternalVec2 block (optional convenience)

**Sprint 3: Mouse Migration** (Phase 4)
- Move mouse handling to channel writes
- Remove hardcoded ExternalInputs interface
- Delete legacy switch statements
- Smoothing on write-side only

**Sprint 4: Keyboard Support** (Phase 5 subset)
- key.*.held, key.*.down, key.*.up channels
- WASD axis computation (key.axis.wasd.x/y)

**Future Sprints** (Phase 5-7, not planned in detail now)
- MIDI writer module
- OSC writer module
- Audio/FFT writer module
- Channel registry + diagnostics

## Dependencies

- Sprint 2 requires Sprint 1 (blocks need IR support)
- Sprint 3 requires Sprint 2 (migration needs blocks to exist)
- Sprint 4 requires Sprint 3 (keyboard follows same pattern as mouse)
