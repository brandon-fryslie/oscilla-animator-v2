#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER_IMAGE="${RUST_WEBGPU_NATIVE_GATES_IMAGE:-rust:1.93-bookworm}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run native WebGPU gates with the CI-equivalent Linux/Lavapipe environment" >&2
  exit 1
fi

docker run --rm \
  -e CI=1 \
  -e WGPU_BACKEND=vulkan \
  -v "$ROOT_DIR:/workspace" \
  -w /workspace \
  "$CONTAINER_IMAGE" \
  bash -lc '
    set -euo pipefail
    apt-get update >/dev/null
    apt-get install -y --no-install-recommends libvulkan1 mesa-vulkan-drivers vulkan-tools >/dev/null
    cargo test --locked --manifest-path native-tests/webgpu-headless/Cargo.toml --features headless -- --nocapture
  '
