# Implementation Context: Keyboard Support

Generated: 2026-01-25
Plan: SPRINT-20260125-keyboard-PLAN.md

## Key Files

### Files to Modify

| File | Change |
|------|--------|
| App layer (main.ts or Canvas component) | Add keyboard event listeners |
| `src/services/AnimationLoop.ts` | Add keyboard channel updates per frame |

### Files to Reference

| File | Why |
|------|-----|
| Mouse event handlers (from Sprint 3) | Pattern for event handling |
| `src/runtime/ExternalChannel.ts` | writeBus API |

## Existing Patterns

### Mouse Event Pattern (from Sprint 3)
```typescript
// Follow this pattern for keyboard
canvas.addEventListener('mousedown', (e) => {
  writeBus.pulse('mouse.button.left.down');
  writeBus.set('mouse.button.left.held', 1);
});
```

### Channel Naming Convention (from spec)
```
key.<code>.held   - value (0/1)
key.<code>.down   - pulse
key.<code>.up     - pulse
key.axis.wasd.x   - value (-1/0/1)
key.axis.wasd.y   - value (-1/0/1)
```

## Spec References

- design-docs/external-input/02-External-Input-Spec.md
  - Section 7.2: Keyboard channel namespace

## Code Snippets

### Keyboard State Tracking
```typescript
// Track which keys are currently held
const heldKeys = new Set<string>();

function handleKeyDown(e: KeyboardEvent): void {
  // Normalize code to lowercase for consistent channel names
  const code = e.code.toLowerCase();

  // Ignore repeat events for down pulse
  if (e.repeat) return;

  // Track held state
  heldKeys.add(code);

  // Pulse down
  writeBus.pulse(`key.${code}.down`);
  writeBus.set(`key.${code}.held`, 1);
}

function handleKeyUp(e: KeyboardEvent): void {
  const code = e.code.toLowerCase();

  // Track held state
  heldKeys.delete(code);

  // Pulse up and clear held
  writeBus.pulse(`key.${code}.up`);
  writeBus.set(`key.${code}.held`, 0);
}

function handleBlur(): void {
  // Release all keys when window loses focus
  for (const code of heldKeys) {
    writeBus.pulse(`key.${code}.up`);
    writeBus.set(`key.${code}.held`, 0);
  }
  heldKeys.clear();
}
```

### Event Listener Setup
```typescript
function setupKeyboardHandlers(writeBus: ExternalWriteBus): () => void {
  const keydown = (e: KeyboardEvent) => handleKeyDown(e);
  const keyup = (e: KeyboardEvent) => handleKeyUp(e);
  const blur = () => handleBlur();

  // Attach to window for global capture
  // Could also attach to specific element for focused-only behavior
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', blur);

  // Return cleanup function
  return () => {
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
  };
}
```

### WASD Axis Computation
```typescript
function computeWasdAxis(heldKeys: Set<string>): { x: number; y: number } {
  let x = 0;
  let y = 0;

  // WASD
  if (heldKeys.has('keya')) x -= 1;
  if (heldKeys.has('keyd')) x += 1;
  if (heldKeys.has('keyw')) y -= 1; // Up = negative Y (screen coords)
  if (heldKeys.has('keys')) y += 1; // Down = positive Y

  // Optional: also include arrow keys
  if (heldKeys.has('arrowleft')) x -= 1;
  if (heldKeys.has('arrowright')) x += 1;
  if (heldKeys.has('arrowup')) y -= 1;
  if (heldKeys.has('arrowdown')) y += 1;

  // Clamp to [-1, 1] (in case both WASD and arrows pressed)
  x = Math.max(-1, Math.min(1, x));
  y = Math.max(-1, Math.min(1, y));

  return { x, y };
}

function updateKeyAxisChannels(writeBus: ExternalWriteBus): void {
  const axis = computeWasdAxis(heldKeys);
  writeBus.set('key.axis.wasd.x', axis.x);
  writeBus.set('key.axis.wasd.y', axis.y);
}
```

### Frame Update
```typescript
// Called each frame before commit
function updateKeyboardChannels(writeBus: ExternalWriteBus): void {
  // Update axis channels based on current held state
  updateKeyAxisChannels(writeBus);

  // Note: held/down/up for individual keys are handled in event handlers
  // Axis channels are recomputed each frame from held state
}
```

## Browser Compatibility Notes

### event.code vs event.key

| Property | Description | Example |
|----------|-------------|---------|
| event.code | Physical key position | 'KeyA', 'Space', 'ArrowUp' |
| event.key | Character produced | 'a', 'A', ' ', 'ArrowUp' |

Use `event.code` for consistent behavior across keyboard layouts.

### Key Code Reference

| Physical Key | event.code |
|--------------|------------|
| A | 'KeyA' |
| W | 'KeyW' |
| S | 'KeyS' |
| D | 'KeyD' |
| Space | 'Space' |
| Enter | 'Enter' |
| Shift | 'ShiftLeft', 'ShiftRight' |
| Ctrl | 'ControlLeft', 'ControlRight' |
| Arrow Up | 'ArrowUp' |
| Arrow Down | 'ArrowDown' |
| Arrow Left | 'ArrowLeft' |
| Arrow Right | 'ArrowRight' |

After lowercase: 'keya', 'space', 'arrowup', etc.

### Browser-Specific Issues

1. **Safari**: May not fire keyup for some keys if Command is held
2. **Firefox**: May have different repeat timing
3. **Chrome**: Generally most consistent

### Keys That May Conflict

Some keys trigger browser actions and may not work:
- Tab (focus navigation)
- F1-F12 (browser functions)
- Ctrl+key combinations (copy, paste, etc.)
- Alt+key combinations (menu access)

Consider calling `e.preventDefault()` for keys you want to capture, but be careful about accessibility.

## Design Decisions to Make

### Focus Scope

**Option A: Global (window)**
- Pros: Works regardless of focus, simpler UX
- Cons: May interfere with typing elsewhere, accessibility concerns

**Option B: Canvas-focused only**
- Pros: More controlled, less interference
- Cons: Requires canvas to be focusable, user must click canvas first

**Recommendation**: Start with Option A (global), add option to restrict later.

### Key Code Normalization

**Option A: Use as-is (e.g., 'KeyA')**
- Pros: Matches browser API exactly
- Cons: Mixed case in channel names

**Option B: Lowercase (e.g., 'keya')**
- Pros: Consistent channel naming, easier to type
- Cons: Slightly different from browser API

**Recommendation**: Option B (lowercase) for consistency with other channels.

### WASD vs Arrows

**Option A: Separate channels**
- key.axis.wasd.x/y for WASD
- key.axis.arrows.x/y for arrows
- Pros: User can choose which to use

**Option B: Combined**
- key.axis.movement.x/y combining both
- Pros: Simpler for most use cases

**Recommendation**: Start with combined (Option B), can add separate later.

## Testing Checklist

- [ ] Press A -> key.keya.held = 1, key.keya.down pulses
- [ ] Release A -> key.keya.held = 0, key.keya.up pulses
- [ ] Hold A -> no additional down pulses (repeat filtered)
- [ ] Press A+D -> key.axis.wasd.x = 0
- [ ] Press D only -> key.axis.wasd.x = 1
- [ ] Blur window -> all held keys released
- [ ] Multiple keys simultaneously -> all tracked independently
