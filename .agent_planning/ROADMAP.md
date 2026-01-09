# Oscilla Animator v2 - Project Roadmap

Last updated: 2026-01-09-200700

---

## 🟢 Phase 1: Core Foundation [ACTIVE] (3/10 completed)

**Goal:** Implement the core compilation pipeline and runtime system according to the unified spec

**Status:** ACTIVE
**Started:** 2026-01-05
**Target Completion:** TBD

### Topics

#### ✅ update-blocks-types [COMPLETED]
- **State:** COMPLETED
- **Epic:** None
- **Description:** Refactor blocks to use centralized type helpers, split god blocks into composable primitives
- **Completed:** 2026-01-05
- **Summary:** PositionSwirl split into 5 composable blocks, HueRainbow split into 2. All tests pass.
- **Completion Report:** `.agent_planning/ARCHITECTURAL-REFACTOR-COMPLETE.md`

#### ✅ canonical-arch-alignment [COMPLETED]
- **State:** COMPLETED
- **Epic:** None
- **Description:** Implement canonical 5-axis type system (PayloadType, AxisTag, Cardinality, Temporality, Binding, Extent, SignalType)
- **Completed:** 2026-01-09
- **Summary:** P0-P3 delivered. 68 tests passing. All 25 blocks migrated to SignalType system.
- **Planning Files:** `.agent_planning/canonical-arch-alignment/`

#### ✅ design-docs-audit [COMPLETED]
- **State:** COMPLETED
- **Epic:** None
- **Description:** Audit design docs for contradictions, ambiguities, and inconsistencies
- **Planning Files:** `.agent_planning/design-docs-audit/`

#### 📋 ir-5-axes [PLANNING]
- **State:** PLANNING
- **Epic:** None
- **Spec:** `design-docs/IR-and-normalization-5-axes.md`
- **Description:** Implement 5-axis metadata in IR schema, CompiledProgramIR, slotMeta with offsets
- **Planning Files:** `.agent_planning/ir-5-axes/`
- **Status Note:** Evaluation shows major gaps - spec largely unimplemented

#### 📋 type-system [PLANNING]
- **State:** PLANNING
- **Epic:** None
- **Spec:** `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md`
- **Description:** P4-P6: Runtime migration, constraint solving, bus migration (builds on canonical-arch-alignment P0-P3)
- **Planning Files:** `.agent_planning/type-system/`
- **Current Sprint:** P4 - Runtime Migration (adapter, slotMeta, assertions)

#### 💡 time-model [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/spec/02-time.md`
- **Description:** TimeRoot, TimeModel, monotonic time rules

#### 💡 buses-and-rails [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/spec/03-buses.md`
- **Description:** Multi-writer inputs, combine modes, bus blocks

#### 💡 compilation-pipeline [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/spec/04-compilation.md`
- **Description:** Normalization, validation, compile passes

#### 💡 runtime-execution [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/spec/05-runtime.md`
- **Description:** Runtime loop, hot swap, state continuity

#### 💡 primitives-catalog [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/spec/08-primitives-composites.md`
- **Description:** Complete primitive block set and composite library

---

## ⏸️ Phase 2: Rendering & UI [QUEUED] (0/2 completed)

**Goal:** Implement rendering pipeline and basic UI for patch editing

**Status:** QUEUED
**Dependencies:** Phase 1 core foundation

### Topics

#### 💡 renderer-implementation [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/spec/09-renderer.md`
- **Description:** Renderer contract, Canvas2D implementation, render commands

#### 💡 patch-editor-ui [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Description:** Visual patch editor for creating and editing animation programs

---

## ⏸️ Phase 3: Advanced Features [QUEUED] (0/2 completed)

**Goal:** Implement advanced system features and optimizations

**Status:** QUEUED
**Dependencies:** Phase 2 rendering

### Topics

#### 💡 phase-matching-system [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/spec/10-phase-matching-system.md`
- **Description:** Phase matching and unwrapping system

#### 💡 transforms-catalog [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/spec/07-transforms.md`
- **Description:** Transform blocks, lens/adapter stacks, full catalog

---

## Legend

**Phase Status:**
- 🟢 ACTIVE - Currently being worked on
- ⏸️ QUEUED - Planned but not started
- ✅ COMPLETED - All topics completed
- 🔴 BLOCKED - Cannot proceed due to dependencies

**Topic Status:**
- 💡 PROPOSED - Identified but no planning yet
- 📋 PLANNING - Planning files exist, no implementation
- 🔄 IN PROGRESS - Implementation started
- ✅ COMPLETED - All acceptance criteria met
- 📦 ARCHIVED - No longer maintained

**Notes:**
- Topics align with unified spec in `design-docs/spec/`
- Each topic should have planning files in `.agent_planning/<topic>/`
- Use `/do:roadmap <topic>` to add new topics
- Use `/do:plan <topic>` to create planning files for a topic
- Roadmap is automatically updated by workflow skills (see `.claude/rules/roadmap-hooks.md`)
