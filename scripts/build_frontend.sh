#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT_DIR/output/loveable"
DIST_DIR="$ROOT_DIR/dist/loveable"

echo "Building loveable frontend"
echo "SRC: $SRC_DIR"
echo "DIST: $DIST_DIR"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "Copying static files..."
cp -r "$SRC_DIR/index.html" "$DIST_DIR/"
cp -r "$SRC_DIR/styles.css" "$DIST_DIR/"

# Minify JS if possible via esbuild (fast) or terser (fallback). If neither available, copy as-is.
if command -v npx >/dev/null 2>&1; then
  echo "Minifying app.js with esbuild (via npx)…"
  if npx --no-install esbuild --version >/dev/null 2>&1; then
    npx esbuild "$SRC_DIR/app.js" --minify --bundle --outfile="$DIST_DIR/app.js"
  else
    echo "esbuild not installed locally. Attempting to install and run (npx will download a temporary binary)..."
    npx esbuild "$SRC_DIR/app.js" --minify --bundle --outfile="$DIST_DIR/app.js"
  fi
elif command -v terser >/dev/null 2>&1; then
  echo "Minifying app.js with terser…"
  terser "$SRC_DIR/app.js" -c -m -o "$DIST_DIR/app.js"
else
  echo "No JS minifier found (npx/terser). Copying app.js without minification. For smaller bundles install 'esbuild' or 'terser'."
  cp "$SRC_DIR/app.js" "$DIST_DIR/app.js"
fi

echo "Copy complete. Files in $DIST_DIR:"
ls -la "$DIST_DIR"

if [ "${1-}" = "--docker" ]; then
  echo "Building Docker image 'loveable-frontend:latest' from $DIST_DIR"
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker not found in PATH. Install Docker to build the image." >&2
    exit 1
  fi
  # Use the provided Dockerfile in the source directory; build context is the dist dir
  cp "$SRC_DIR/Dockerfile" "$DIST_DIR/Dockerfile"
  docker build -t loveable-frontend:latest "$DIST_DIR"
  echo "Docker image built: loveable-frontend:latest"
fi

echo "Build finished. Serve with: python3 -m http.server 8080 (from $DIST_DIR) or include in docker-compose." 
