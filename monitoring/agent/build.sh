#!/usr/bin/env bash
set -e

AGENT_VERSION="1.0.0"
BUILD_DIR="./dist"
ENTRY_POINT="src/agent.ts"
BINARY_NAME="webagent"

echo "🛠 Building Web Agent v$AGENT_VERSION..."

# Clean previous build
rm -rf $BUILD_DIR
mkdir -p $BUILD_DIR

# Compile TypeScript → JS using Bun
bun run tsc --outdir $BUILD_DIR

# Bundle all JS → single executable
bun compile $BUILD_DIR/agent.js --output $BINARY_NAME --target linux-x64 --release

# Move binary to dist/
mv $BINARY_NAME $BUILD_DIR/

echo "✅ Build completed. Binary located at $BUILD_DIR/$BINARY_NAME"
