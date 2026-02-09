#!/usr/bin/env bash
# Download pre-built portable Wine and package as archive for AppImage bundling
#
# Uses Kron4ek's Wine builds: https://github.com/Kron4ek/Wine-Builds
# These are portable, self-contained Wine builds that work on most Linux distros.
#
# The Wine directory is compressed as a tar.zst archive to:
# 1. Avoid linuxdeploy scanning Wine binaries for dependencies
# 2. Reduce AppImage size (~500MB -> ~120MB)
#
# At runtime, the archive is extracted to the app data directory on first use.
#
# Usage:
#   ./scripts/download-wine.sh           # Download default version
#   WINE_VERSION=10.0 ./scripts/download-wine.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WINE_ARCHIVE="$PROJECT_ROOT/src-tauri/wine.tar.zst"
WINETRICKS_OUTPUT="$PROJECT_ROOT/src-tauri/winetricks"

# Wine version (check https://github.com/Kron4ek/Wine-Builds/releases for available versions)
WINE_VERSION="${WINE_VERSION:-10.0}"

# Kron4ek Wine builds - vanilla Wine, amd64
WINE_DOWNLOAD_URL="https://github.com/Kron4ek/Wine-Builds/releases/download/${WINE_VERSION}/wine-${WINE_VERSION}-amd64.tar.xz"

# Winetricks
WINETRICKS_URL="https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

download_wine() {
    log_info "Downloading Wine ${WINE_VERSION} from Kron4ek builds..."

    local temp_file
    temp_file=$(mktemp --suffix=.tar.xz)
    trap "rm -f $temp_file" RETURN

    if ! curl -fL -o "$temp_file" "$WINE_DOWNLOAD_URL"; then
        log_error "Failed to download Wine from $WINE_DOWNLOAD_URL"
        log_error "Check available versions at: https://github.com/Kron4ek/Wine-Builds/releases"
        exit 1
    fi

    # Verify download
    if ! xz -t "$temp_file" 2>/dev/null; then
        log_error "Downloaded file is not a valid xz archive"
        exit 1
    fi

    log_info "Recompressing Wine as zstd archive..."

    # Extract to temp dir, then recompress with zstd
    local temp_extract
    temp_extract=$(mktemp -d)
    tar -xf "$temp_file" -C "$temp_extract"

    # Create zstd archive (contents directly, not nested in wine-VERSION-amd64/)
    # Use compression level 19 for best ratio
    rm -f "$WINE_ARCHIVE"
    tar -C "$temp_extract"/wine-*/ -cf - . | zstd -19 -T0 -o "$WINE_ARCHIVE"

    rm -rf "$temp_extract"

    local size
    size=$(du -h "$WINE_ARCHIVE" | cut -f1)
    log_info "Wine archive created: $WINE_ARCHIVE ($size)"
}

download_winetricks() {
    log_info "Downloading winetricks..."

    if ! curl -fL -o "$WINETRICKS_OUTPUT" "$WINETRICKS_URL"; then
        log_error "Failed to download winetricks"
        exit 1
    fi

    chmod +x "$WINETRICKS_OUTPUT"
    log_info "Winetricks downloaded to: $WINETRICKS_OUTPUT"
}

verify_archive() {
    log_info "Verifying Wine archive..."

    if [[ ! -f "$WINE_ARCHIVE" ]]; then
        log_error "Wine archive not found at $WINE_ARCHIVE"
        exit 1
    fi

    # Test archive integrity
    if ! zstd -t "$WINE_ARCHIVE" 2>/dev/null; then
        log_error "Wine archive is corrupted"
        exit 1
    fi

    # List contents to verify structure
    local has_wine64
    has_wine64=$(tar -tf "$WINE_ARCHIVE" --zstd 2>/dev/null | grep -c "bin/wine64" || true)
    if [[ "$has_wine64" -eq 0 ]]; then
        log_error "Wine archive doesn't contain bin/wine64"
        exit 1
    fi

    local size
    size=$(du -h "$WINE_ARCHIVE" | cut -f1)
    log_info "Wine archive verified: $size"
}

clean() {
    log_info "Cleaning Wine archive and winetricks..."
    rm -f "$WINE_ARCHIVE"
    rm -f "$WINETRICKS_OUTPUT"
    log_info "Clean complete"
}

usage() {
    cat << EOF
Usage: $0 [command]

Commands:
    download    Download Wine and winetricks (default)
    clean       Remove Wine archive and winetricks
    verify      Verify existing Wine archive
    help        Show this help

Environment Variables:
    WINE_VERSION    Wine version to download (default: 10.0)
                    Check https://github.com/Kron4ek/Wine-Builds/releases for versions

Examples:
    $0                          # Download Wine with defaults
    WINE_VERSION=9.22 $0        # Download Wine 9.22
    $0 clean                    # Remove downloaded files
EOF
}

main() {
    local command="${1:-download}"

    case "$command" in
        download)
            download_wine
            download_winetricks
            verify_archive

            log_info ""
            log_info "Download complete!"
            log_info "Wine archive: $WINE_ARCHIVE"
            log_info "Winetricks: $WINETRICKS_OUTPUT"
            ;;
        clean)
            clean
            ;;
        verify)
            verify_archive
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
