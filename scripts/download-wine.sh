#!/usr/bin/env bash
# Downloads Wine and winetricks for AppImage bundling
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WINE_ARCHIVE="$PROJECT_ROOT/src-tauri/wine.tar.zst"
WINETRICKS_OUTPUT="$PROJECT_ROOT/src-tauri/winetricks"

WINE_VERSION="${WINE_VERSION:-10.5}"
WINE_URL="https://github.com/Kron4ek/Wine-Builds/releases/download/${WINE_VERSION}/wine-${WINE_VERSION}-amd64.tar.xz"
WINETRICKS_URL="https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks"

echo "Downloading Wine ${WINE_VERSION}..."
temp_file=$(mktemp --suffix=.tar.xz)
trap "rm -f $temp_file" EXIT

curl -fL -o "$temp_file" "$WINE_URL"

echo "Recompressing as zstd..."
temp_extract=$(mktemp -d)
trap "rm -rf $temp_extract $temp_file" EXIT
tar -xf "$temp_file" -C "$temp_extract"

rm -f "$WINE_ARCHIVE"
tar -C "$temp_extract"/wine-*/ -cf - . | zstd -19 -T0 -o "$WINE_ARCHIVE"

echo "Downloading winetricks..."
curl -fL -o "$WINETRICKS_OUTPUT" "$WINETRICKS_URL"
chmod +x "$WINETRICKS_OUTPUT"

echo "Done: $WINE_ARCHIVE ($(du -h "$WINE_ARCHIVE" | cut -f1))"
