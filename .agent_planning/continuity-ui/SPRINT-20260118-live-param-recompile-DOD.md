# Definition of Done: live-param-recompile

## Verification Steps

### 1. Live Recompile
- [ ] Open app, select Array block in graph
- [ ] Change count param in inspector (e.g., 5000 → 5001)
- [ ] Verify animation continues without interruption
- [ ] Verify new element count is visible in render

### 2. Continuity Preservation
- [ ] Change count from 5000 → 5001
- [ ] Observe NO visual jump in existing elements
- [ ] New element (5001st) appears without disrupting others

### 3. Error Handling
- [ ] Intentionally create invalid wiring
- [ ] Verify error appears in LogPanel
- [ ] Verify animation continues with old program

### 4. Count Slider
- [ ] Select Array block
- [ ] Verify slider control appears for count
- [ ] Drag slider, observe real-time count changes

## Performance Criteria

- Recompile debounce: ≥100ms between changes
- No dropped frames during recompile
- Memory: No leaks from repeated recompiles (test 50x changes)

## Test Evidence

- [ ] Manual test: slider drag produces smooth animation
- [ ] Manual test: rapid changes don't crash
- [ ] Console: no errors/warnings during normal operation
