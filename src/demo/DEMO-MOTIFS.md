# Demo Motifs

## Why `Debug Lens Coverage` Works

`Debug Lens Coverage` is strong because it stacks several constrained motions instead of relying on one dramatic gesture.

- It uses a stable spatial scaffold: the spiral is always legible even while parameters move.
- It animates multiple channels with different time scales: turns, saturation, scale, hue, and alpha all move, but not in lockstep.
- The lens chain keeps motion textured without becoming mushy: clamp, quantize, wrap, and smoothstep make the output feel deliberate.
- It mixes one-cardinality and many-cardinality data in visible ways: broad global changes ride on top of per-lane lightness and per-lane noise.

`// [LAW:dataflow-not-control-flow] The patch feels rich because the same render path is always active; variation comes from layered data transforms rather than branches or mode flips.`

## Why `Diagnostic - Expression Block Refs` Works

`Diagnostic - Expression Block Refs` is subtle, but it has a very clear visual idea.

- It starts from a simple, readable scaffold: a circle.
- The Expression offsets are small relative perturbations around that scaffold.
- Lane-dependent branching creates mirrored behavior, so the eye can detect structure instead of random noise.
- Scale motion supports the position motion instead of competing with it.

The result is a patch that still proves block-reference and swizzle behavior while reading as intentional composition.

## Why `Aurora Petal Showcase` Works

`Aurora Petal Showcase` is strong for a different reason: it feels composed, not just animated.

- It has a clear depth stack: a dense background field plus a crisp foreground frame.
- The background lattice is not merely moving; it is being folded and breathed, so the scene feels atmospheric instead of mechanical.
- The foreground petal ring gives the eye a stable silhouette to hold onto while the background does stranger things.
- The density split matters: many tiny field points create glow and texture, while fewer larger petals create shape language and hierarchy.
- Hue, scale, and position are all animated, but each layer has a different job. The lattice sells drift; the petals sell structure.

`// [LAW:dataflow-not-control-flow] The patch stays magical because both layers are always present; the feeling of emergence comes from continuously transformed data, not conditional reveal logic.`

## Reusable Rules

- Keep a scaffold layer visible. If the viewer cannot perceive the baseline structure, the motion reads as noise.
- Prefer several constrained channels over one unconstrained channel.
- Use mirrored or lane-partitioned behavior when you want subtle structure to read immediately.
- Quantization and clamping can improve aesthetics when they create rhythm, not just when they enforce correctness.
- When a patch is meant to explain a dynamic system, include a reference layer so the viewer can compare “raw” and “modulated”.
- Split dense atmosphere from crisp structure. One layer should create texture; another should define the silhouette.
- Give each layer a distinct role. If every layer is trying to do the same job, the patch reads muddy or arbitrary.

## Applied In This Pass

`Field Variation Showcase` now applies these motifs directly:

- A faint guide spiral keeps the baseline structure readable while the brighter spiral carries the feature demo.
- Turns, hue, and jitter move on separate channels, so the patch feels active without collapsing into noise.
- The scale jitter is strong enough to read as variation instead of imperceptible drift.

## Weak-Patch Triage

Based on the current patches:

- `Attractor Bloom` has plenty of machinery, but not enough compositional payoff. It needs a stronger silhouette or it should be cut in favor of a better attractor demo.
- `Neon Grid` has a clean base idea, but it lacks hierarchy and atmosphere. It needs an actual neon look, not just colored tiles.
- `Judder Hot-Swap Test` proves a useful runtime contract, but the current spiral is visually disposable. It should become an obviously alive stress scene so continuity failures are easier to notice.

## `Diagnostic Field Variation` Exists For A Specific Gap

`Diagnostic Field Variation` is not just another pretty variation demo. Its distinct purpose is:

- proving `FloatRangeField` can generate many-lane data without Expression involvement
- proving `NoisyBroadcast` can map one-cardinality modulation to many-cardinality output deterministically
- isolating field variation behavior on a regular grid, where layout complexity does not hide cardinality mistakes

That is a different contract from `Field Variation Showcase`, which should optimize for visual clarity and live-demo appeal.
