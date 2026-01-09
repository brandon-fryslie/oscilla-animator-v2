# Roadmap Update Hooks

**Applies to:** All workflow skills that modify planning state

## Required Actions

When executing the following skills, you MUST update the roadmap:

### After /do:plan completes successfully

1. Identify the topic being planned (from directory name or user input)
2. Update roadmap: set topic state to PLANNING
3. Format: Change `#### 💡 {topic} [PROPOSED]` to `#### 📋 {topic} [PLANNING]`

### When /do:it, /do:tdd, or /do:iterative-workflow starts implementation

1. Identify the topic from planning files or user context
2. Update roadmap: set topic state to IN PROGRESS
3. Format: Change to `#### 🔄 {topic} [IN PROGRESS]`

### When work-evaluator passes all DoD OR /do:work-checkpoint user confirms done

1. Identify the topic
2. Update roadmap: set topic state to COMPLETED
3. Format: Change to `#### ✅ {topic} [COMPLETED]`
4. Update phase completion count

## Update Procedure

When updating a topic state in `.agent_planning/ROADMAP.md`:

1. Read the file
2. Find the topic line: `#### {icon} {topic-slug} [{STATE}]`
3. Replace with new icon and state
4. Also update the `- **State:** {STATE}` line below it
5. Update the `Last updated:` timestamp at the top
6. Update the phase completion count in the header (e.g., `(1/7 completed)`)
7. Write the file

## Topic Not in Roadmap

If the topic being worked on is NOT in the roadmap:

1. Log: "Note: Topic '{topic}' not found in roadmap"
2. Ask user: "Would you like me to add '{topic}' to the roadmap?"
3. If yes: Add to Phase 1 (or ask which phase) with appropriate state
4. If no: Continue without blocking

## State Icons Reference

- 💡 PROPOSED
- 📋 PLANNING
- 🔄 IN PROGRESS
- ✅ COMPLETED
- 📦 ARCHIVED

## Example Update

Before (in /do:plan for type-system):
```markdown
#### 💡 type-system [PROPOSED]
- **State:** PROPOSED
```

After:
```markdown
#### 📋 type-system [PLANNING]
- **State:** PLANNING
```

And update header:
```markdown
## 🟢 Phase 1: Core Foundation [ACTIVE] (0/7 completed)
```
becomes (if this is the first planning topic):
```markdown
## 🟢 Phase 1: Core Foundation [ACTIVE] (0/7 completed)
```
(completion count stays 0 because PLANNING is not completed)
