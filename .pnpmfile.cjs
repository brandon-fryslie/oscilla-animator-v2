// pnpm hook file.
// See: https://pnpm.io/pnpmfile
//
// [LAW:one-source-of-truth] Build-script approvals are configured in
// pnpm-workspace.yaml via onlyBuiltDependencies, not duplicated here.

function readPackage(pkg, context) {
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
