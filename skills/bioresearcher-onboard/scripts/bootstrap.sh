#!/usr/bin/env bash
# Stage 0 Zero-Dependency Bootstrap for bioresearcher-onboard.
# Checks for existing Node >= 22.13; if missing, downloads pinned portable
# Node.js LTS into .bioresearcher-runtime/node, verifies SHA256, and hands off
# execution to onboard.mjs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_ROOT="${BIORESEARCHER_RUNTIME_DIR:-$PWD/.bioresearcher-runtime}"
NODE_DIR="$RUNTIME_ROOT/node"
NODE_BIN="$NODE_DIR/bin/node"

NODE_REQ_MAJ=22
NODE_REQ_MIN=13
NODE_VER="v22.14.0"

# 1. Probe if host already satisfies Node >= 22.13
if command -v node >/dev/null 2>&1; then
  if node -e "var v=process.versions.node.split('.');process.exit((v[0]>$NODE_REQ_MAJ||(v[0]==$NODE_REQ_MAJ&&v[1]>=$NODE_REQ_MIN))?0:1)" 2>/dev/null; then
    echo "[bioresearcher-onboard] Found host $(node -v) at $(command -v node)"
    exec node "$SCRIPT_DIR/onboard.mjs" "$@"
  fi
fi

# If already vendored in working directory, reuse directly
if [ -x "$NODE_BIN" ]; then
  export PATH="$NODE_DIR/bin:$PATH"
  exec "$NODE_BIN" "$SCRIPT_DIR/onboard.mjs" "$@"
fi

echo "[bioresearcher-onboard] Host Node >= 22.13 not found. Bootstrapping portable Node.js $NODE_VER into .bioresearcher-runtime/..."

# 2. OS and Architecture Detection
OS_RAW="$(uname -s)"
case "$OS_RAW" in
  Linux*)  OS="linux" ;;
  Darwin*) OS="darwin" ;;
  *) echo "Error: Unsupported operating system $OS_RAW. Windows users should run bootstrap.ps1." >&2; exit 1 ;;
esac

# Linux C library gate
if [ "$OS" = "linux" ]; then
  if ldd /bin/ls 2>&1 | grep -qi "musl"; then
    echo "Error: Alpine/musl Linux detected. Official Node prebuilts require glibc." >&2
    echo "Please install Node >= 22.13 via your system package manager (e.g. apk add nodejs)." >&2
    exit 1
  fi
fi

ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Error: Unsupported CPU architecture $ARCH_RAW." >&2; exit 1 ;;
esac

# macOS Rosetta detection: probe true hardware arch
if [ "$OS" = "darwin" ]; then
  if [ "$(sysctl -in sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
    ARCH="arm64"
  fi
fi

# 3. Mirror Selection Probe (1.2s timeout)
if curl -s -I --connect-timeout 1.0 --max-time 1.2 "https://nodejs.org/dist/" >/dev/null 2>&1; then
  MIRROR_BASE="https://nodejs.org/dist/${NODE_VER}"
  NPM_REGISTRY="https://registry.npmjs.org"
else
  echo "[bioresearcher-onboard] nodejs.org unreachable or timed out; using npmmirror.com fast mirror"
  MIRROR_BASE="https://npmmirror.com/mirrors/node/${NODE_VER}"
  NPM_REGISTRY="https://registry.npmmirror.com"
fi

FILE="node-${NODE_VER}-${OS}-${ARCH}.tar.gz"
DOWNLOAD_URL="${MIRROR_BASE}/${FILE}"

# Pinned SHA256 checksums from official Node.js SHASUMS256.txt
case "${OS}-${ARCH}" in
  linux-x64)    EXPECTED_SHA="9d942932535988091034dc94cc5f42b6dc8784d6366df3a36c4c9ccb3996f0c2" ;;
  linux-arm64)  EXPECTED_SHA="8cf30ff7250f9463b53c18f89c6c606dfda70378215b2c905d0a9a8b08bd45e0" ;;
  darwin-x64)   EXPECTED_SHA="6698587713ab565a94a360e091df9f6d91c8fadda6d00f0cf6526e9b40bed250" ;;
  darwin-arm64) EXPECTED_SHA="e9404633bc02a5162c5c573b1e2490f5fb44648345d64a958b17e325729a5e42" ;;
  *) echo "Error: Missing checksum for target ${OS}-${ARCH}." >&2; exit 1 ;;
esac

mkdir -p "$RUNTIME_ROOT"
TMP_ARCHIVE="$RUNTIME_ROOT/node.tar.gz"

echo "[bioresearcher-onboard] Downloading $FILE..."
curl -f -s -L --retry 2 -o "$TMP_ARCHIVE" "$DOWNLOAD_URL"

# 4. Checksum verification
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SHA="$(sha256sum "$TMP_ARCHIVE" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_SHA="$(shasum -a 256 "$TMP_ARCHIVE" | awk '{print $1}')"
else
  ACTUAL_SHA=""
fi

if [ -n "$ACTUAL_SHA" ] && [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "Error: SHA256 checksum verification failed for $FILE." >&2
  echo "Expected: $EXPECTED_SHA" >&2
  echo "Actual:   $ACTUAL_SHA" >&2
  rm -f "$TMP_ARCHIVE"
  exit 1
fi

# 5. Extract and prune
mkdir -p "$NODE_DIR"
tar -xzf "$TMP_ARCHIVE" -C "$NODE_DIR" --strip-components=1
rm -f "$TMP_ARCHIVE"

# Remove non-runtime artifacts (saves ~49 MB)
rm -rf "$NODE_DIR/include" "$NODE_DIR/share" "$NODE_DIR"/*.md "$NODE_DIR"/LICENSE

# macOS Gatekeeper quarantine removal
if [ "$OS" = "darwin" ]; then
  xattr -dr com.apple.quarantine "$NODE_DIR" 2>/dev/null || true
fi

echo "[bioresearcher-onboard] Portable Node.js ready: $("$NODE_BIN" -v)"

# 6. Hand off to Stage 1
export PATH="$NODE_DIR/bin:$PATH"
export NPM_CONFIG_REGISTRY="$NPM_REGISTRY"
exec "$NODE_BIN" "$SCRIPT_DIR/onboard.mjs" "$@"
