#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/src/services/wasm/rust/oscilla-debug-probe"
PKG_DIR="$ROOT_DIR/src/services/wasm/pkg"
TARGET_DIR="$CRATE_DIR/target"

if ! command -v wasm-bindgen >/dev/null 2>&1; then
  echo "wasm-bindgen CLI is required. Install with: cargo install wasm-bindgen-cli --locked" >&2
  exit 1
fi

if command -v rustup >/dev/null 2>&1; then
  ACTIVE_TOOLCHAIN="$(rustup show active-toolchain | awk '{print $1}')"
  TOOLCHAIN_BIN="${HOME}/.rustup/toolchains/${ACTIVE_TOOLCHAIN}/bin"
  rustup target add wasm32-unknown-unknown --toolchain "$ACTIVE_TOOLCHAIN" >/dev/null
  if [ -x "${TOOLCHAIN_BIN}/cargo" ]; then
    RUSTC="${TOOLCHAIN_BIN}/rustc" "${TOOLCHAIN_BIN}/cargo" build --manifest-path "$CRATE_DIR/Cargo.toml" --target wasm32-unknown-unknown --release
  else
    cargo build --manifest-path "$CRATE_DIR/Cargo.toml" --target wasm32-unknown-unknown --release
  fi
else
  cargo build --manifest-path "$CRATE_DIR/Cargo.toml" --target wasm32-unknown-unknown --release
fi

mkdir -p "$PKG_DIR"
wasm-bindgen \
  "$TARGET_DIR/wasm32-unknown-unknown/release/oscilla_debug_probe.wasm" \
  --target web \
  --out-dir "$PKG_DIR"

echo "Built Rust/WASM debug probe module into $PKG_DIR"
