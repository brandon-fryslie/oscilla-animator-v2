# Sprint: Architectural Fix - Split Pass 0 into 0a/0b

Generated: 2026-01-25T15:00:00Z
Confidence: HIGH: 1, MEDIUM: 2, LOW: 0
Status: RESEARCH REQUIRED (blocked by interim fix verification)

## Sprint Goal

Replace the interim double-Pass-0 workaround with a clean architectural solution that properly separates user-block payload resolution from derived-block payload resolution.

## Scope

**Deliverables:**
- Split Pass 0 into Pass 0a (user blocks) and Pass 0b (derived blocks with edge context)
- Pass 0b uses target input type for resolution (not edge inference)
- Remove interim double-pass workaround
- Update architecture documentation

## Work Items

### P0: Create Pass 0b - Derived Payload Resolution [HIGH]

**Acceptance Criteria:**
- [ ] New pass `pass0bDerivedPayloadResolution()` in separate file
- [ ] Resolves payloadType for blocks created by Pass 1
- [ ] Uses target input's declared type (not edge inference)
- [ ] Only processes blocks with `role.kind === 'derived'`

**Technical Notes:**
- Derived blocks have edges (Pass 1 creates them)
- Target input type is known from the block definition
- Can use edge.to.slotId to lookup target input's type

### P1: Integrate Pass 0b into orchestration [MEDIUM]

**Acceptance Criteria:**
- [ ] `runNormalizationPasses()` calls Pass 0a, Pass 1, Pass 0b in order
- [ ] Remove interim double-pass workaround
- [ ] Rename variables for clarity (p0a, p1, p0b)

**Technical Notes:**
- Ensure comments document the pass split rationale

#### Unknowns to Resolve
- Should Pass 0b be general (any payload-generic block) or specific (only DefaultSource-created)?
- What if a derived block connects to another payload-generic block (chain resolution)?

#### Exit Criteria
- Decision documented on scope of Pass 0b
- Chain resolution strategy documented (if applicable)

### P2: Update documentation and contracts [MEDIUM]

**Acceptance Criteria:**
- [ ] Pass 1 contract updated to note it creates payload-generic blocks
- [ ] Pass 0b contract documented
- [ ] Architecture diagram updated (if exists)

**Technical Notes:**
- Update comments in pass files
- Add to CLAUDE.md if pass pipeline is documented there

#### Unknowns to Resolve
- Where is the pass pipeline documented?
- Is there an architecture diagram to update?

#### Exit Criteria
- Documentation locations identified
- Documentation updated

## Dependencies

- **BLOCKED BY**: SPRINT-20260125-140000-interim-fix (must verify interim fix works first)

## Risks

- **Chain resolution**: If a derived Const connects to a derived FieldBroadcast, need to handle
- **Test coverage**: May need to add tests for edge cases
- **Contract evolution**: Changing pass semantics could have hidden dependencies
