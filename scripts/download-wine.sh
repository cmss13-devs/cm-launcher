#!/usr/bin/env bash
# Downloads Wine, winetricks, and cabextract for AppImage bundling
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WINE_ARCHIVE="$PROJECT_ROOT/src-tauri/wine.tar.zst"
WINETRICKS_OUTPUT="$PROJECT_ROOT/src-tauri/winetricks"
CABEXTRACT_OUTPUT="$PROJECT_ROOT/src-tauri/cabextract"

WINE_VERSION="${WINE_VERSION:-10.5}"
WINE_URL="https://github.com/Kron4ek/Wine-Builds/releases/download/${WINE_VERSION}/wine-${WINE_VERSION}-amd64.tar.xz"
WINETRICKS_URL="https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks"
CABEXTRACT_VERSION="${CABEXTRACT_VERSION:-1.11}"
CABEXTRACT_URL="https://www.cabextract.org.uk/cabextract-${CABEXTRACT_VERSION}.tar.gz"

echo "Downloading Wine ${WINE_VERSION}..."
temp_file=$(mktemp --suffix=.tar.xz)
temp_extract=$(mktemp -d)
trap "rm -rf $temp_extract $temp_file" EXIT

curl -fL -o "$temp_file" "$WINE_URL"

echo "Recompressing as zstd..."
tar -xf "$temp_file" -C "$temp_extract"

rm -f "$WINE_ARCHIVE"
tar -C "$temp_extract"/wine-*/ -cf - . | zstd -19 -T0 -o "$WINE_ARCHIVE"

echo "Downloading winetricks..."
curl -fL -o "$WINETRICKS_OUTPUT" "$WINETRICKS_URL"
chmod +x "$WINETRICKS_OUTPUT"

echo "Building cabextract ${CABEXTRACT_VERSION}..."
cabextract_temp=$(mktemp -d)
trap "rm -rf $temp_extract $temp_file $cabextract_temp" EXIT
curl -fL "$CABEXTRACT_URL" | tar -xz -C "$cabextract_temp"
pushd "$cabextract_temp/cabextract-${CABEXTRACT_VERSION}" > /dev/null
./configure --quiet
make --quiet
cp cabextract "$CABEXTRACT_OUTPUT"
chmod +x "$CABEXTRACT_OUTPUT"
popd > /dev/null

echo "Done:"
echo "  Wine: $WINE_ARCHIVE ($(du -h "$WINE_ARCHIVE" | cut -f1))"
echo "  Winetricks: $WINETRICKS_OUTPUT"
echo "  Cabextract: $CABEXTRACT_OUTPUT"
