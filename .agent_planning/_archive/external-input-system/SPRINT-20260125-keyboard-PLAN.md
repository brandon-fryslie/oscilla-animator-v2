# Sprint: keyboard - Keyboard Support

Generated: 2026-01-25
Confidence: HIGH: 0, MEDIUM: 3, LOW: 0
Status: RESEARCH REQUIRED
Source: EVALUATION-20260125.md

## Sprint Goal

Add keyboard input support via external channels: key held state, key down/up pulses, and WASD axis computation.

## Scope

**Deliverables:**
- Add keyboard event listeners in app layer
- key.<code>.held (value 0/1) for key state
- key.<code>.down (pulse) for key press
- key.<code>.up (pulse) for key release
- key.axis.wasd.x/y computed channels for WASD movement

## Work Items

### P0: Add keyboard event listeners

**Confidence:** MEDIUM
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 7.2
**Status Reference:** EVALUATION-20260125.md - "Keyboard Support"

**Acceptance Criteria:**
- [ ] keydown event listener attached to appropriate target (window or canvas)
- [ ] keyup event listener attached
- [ ] Key code extracted from event (event.code, not event.key)
- [ ] Repeat events filtered (event.repeat === true ignored for down pulse)
- [ ] Focus handling considered (does it work when canvas focused?)

**Technical Notes:**
- Use event.code (e.g., 'KeyA', 'Space', 'ArrowUp') for consistent naming
- event.key varies by keyboard layout; event.code is physical key
- Consider: should keyboard work only when canvas focused, or always?

**Unknowns to Resolve:**
1. Focus scope - Should keyboard input work globally or only when canvas focused?
   - Research: Check how other animation tools handle this
   - Recommendation: Start with global (window), add focus option later
2. Key code normalization - Should we lowercase key codes?
   - Research: Check if 'KeyA' vs 'keya' matters for consistency
   - Recommendation: Use event.code as-is, document the format

---

### P1: Key state channels (held/down/up)

**Confidence:** MEDIUM
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 7.2
**Status Reference:** EVALUATION-20260125.md - "key.space.held, key.space.down, key.space.up"

**Acceptance Criteria:**
- [ ] key.<code>.held writes value 1 when key pressed, 0 when released
- [ ] key.<code>.down pulses on keydown (but not repeat)
- [ ] key.<code>.up pulses on keyup
- [ ] Multiple keys tracked simultaneously
- [ ] Channel names use lowercase codes (e.g., key.space.held)

**Technical Notes:**
- Need to track which keys are currently held (Set<string>)
- On keydown (not repeat): set held=1, pulse down
- On keyup: set held=0, pulse up
- Channel naming: key.{code.toLowerCase()}.{held|down|up}

**Unknowns to Resolve:**
1. Browser key repeat behavior - How quickly does repeat fire?
   - Research: Test keydown repeat timing in target browsers
   - Mitigation: Filter repeat events for down pulse, but allow for held update
2. Key release when window loses focus - Do we get keyup?
   - Research: Test blur/focus behavior
   - Mitigation: Clear all held keys on blur event

---

### P2: WASD axis channels

**Confidence:** MEDIUM
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 7.2
**Status Reference:** EVALUATION-20260125.md - "key.axis.wasd.x/y computed channels"

**Acceptance Criteria:**
- [ ] key.axis.wasd.x computed: +1 if D held, -1 if A held, 0 if both or neither
- [ ] key.axis.wasd.y computed: +1 if S held (down), -1 if W held (up), 0 if both/neither
- [ ] Computation happens at write-side before commit
- [ ] Values are value channels (persist until recomputed)
- [ ] Arrow keys also work: ArrowRight=+x, ArrowLeft=-x, ArrowDown=+y, ArrowUp=-y

**Technical Notes:**
- Compute from held key state, not from individual events
- Update axis values each frame based on current held state
- Consider: should WASD and arrows combine or be separate?
- Sign convention: +y = down (matches screen coordinates)

**Unknowns to Resolve:**
1. Should WASD and arrows combine into one axis?
   - Research: Check user expectations
   - Recommendation: Keep separate (key.axis.wasd.* and key.axis.arrows.*) or combine with documentation
2. Diagonal normalization - Should diagonal be length 1?
   - Research: Check game input conventions
   - Recommendation: No normalization initially (diagonal = sqrt(2)), document behavior

---

## Dependencies

- Requires Sprint 3 (mouse-migration) complete (to establish event handling patterns)
- P1 requires P0 (need event listeners)
- P2 requires P1 (axis computed from held state)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Browser focus issues | High | Medium | Test in multiple browsers, document behavior |
| Key repeat timing varies | Medium | Low | Filter repeats for pulses |
| Keyboard layout differences | Medium | Low | Use event.code not event.key |
| Tab/browser hotkeys conflict | Medium | Medium | Document which keys work |

## Exit Criteria (to reach HIGH confidence)

- [ ] Tested in Chrome, Firefox, Safari
- [ ] Focus behavior documented and tested
- [ ] Key repeat filtering confirmed working
- [ ] Blur handling confirmed (keys released on window blur)
- [ ] WASD axis sign convention documented
