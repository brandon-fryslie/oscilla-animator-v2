# Definition of Done: continuity-logging

## Verification Steps

### 1. Domain Change Detection
- [ ] Change Array count 5000→5001
- [ ] Verify log message: "Domain change: instance_X 5000→5001"
- [ ] Verify log message: "Mapped: 5000, New: 1"

### 2. Step Handlers Implemented
- [ ] `continuityMapBuild` step produces mapping
- [ ] `continuityApply` step applies gauge/slew
- [ ] No "TODO" comments remain in ScheduleExecutor for these steps

### 3. Throttling
- [ ] Rapidly change count 10 times in 1 second
- [ ] Verify ≤5 log messages appear (not 10)
- [ ] Verify coalesced message indicates multiple changes

### 4. LogPanel Display
- [ ] Domain change logs appear in LogPanel
- [ ] Logs are color-coded (info level)
- [ ] Logs include timestamp

## Performance Criteria

- Log processing: <0.5ms overhead per frame
- No memory accumulation from log spam

## Test Evidence

- [ ] Manual test: change count, see log
- [ ] Manual test: rapid changes, verify throttling
- [ ] Console: no uncaught errors
