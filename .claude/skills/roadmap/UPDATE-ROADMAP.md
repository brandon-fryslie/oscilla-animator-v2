# Roadmap Update Procedures

This document defines procedures for updating the roadmap. Skills should call these procedures at appropriate lifecycle points.

## When to Update Roadmap

| Event | New State | Procedure |
|-------|-----------|-----------|
| `/do:plan` creates planning files | PLANNING | `update_topic_state(topic, "PLANNING")` |
| `/do:it` starts implementation | IN PROGRESS | `update_topic_state(topic, "IN PROGRESS")` |
| `/do:tdd` starts implementation | IN PROGRESS | `update_topic_state(topic, "IN PROGRESS")` |
| Work evaluator passes all DoD | COMPLETED | `update_topic_state(topic, "COMPLETED")` |
| `/do:work-checkpoint` user confirms done | COMPLETED | `update_topic_state(topic, "COMPLETED")` |
| User archives topic | ARCHIVED | `update_topic_state(topic, "ARCHIVED")` |

## Procedure: update_topic_state

**Input:** `topic_slug`, `new_state`

**Steps:**

1. Read `.agent_planning/ROADMAP.md`
2. Find topic by slug (case-insensitive match)
3. If topic not found:
   - Log warning: "Topic {topic_slug} not in roadmap - consider adding with /do:roadmap {topic_slug}"
   - Return without error (don't block workflow)
4. Update topic state in the markdown
5. Update phase completion count
6. Update `Last updated:` timestamp
7. Write file

**State progression rules:**
- PROPOSED → PLANNING (when planning files created)
- PLANNING → IN PROGRESS (when implementation starts)
- IN PROGRESS → COMPLETED (when DoD met)
- Any → ARCHIVED (manual only)

## Procedure: add_topic_if_missing

**Input:** `topic_slug`, `phase_num` (optional, default=1)

Called when creating planning directory for a topic not in roadmap.

**Steps:**

1. Read `.agent_planning/ROADMAP.md`
2. Check if topic exists
3. If not exists:
   - Add to specified phase with state PROPOSED
   - Update timestamp
   - Write file
4. Return topic entry

## Procedure: sync_roadmap_from_filesystem

**Input:** None

Reconciles roadmap with actual planning files. Run manually or on `/do:roadmap` view.

**Steps:**

1. Scan `.agent_planning/*/` directories
2. For each directory:
   - Check for EVALUATION-*.md, PLAN-*.md, DOD-*.md
   - Check for *-COMPLETE.md files
   - Determine inferred state:
     - Has *-COMPLETE.md → COMPLETED
     - Has EVALUATION with "COMPLETE" status → COMPLETED
     - Has PLAN/DOD but no complete marker → PLANNING
     - Directory exists but empty → PROPOSED
3. Compare inferred states with roadmap states
4. Report discrepancies (don't auto-fix without confirmation)

## Integration with Skills

Skills that should call these procedures:

### /do:plan
At end of planning:
```
update_topic_state(topic_slug, "PLANNING")
```

### /do:it, /do:tdd, /do:iterative-workflow
At start of implementation:
```
update_topic_state(topic_slug, "IN PROGRESS")
```

### /do:work-checkpoint
When user confirms completion:
```
update_topic_state(topic_slug, "COMPLETED")
```

### /do:work-evaluator
When all DoD items pass:
```
update_topic_state(topic_slug, "COMPLETED")
```

## Example: Updating Topic State

Given ROADMAP.md contains:
```markdown
#### 💡 type-system [PROPOSED]
- **State:** PROPOSED
```

After `/do:plan type-system` completes:
```markdown
#### 📋 type-system [PLANNING]
- **State:** PLANNING
```

After implementation starts:
```markdown
#### 🔄 type-system [IN PROGRESS]
- **State:** IN PROGRESS
```

After DoD passes:
```markdown
#### ✅ type-system [COMPLETED]
- **State:** COMPLETED
```

## State Icons

| State | Icon | Meaning |
|-------|------|---------|
| PROPOSED | 💡 | Identified, no planning |
| PLANNING | 📋 | Has planning files |
| IN PROGRESS | 🔄 | Implementation started |
| COMPLETED | ✅ | All DoD met |
| ARCHIVED | 📦 | No longer maintained |

## Error Handling

- Missing ROADMAP.md: Create with Phase 1 template
- Topic not found: Log warning, continue (don't block)
- Parse error: Log error, don't modify file
- Write error: Report to user, suggest manual update
