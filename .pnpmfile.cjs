// pnpm hook to pre-approve prebuild scripts
// See: https://pnpm.io/pnpmfile
//
// This file works in conjunction with .npmrc to allow specific packages
// to run their build scripts without prompting during install.

function readPackage(pkg, context) {
  // Additional hook processing if needed
  // Most configuration is handled via .npmrc allow-build-scripts setting
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
