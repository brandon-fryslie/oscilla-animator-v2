# Hard Completion Audit: compiledir-hybrid-foundation

Snapshot timestamp: 2026-02-23
Scope: W11, W5, W6, W2, W7, W12

## Kill List Counts (Baseline -> After Packet 1)
- K-W11-1: 1 -> 0
- K-W11-2: 1 -> 0
- K-W11-3: 2 -> 2
- K-W5-1: 1 -> 1
- K-W5-2: 1 -> 1
- K-W5-3: 3 -> 3
- K-W6-1: 1 -> 1
- K-W6-2: 1 -> 1
- K-W6-3: 8 -> 8
- K-W2-1: 3 -> 3
- K-W2-2: 1 -> 1
- K-W7-1: 5 -> 5
- K-W12-1: 2 -> 2

## Allowlist Counts (Baseline -> After Packet 1)
- A-W11-1: 2 -> 2
- A-W2-1: 3 -> 3

## Duplicate Authority Findings
- Not yet measured by dedicated analyzer in this packet.

## Core Fallback Findings
- Not yet measured by dedicated analyzer in this packet beyond kill-list gates.

## Lane B Inventory
- 4 items (`TEST-LANES.md`)

## Packet 1 Execution Result
- Status: Complete (packet scope only)
- Implemented:
  - Removed deprecated IRBuilder public export from `src/compiler/ir/index.ts`
  - Removed deprecated IRBuilder public export from `src/compiler/index.ts`
  - Tightened gate thresholds for K-W11-1 and K-W11-2 to `0` in `src/__tests__/compiledir-foundation-gates.test.ts`

## Gate Run Notes
- Attempted blocking gate suites via Vitest, but local dependency resolution failed:
  - `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest'`
- Static counter scans were executed successfully and used for this snapshot.

## Completion Decision
- INCOMPLETE.

Reason:
- Multiple kill-list and allowlist counters are non-zero.
- Lane B inventory is non-zero.

// [LAW:verifiable-goals] Completion requires all tracked counters to reach zero.
