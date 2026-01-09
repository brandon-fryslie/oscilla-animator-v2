# Justfile for Oscilla Animator v2
# Learn more: https://just.systems

# Default recipe - shows help
default:
  @just --list

# Start development server
dev:
  npm run dev

# Run tests
test:
  npm test

# Run tests in watch mode
test-watch:
  npm run test:watch

# Build for production
build:
  npm run build

# Run TypeScript type checking
typecheck:
  npm run typecheck

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
  npm install

# Format code (if prettier is added)
# format:
#   npx prettier --write .

# Lint code (if eslint is added)
# lint:
#   npx eslint . --ext .ts,.tsx
