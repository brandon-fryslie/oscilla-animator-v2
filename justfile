# Justfile for Oscilla Animator v2
# Learn more: https://just.systems

# Default recipe - shows help
default:
  @just --list

# Start development server
dev:
  pnpm run dev

# Run tests
test:
  pnpm test

# Run tests in watch mode
test-watch:
  pnpm run test:watch

# Build for production
build:
  pnpm run build

# Run TypeScript type checking
typecheck:
  pnpm run typecheck

# Compute canonical WebGPU migration readiness verdict
readiness:
  pnpm run test:migration-readiness

# Run all checks (typecheck + test + build)
check: typecheck test readiness build
  echo "All checks passed!"

# Run complexity analysis toolchain
complexity:
  pnpm -s complexity:all

alias complex := complexity

# Compare complexity delta.
# Defaults:
# - base = @{upstream}
# - head = current branch
complexity-delta base='' head='':
  @base_ref="{{base}}"; \
  if [ -z "$base_ref" ]; then \
    base_ref="$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null)" || true; \
    if [ -z "$base_ref" ]; then \
      echo "No upstream configured for current branch. Pass base explicitly: just delta-between <base> <head>" >&2; \
      exit 1; \
    fi; \
  fi; \
  head_ref="{{head}}"; \
  if [ -z "$head_ref" ]; then \
    head_ref="$(git branch --show-current)"; \
    if [ -z "$head_ref" ]; then \
      echo "Unable to resolve current branch. Pass head explicitly: just delta-between <base> <head>" >&2; \
      exit 1; \
    fi; \
  fi; \
  pnpm -s complexity:delta -- --base "$base_ref" --head "$head_ref"

# Compare complexity deltas between explicit refs
complexity-delta-between base head:
  pnpm -s complexity:delta -- --base {{base}} --head {{head}}

alias delta := complexity-delta
alias complex-delta := complexity-delta
alias delta-between := complexity-delta-between

# Clean build artifacts
clean:
  rm -rf dist
  rm -rf node_modules/.vite
  echo "Cleaned build artifacts"

# Install dependencies
install:
  pnpm install

# Format code (if prettier is added)
# format:
#   npx prettier --write .

# Lint code (if eslint is added)
# lint:
#   npx eslint . --ext .ts,.tsx
