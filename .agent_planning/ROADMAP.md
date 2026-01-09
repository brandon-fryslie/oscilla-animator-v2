# Oscilla Animator v2 - Project Roadmap

Last updated: 2026-01-07-164500

---

## 🟢 Phase 1: Core Foundation [ACTIVE] (0/7 completed)

**Goal:** Implement the core compilation pipeline and runtime system according to the unified spec

**Status:** ACTIVE
**Started:** 2026-01-05
**Target Completion:** TBD

### Topics

#### 💡 type-system [PROPOSED]
- **State:** PROPOSED
- **Epic:** None
- **Spec:** `design-docs/spec/01-type-system.md`
- **Description:** Worlds, TypeDesc, domains, compatibility rules

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

#### 🔄 update-blocks-types [PLANNING]
- **State:** PLANNING
- **Epic:** None
- **Spec:** Related to type system cleanup
- **Description:** Refactor blocks to use centralized type helpers
- **Planning Files:**
  - `PLAN-2026-01-05.md` - Sprint plan for type helper migration
  - `DOD-2026-01-05.md` - Definition of done

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
