#!/usr/bin/env bash
# Download pre-built portable Wine for bundling in AppImage
#
# Uses Kron4ek's Wine builds: https://github.com/Kron4ek/Wine-Builds
# These are portable, self-contained Wine builds that work on most Linux distros.
#
# Usage:
#   ./scripts/download-wine.sh           # Download default version
#   WINE_VERSION=10.0 ./scripts/download-wine.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/src-tauri/wine"
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

    log_info "Extracting Wine..."
    rm -rf "$OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"

    # Extract and move contents (archive contains wine-VERSION-amd64/ folder)
    local temp_extract
    temp_extract=$(mktemp -d)
    tar -xf "$temp_file" -C "$temp_extract"

    # Move contents from the extracted folder to output dir
    mv "$temp_extract"/wine-*/* "$OUTPUT_DIR/"
    rm -rf "$temp_extract"

    log_info "Wine extracted to: $OUTPUT_DIR"
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

verify_wine() {
    log_info "Verifying Wine installation..."

    local wine_bin="$OUTPUT_DIR/bin/wine64"
    if [[ ! -x "$wine_bin" ]]; then
        log_error "Wine binary not found at $wine_bin"
        exit 1
    fi

    # Check for required directories
    for dir in bin lib lib64; do
        if [[ ! -d "$OUTPUT_DIR/$dir" ]]; then
            log_warn "Expected directory not found: $OUTPUT_DIR/$dir"
        fi
    done

    # Get version
    local version
    version=$("$wine_bin" --version 2>/dev/null || echo "unknown")
    log_info "Wine version: $version"

    # Show size
    local size
    size=$(du -sh "$OUTPUT_DIR" | cut -f1)
    log_info "Total Wine size: $size"
}

clean() {
    log_info "Cleaning Wine and winetricks..."
    rm -rf "$OUTPUT_DIR"
    rm -f "$WINETRICKS_OUTPUT"
    log_info "Clean complete"
}

usage() {
    cat << EOF
Usage: $0 [command]

Commands:
    download    Download Wine and winetricks (default)
    clean       Remove downloaded Wine and winetricks
    verify      Verify existing Wine installation
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
            verify_wine

            log_info ""
            log_info "Download complete!"
            log_info "Wine: $OUTPUT_DIR"
            log_info "Winetricks: $WINETRICKS_OUTPUT"
            ;;
        clean)
            clean
            ;;
        verify)
            verify_wine
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
