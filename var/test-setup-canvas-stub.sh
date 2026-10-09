#!/usr/bin/env bash
# Recreates the local canvas stub that shadows the broken native `canvas`
# binary for jsdom (jest-environment-jsdom@29 bundles jsdom@20 which requires
# `canvas` when resolvable; no prebuilt exists for Node 22 arm64).
# Run after every `pnpm install`.
set -euo pipefail
cd "$(dirname "$0")/../.."
STUB_DIR="node_modules/jest-environment-jsdom/node_modules/canvas"
mkdir -p "$STUB_DIR"
cat > "$STUB_DIR/package.json" <<'JSON'
{
  "name": "canvas",
  "version": "0.0.0-local-stub",
  "description": "Local test stub shadowing the broken native canvas binary for jsdom.",
  "main": "index.js"
}
JSON
cat > "$STUB_DIR/index.js" <<'JS'
// Local stub: jsdom (bundled in jest-environment-jsdom@29) requires `canvas`
// when resolvable. Unit tests never render canvas content, so an empty module
// is sufficient. See var/test-setup-canvas-stub.sh.
module.exports = {};
JS
echo "canvas stub recreated at $STUB_DIR"
