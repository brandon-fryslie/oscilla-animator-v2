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
