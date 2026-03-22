export const DEMO_GROUP_ORDER = ['examples', 'features', 'showcase', 'integration', 'stress'] as const;

export type DemoGroup = typeof DEMO_GROUP_ORDER[number];

export type DemoPurpose = 'example' | 'feature' | 'integration' | 'showcase';
export type DemoAvailability = 'active' | 'disabled';

export interface DemoCatalogEntry {
  readonly filename: string;
  readonly relativePath: string;
  readonly group: DemoGroup;
  readonly availability?: DemoAvailability;
  readonly availabilityReason?: string;
  readonly featuredRank?: number;
  readonly summary: string;
  readonly purposes: readonly DemoPurpose[];
  readonly highlights: readonly string[];
}

export const DEMO_GROUP_LABELS: Record<DemoGroup, string> = {
  examples: 'Examples',
  features: 'Feature Tours',
  showcase: 'Showcase',
  integration: 'Integration Checks',
  stress: 'Stress Tests',
};

export const GPU_BOOTSTRAP_DEMO_FILENAME = 'gpu-bootstrap-triangle.hcl';

export const hclDemoCatalog: readonly DemoCatalogEntry[] = [
  {
    filename: 'simple.hcl',
    relativePath: 'examples/simple.hcl',
    group: 'examples',
    summary: 'Smallest polished patch that still reads as a living scene.',
    purposes: ['example'],
    highlights: ['starter', 'circle layout', 'rainbow motion'],
  },
  {
    filename: 'tile-grid.hcl',
    relativePath: 'examples/tile-grid.hcl',
    group: 'examples',
    summary: 'Readable grid starter with shape wobble and per-instance variation.',
    purposes: ['example', 'feature'],
    highlights: ['grid layout', 'rects', 'variation'],
  },
  {
    filename: 'expression-field-ops.hcl',
    relativePath: 'examples/expression-field-ops.hcl',
    group: 'examples',
    summary: 'Clean first stop for field-mapped Expression authoring.',
    purposes: ['example', 'feature', 'integration'],
    highlights: ['expression', 'mapField', 'field math'],
  },
  {
    filename: 'orbit.hcl',
    relativePath: 'examples/orbit.hcl',
    group: 'examples',
    summary: 'From-scratch trigonometric motion built without pre-baked layouts.',
    purposes: ['example', 'feature'],
    highlights: ['sin/cos', 'construct', 'manual orbit math'],
  },
  {
    filename: 'attractor-layout-showcase.hcl',
    relativePath: 'features/attractor-layout-showcase.hcl',
    group: 'features',
    summary: 'Focused attractor demo that makes deformation behavior easy to read.',
    purposes: ['feature', 'integration'],
    highlights: ['attractor layout', 'comparison view'],
  },
  {
    filename: 'expression-operator-showcase.hcl',
    relativePath: 'features/expression-operator-showcase.hcl',
    group: 'features',
    featuredRank: 1,
    summary: 'Canonical Expression showcase for branching, swizzles, and field waves.',
    purposes: ['feature', 'integration', 'showcase'],
    highlights: ['expression', 'ternary', 'vec constructors'],
  },
  {
    filename: 'expression-vec3-orbit.hcl',
    relativePath: 'features/expression-vec3-orbit.hcl',
    group: 'features',
    summary: 'Expression-driven orbit that emits vec3 positions directly.',
    purposes: ['feature', 'showcase'],
    highlights: ['vec3 output', 'expression', 'orbit'],
  },
  {
    filename: 'feedback-accumulator.hcl',
    relativePath: 'features/feedback-accumulator.hcl',
    group: 'features',
    summary: 'Feedback loop with eased acceleration for visibly nontrivial motion.',
    purposes: ['feature', 'integration', 'showcase'],
    highlights: ['feedback', 'smoothstep', 'unit delay'],
  },
  {
    filename: 'feedback-rotation.hcl',
    relativePath: 'features/feedback-rotation.hcl',
    group: 'features',
    featuredRank: 2,
    summary: 'Feedback-driven rotation whose scale responds to speed.',
    purposes: ['feature', 'integration', 'showcase'],
    highlights: ['feedback', 'unit delay', 'scale response'],
  },
  {
    filename: 'field-variation-showcase.hcl',
    relativePath: 'features/field-variation-showcase.hcl',
    group: 'features',
    summary: 'Animated field-variation scene with a scaffold layer and intentionally visible jitter.',
    purposes: ['feature', 'integration'],
    highlights: ['float range field', 'noisy broadcast', 'variation'],
  },
  {
    filename: 'mouse-spiral.hcl',
    relativePath: 'features/mouse-spiral.hcl',
    group: 'features',
    summary: 'Interactive input demo with silky lag smoothing and click response.',
    purposes: ['feature', 'showcase'],
    highlights: ['mouse input', 'lag', 'interaction'],
  },
  {
    filename: 'path-field-demo.hcl',
    relativePath: 'features/path-field-demo.hcl',
    group: 'features',
    summary: 'Path derivatives used as live modulation data on an animated star path.',
    purposes: ['feature', 'integration', 'showcase'],
    highlights: ['path field', 'reduce', 'procedural star'],
  },
  {
    filename: 'path-flow.hcl',
    relativePath: 'features/path-flow.hcl',
    group: 'features',
    summary: 'PathLayout sampling turned into a centered flowing path necklace.',
    purposes: ['feature', 'showcase'],
    highlights: ['path layout', 'expression recenter', 'procedural polygon'],
  },
  {
    filename: 'perspective-camera.hcl',
    relativePath: 'features/perspective-camera.hcl',
    group: 'features',
    availability: 'disabled',
    availabilityReason: 'Temporarily disabled while the GPU renderer lacks perspective-camera support.',
    summary: 'Best single patch for the current perspective camera authoring surface.',
    purposes: ['feature', 'integration', 'showcase'],
    highlights: ['camera', '3D', 'slew'],
  },
  {
    filename: 'rect-mosaic.hcl',
    relativePath: 'features/rect-mosaic.hcl',
    group: 'features',
    summary: 'Rect-based mosaic that shows shape reuse outside grid layouts.',
    purposes: ['feature', 'showcase'],
    highlights: ['rects', 'circle layout', 'variation'],
  },
  {
    filename: 'smooth-chase.hcl',
    relativePath: 'features/smooth-chase.hcl',
    group: 'features',
    summary: 'Minimal but legible before/after smoothing comparison.',
    purposes: ['feature', 'integration'],
    highlights: ['lag', 'comparison', 'dual render'],
  },
  {
    filename: 'spiral-garden.hcl',
    relativePath: 'features/spiral-garden.hcl',
    group: 'features',
    summary: 'Procedural polygon spiral with a stronger authored-shape feel than dot swarms.',
    purposes: ['feature', 'showcase'],
    highlights: ['procedural polygon', 'spiral layout', 'shape animation'],
  },
  {
    filename: 'adapter-obligation-name-demo.hcl',
    relativePath: 'integration/adapter-obligation-name-demo.hcl',
    group: 'integration',
    summary: 'Intentional compile failure for adapter-obligation naming coverage.',
    purposes: ['integration'],
    highlights: ['expected compile error', 'adapter diagnostics'],
  },
  {
    filename: 'debug-lens-coverage.hcl',
    relativePath: 'integration/debug-lens-coverage.hcl',
    group: 'integration',
    featuredRank: 3,
    summary: 'Dense lens attachment patch covering payload variety and cardinality mixes.',
    purposes: ['integration'],
    highlights: ['debug lens', 'cardinality', 'payload coverage'],
  },
  {
    filename: 'diagnostic-expression-block-refs.hcl',
    relativePath: 'integration/diagnostic-expression-block-refs.hcl',
    group: 'integration',
    summary: 'Regression patch for Expression block refs and swizzle reads.',
    purposes: ['integration'],
    highlights: ['expression refs', 'swizzles', 'branching'],
  },
  {
    filename: 'diagnostic-field-variation.hcl',
    relativePath: 'integration/diagnostic-field-variation.hcl',
    group: 'integration',
    summary: 'Regression patch isolating FloatRangeField and NoisyBroadcast without Expression or layout complexity.',
    purposes: ['integration'],
    highlights: ['float range field', 'noisy broadcast', 'diagnostics'],
  },
  {
    filename: 'error-isolation-demo.hcl',
    relativePath: 'integration/error-isolation-demo.hcl',
    group: 'integration',
    summary: 'Proves broken detached subgraphs do not block healthy render paths.',
    purposes: ['integration'],
    highlights: ['error isolation', 'partial compile'],
  },
  {
    filename: 'gpu-bootstrap-triangle.hcl',
    relativePath: 'integration/gpu-bootstrap-triangle.hcl',
    group: 'integration',
    summary: 'Canonical minimal Type 1 WebGPU bootstrap path.',
    purposes: ['feature', 'integration'],
    highlights: ['gpu bootstrap', 'type 1 sink'],
  },
  {
    filename: 'judder-hot-swap-test.hcl',
    relativePath: 'integration/judder-hot-swap-test.hcl',
    group: 'integration',
    summary: 'Continuity-focused patch for live edit hot-swap regressions.',
    purposes: ['integration'],
    highlights: ['continuity', 'hot swap', 'judder'],
  },
  {
    filename: 'aurora-petal-showcase.hcl',
    relativePath: 'showcase/aurora-petal-showcase.hcl',
    group: 'showcase',
    featuredRank: 5,
    summary: 'Readable two-layer composition with a strong visual identity.',
    purposes: ['showcase', 'feature'],
    highlights: ['expression field', 'petal ring', 'color drift'],
  },
  {
    filename: 'breathing-ring.hcl',
    relativePath: 'showcase/breathing-ring.hcl',
    group: 'showcase',
    summary: 'Compact pulse demo that still feels alive and saturated.',
    purposes: ['example', 'showcase'],
    highlights: ['ring', 'pulse', 'variation'],
  },
  {
    filename: 'library-kitchen-sink.hcl',
    relativePath: 'showcase/library-kitchen-sink.hcl',
    group: 'showcase',
    featuredRank: 4,
    summary: 'Flagship multi-branch composition for selling the overall renderer.',
    purposes: ['showcase', 'feature'],
    highlights: ['multi layer', 'path layout', 'spiral'],
  },
  {
    filename: 'neon-grid.hcl',
    relativePath: 'showcase/neon-grid.hcl',
    group: 'showcase',
    summary: 'Scaffold-plus-glow neon wall with stepped pulse changes and field warping.',
    purposes: ['showcase', 'feature'],
    highlights: ['step quantize', 'dual glow', 'grid warp'],
  },
  {
    filename: 'gpu-100k-swarm-stress.hcl',
    relativePath: 'stress/gpu-100k-swarm-stress.hcl',
    group: 'stress',
    summary: 'Ceiling-pushing swarm scene that doubles as a stress harness.',
    purposes: ['integration', 'showcase'],
    highlights: ['100k instances', 'gpu stress', 'expression field'],
  },
] as const;
