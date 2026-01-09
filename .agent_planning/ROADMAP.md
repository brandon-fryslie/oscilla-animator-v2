# Oscilla Animator v2 - Project Roadmap

Last updated: 2026-01-09-081000

---

## 🟢 Phase 1: Core Foundation [ACTIVE] (3/10 completed)

**Goal:** Implement the core compilation pipeline and runtime system according to the unified spec

**Status:** ACTIVE
**Started:** 2026-01-05
**Target Completion:** TBD
**Unified Plan:** `.agent_planning/phase1-remaining/PLAN-20260109-210000.md` (APPROVED)

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
- **Epic:** Phase 1 Unified Plan (P0)
- **Spec:** `design-docs/IR-and-normalization-5-axes.md`
- **Description:** Implement 5-axis metadata in IR schema, CompiledProgramIR, slotMeta with offsets
- **Planning Files:** `.agent_planning/ir-5-axes/`
- **Status Note:** Plan approved, ready for implementation

#### 📋 type-system [PLANNING]
- **State:** PLANNING
- **Epic:** Phase 1 Unified Plan (P1)
- **Spec:** `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md`
- **Description:** AxesDescIR integration, bridge functions, SlotMetaEntry population
- **Planning Files:** `.agent_planning/phase1-remaining/`
- **Status Note:** ~90% foundation complete, IR integration remaining

#### 📋 time-model [PLANNING]
- **State:** PLANNING
- **Epic:** Phase 1 Unified Plan (P2)
- **Spec:** `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/03-time-system.md`
- **Description:** Dual-phase TimeRoot (phaseA/phaseB independent periods), phase continuity on hot-swap
- **Planning Files:** `.agent_planning/time-model/`
- **Status Note:** Sprint plan APPROVED. P0: Dual-phase TimeRoot, P1: Runtime tracking, P2: Phase continuity

#### 📋 buses-and-rails [PLANNING]
- **State:** PLANNING
- **Epic:** Phase 1 Unified Plan (P5)
- **Spec:** `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.md`
- **Description:** Multi-writer combine, default sources, rail system
- **Planning Files:** `.agent_planning/phase1-remaining/`
- **Status Note:** ~10% complete, major work pending

#### 🔄 compilation-pipeline [IN PROGRESS]
- **State:** IN PROGRESS
- **Epic:** Phase 1 Unified Plan (P3)
- **Spec:** `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md`
- **Description:** Passes 5-10: execution class, tables, schedule, slots, debug
- **Planning Files:** `.agent_planning/compilation-pipeline/`
- **Status Note:** Domain unification COMPLETE (2026-01-09). Passes 5-10 remaining.
- **Completed Sprint:** Domain Unification - 11 tests passing, domain tracking through field composition

#### 📋 runtime-execution [PLANNING]
- **State:** PLANNING
- **Epic:** Phase 1 Unified Plan (P4)
- **Spec:** `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/05-runtime.md`
- **Description:** Offset-addressed execution, schedule executor update
- **Planning Files:** `.agent_planning/phase1-remaining/`
- **Status Note:** ~50% complete, offset addressing needed

#### 📋 primitives-catalog [PLANNING]
- **State:** PLANNING
- **Epic:** Phase 1 Unified Plan (P6)
- **Spec:** `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.md`
- **Description:** Basic 12 completion, stateful primitives, composites
- **Planning Files:** `.agent_planning/primitives-catalog/`
- **Status Note:** Sprint plan APPROVED. Deliverables: UnitDelay, Hash, Id01

---

## ⏸️ Phase 2: Rendering & UI [QUEUED] (0/3 completed)

**Goal:** Implement rendering pipeline and basic UI for patch editing

**Status:** QUEUED
**Dependencies:** Phase 1 core foundation

### Topics

#### 💡 renderer-implementation [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/06-renderer.md`
- **Description:** Renderer contract, Canvas2D implementation, render commands

#### 💡 patch-editor-ui [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Description:** Visual patch editor for creating and editing animation programs

#### 📋 domain-editor-ui [PLANNING]
- **State:** PLANNING
- **Epic:** None
- **Description:** UI for creating and selecting domains - presets vs custom configuration, domain management UX
- **Planning Files:** `.agent_planning/domain-editor-ui/`
- **Recommended Approach:** Parameter Panel + Presets (Option A from research)
- **Dependencies:** patch-editor-ui, Phase 1 complete
- **Origin:** Identified during compilation-pipeline domain unification sprint (2026-01-09)

---

## ⏸️ Phase 3: Advanced Features [QUEUED] (0/2 completed)

**Goal:** Implement advanced system features and optimizations

**Status:** QUEUED
**Dependencies:** Phase 2 rendering

### Topics

#### 💡 phase-matching-system [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/spec-archived-20260109-160000/time/10-phase-matching-system.md`
- **Description:** Phase matching and unwrapping system

#### 💡 transforms-catalog [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/spec-archived-20260109-160000/graph/07-transforms.md`
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
- 📋 PLANNING - Planning files exist, ready for implementation
- 🔄 IN PROGRESS - Implementation started
- ✅ COMPLETED - All acceptance criteria met
- 📦 ARCHIVED - No longer maintained

**Notes:**
- Topics align with canonical spec in `design-docs/CANONICAL-oscilla-v2.5-20260109/`
- Each topic should have planning files in `.agent_planning/<topic>/`
- Phase 1 remaining work unified in `.agent_planning/phase1-remaining/`
- Use `/do:roadmap <topic>` to add new topics
- Use `/do:plan <topic>` to create planning files for a topic
- Roadmap is automatically updated by workflow skills (see `.claude/rules/roadmap-hooks.md`)
