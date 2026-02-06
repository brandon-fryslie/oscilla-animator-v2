Use a convention that encodes exactly one “dimension” of meaning per segment, and never mixes levels.

The three dimensions you’re juggling
1.	IR layer / role: is this an expression node, a step, a type, a block, a kernel?
2.	Value family: does it evaluate to a value (generic), or is it specifically a signal/field/event specialization?
3.	Operation: const, add, sin, zip, map, etc.

If you let names encode more than one dimension inconsistently, you get a taxonomy that rots fast.

The naming I’d lock in
•	Unify at the “Value” level (your One True Type direction):
•	ValueExpr (union)
•	ValueExprConst
•	ValueExprAdd, ValueExprSin, etc.

Then, if you still need specialized runtime categories:
•	SigExpr / FieldExpr / EventExpr are either:
•	(A) removed entirely in favor of ValueExpr + type axes + validation, or
•	(B) retained as derived views over ValueExpr (not separate node sets).

In either case, constants are not “signal constants” or “field constants”. They’re just constants; the type determines whether they’re usable in a context that expects a signal/field/event.

Why not SignalConstExpr / SignalConstantExpression

Because that bakes in a concept you’re actively trying to demote:
•	If “signal vs field vs event” is meant to be derived from CanonicalType axes, then putting “Signal” in the node name is duplicating information and inviting divergence.
•	It also blocks the correct generalization: you will inevitably need constants for non-signal payloads (cameraProjection, shape config-ish payloads, etc.). You don’t want to fork naming by consumer category.

Concrete rules you can enforce in code review
•	Union name: <Domain><Role> → ValueExpr, CompileStep, CanonicalType.
•	Variant name: <UnionName><Op> → ValueExprConst, ValueExprZip, CompileStepRender.
•	No “Expr” and “Expression” both exist; pick one. Use Expr everywhere.
•	Never prefix variants with signal/field/event unless the union itself is that family (and ideally it isn’t).

So the simplest consistent answer is: ValueExprConst (or ValueConstExpr if you prefer the op-first style, but don’t mix them).

ValueExprConst is three pieces:
1.	Value — the domain of the IR node: “this expression evaluates to a value in the unified value-expression universe,” i.e. it’s the family that is typed by CanonicalType and can represent what used to be Sig/Field/Event without encoding those words into the node name.
2.	Expr — the role/kind of artifact: it’s an expression node (as opposed to a compile step, a block def, a kernel, a type, etc.).
3.	Const — the operation variant: this particular expression is a constant/literal.

Why that order

It’s a namespace hierarchy that optimizes for:
•	Grouping: all ValueExpr* live together in autocomplete, grep, file organization, and pattern matches.
•	Stable prefix: ValueExpr is the stable “type family” prefix; Const is the part most likely to grow into many variants.
•	Predictable parsing: Prefix (family) + Role + Variant is mechanical and scales when you add more domains later (ValueExpr, TypeExpr, ShaderExpr, etc.), without renaming variants.

Why not three other concepts

Because the other concepts you’re tempted to put in names (signal/field/event, cardinality/temporality) are supposed to be carried by CanonicalType and enforced by invariants, not duplicated in identifiers, or you’ll eventually have nodes whose names and type.extent disagree.

Why not ConstValueExpr or ValueConstExpr

Those are defensible, but they change what your system “keys on”:
•	ConstValueExpr keys on the variant first, which fragments grouping and makes pattern matches noisy.
•	ValueConstExpr drops the explicit “Expr” role, which tends to cause collisions later when you add ValueConstStep, ValueConstOp, ValueConstType, etc.

So the specific order is “family → role → variant” because it’s the smallest rule that stays consistent as the system grows.