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

# Run all checks (typecheck + test + build)
check: typecheck test build
  echo "All checks passed!"

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
