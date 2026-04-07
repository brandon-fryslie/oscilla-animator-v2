/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies create hidden coupling and unpredictable blast radius.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Orphans are likely dead code or unfinished integration seams.',
      from: { orphan: true, pathNot: ['^src/main.ts$', '^src/demo/', '^src/blocks/registry.ts$'] },
      to: {},
    },
    // ===== pillar phase isolation =====
    {
      name: 'pillars-block-api-is-leaf',
      severity: 'error',
      comment: 'block-api.ts is a leaf — it defines the public ABI between blocks and the walker. It cannot import from any phase directory.',
      from: { path: '^src/pillars/block-api\\.ts$' },
      to: { path: '^src/pillars/(frontend|lowering|assembly|blocks|block-dsl)/' },
    },
    {
      name: 'pillars-block-dsl-is-leaf',
      severity: 'error',
      comment: 'block-dsl/ is the authoring vocabulary used by block files. It cannot import from any phase directory.',
      from: { path: '^src/pillars/block-dsl/' },
      to: { path: '^src/pillars/(frontend|lowering|assembly|blocks)/' },
    },
    {
      name: 'pillars-blocks-no-phases',
      severity: 'error',
      comment: 'blocks/ cannot import any phase directory. Use type-only imports of LoweringContext etc. from block-api.',
      from: { path: '^src/pillars/blocks/' },
      to: { path: '^src/pillars/(frontend|lowering|assembly)/' },
    },
    {
      name: 'pillars-blocks-no-cross-block-imports',
      severity: 'error',
      comment: 'Block files must not import other block files. Blocks are peers, registered together via ALL_BLOCKS.',
      from: { path: '^src/pillars/blocks/[^/]+\\.ts$', pathNot: '^src/pillars/blocks/index\\.ts$' },
      to: { path: '^src/pillars/blocks/[^/]+\\.ts$', pathNot: '^src/pillars/blocks/index\\.ts$' },
    },
    {
      name: 'pillars-frontend-no-lowering',
      severity: 'error',
      comment: 'frontend/ cannot runtime-import lowering/. The walker is generic; the frontend never reaches into it.',
      from: { path: '^src/pillars/frontend/' },
      to: { path: '^src/pillars/lowering/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'pillars-frontend-no-assembly',
      severity: 'error',
      comment: 'frontend/ has no business reaching into assembly/.',
      from: { path: '^src/pillars/frontend/' },
      to: { path: '^src/pillars/assembly/' },
    },
    {
      name: 'pillars-frontend-no-block-dsl',
      severity: 'error',
      comment: 'frontend/ cannot import block-dsl/ — it is authoring vocabulary for blocks, not for compiler phases.',
      from: { path: '^src/pillars/frontend/' },
      to: { path: '^src/pillars/block-dsl/' },
    },
    {
      name: 'pillars-lowering-no-frontend',
      severity: 'error',
      comment: 'lowering/ may only type-import from frontend/. Runtime imports forbidden — the walker is generic.',
      from: { path: '^src/pillars/lowering/' },
      to: { path: '^src/pillars/frontend/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'pillars-lowering-no-blocks',
      severity: 'error',
      comment: 'lowering/ cannot import blocks/. Opaque NormalizedNode closures are the ONLY thing the walker calls.',
      from: { path: '^src/pillars/lowering/' },
      to: { path: '^src/pillars/blocks/' },
    },
    {
      name: 'pillars-lowering-no-block-dsl',
      severity: 'error',
      comment: 'lowering/ cannot import block-dsl/. The walker has no block-specific knowledge.',
      from: { path: '^src/pillars/lowering/' },
      to: { path: '^src/pillars/block-dsl/' },
    },
    {
      name: 'pillars-assembly-no-blocks',
      severity: 'error',
      comment: 'assembly/ cannot import blocks/ or block-dsl/.',
      from: { path: '^src/pillars/assembly/' },
      to: { path: '^src/pillars/(blocks|block-dsl)/' },
    },
    {
      name: 'no-ui-into-runtime',
      severity: 'error',
      comment: 'Runtime/compiler layers must not depend on UI code.',
      from: { path: '^src/(runtime|compiler|render|services)/' },
      to: { path: '^src/ui/' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    doNotFollow: {
      path: 'node_modules',
    },
    includeOnly: '^src',
    exclude: {
      path: ['\\.test\\.ts$', '__tests__', '\\.(d)\\.ts$'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+',
      },
    },
  },
};
