---
name: walkIR is for observe+accumulate, NOT for fold/transform
description: walkIR (pre-order void visitor) is correct for validation and dep collection, but the reverse translator needs a fold pattern (children return values, parent composes)
type: feedback
---

walkIR is pre-order, void-return — perfect for validation (observe + accumulate issues) and dependency collection (observe + accumulate refs). The reverse translator needs a fold: each child returns a string, the parent composes them. That's a fundamentally different traversal pattern.

The reverse translator should be its own recursive function, NOT a walkIR visitor. But it should read from the same EXPR_RULES/STMT_RULES tables to know which fields are children (avoiding hardcoded recursion).

**Why:** Void visitors and fold patterns have different control flow. Trying to force a fold into a void visitor adds complexity (accumulator stacks, result maps). Better to have two traversal functions that share the same declarative tables.

**How to apply:** When designing IR traversal, distinguish "observe + accumulate" (walkIR visitor) from "transform + compose" (recursive fold). Both should read from shared rule tables. Don't claim one pattern covers both.
