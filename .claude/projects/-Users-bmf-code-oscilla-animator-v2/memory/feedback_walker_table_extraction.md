---
name: Walker table extraction — bidirectional by design
description: When extracting DSL ↔ IR mapping tables, always include both forward and inverse directions so the reverse translator falls out naturally
type: feedback
---

Extract DSL ↔ IR symbol mappings (BUILTIN_NAMES, CAST_NAMES, CONSTRUCT_MAP, $-chain rules, operator maps) into shared tables alongside IR rule tables. Always include inverse directions (CONSTRUCT_INVERSE, BINOP_TO_JS, DOLLAR_CHAIN_RULES with resolve/unresolve). This makes forward walker and reverse translator read the same source of truth.

**Why:** The reverse translator needs the inverse of every mapping the forward walker uses. If mappings are baked into the walker, the reverse translator must duplicate them. One table, two directions — [LAW:one-source-of-truth].

**How to apply:** When creating shared IR tables, ask "what does the reverse direction need?" and include it. Prefer declarative tables over procedural switch statements — tables are readable in both directions, switch statements are not.
