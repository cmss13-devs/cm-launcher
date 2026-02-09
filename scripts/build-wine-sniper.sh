#!/usr/bin/env bash
# Build Wine inside the Steam Runtime 3 'sniper' SDK container
# This ensures library compatibility when running inside Steam's pressure-vessel container
#
# IMPORTANT: This script must run on x86_64 Linux (e.g., GitHub Actions ubuntu-latest)
# It cannot run on macOS or ARM systems - Wine must be built for the target platform.
#
# Usage in CI:
#   - name: Build Wine for Steam Runtime
#     if: matrix.platform == 'ubuntu-latest'
#     run: ./scripts/build-wine-sniper.sh

set -euo pipefail

# Check platform
if [[ "$(uname -s)" != "Linux" ]]; then
    echo "ERROR: This script must run on Linux (for CI builds)."
    echo "Wine is built in CI and bundled with Linux releases only."
    exit 1
fi

if [[ "$(uname -m)" != "x86_64" ]]; then
    echo "ERROR: This script requires x86_64 architecture."
    echo "The Steam Runtime sniper SDK is x86_64 only."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/src-tauri/wine"
WINETRICKS_OUTPUT="$PROJECT_ROOT/src-tauri/winetricks"

# Wine version to build
WINE_VERSION="${WINE_VERSION:-10.0}"
WINE_SOURCE_URL="https://dl.winehq.org/wine/source/10.x/wine-${WINE_VERSION}.tar.xz"

# Container settings
CONTAINER_IMAGE="registry.gitlab.steamos.cloud/steamrt/sniper/sdk"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-podman}"

# Winetricks
WINETRICKS_URL="https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_container_runtime() {
    if command -v "$CONTAINER_RUNTIME" &> /dev/null; then
        log_info "Using container runtime: $CONTAINER_RUNTIME"
        return 0
    fi

    # Try alternatives
    for runtime in podman docker; do
        if command -v "$runtime" &> /dev/null; then
            CONTAINER_RUNTIME="$runtime"
            log_info "Using container runtime: $CONTAINER_RUNTIME"
            return 0
        fi
    done

    log_error "No container runtime found. Please install podman or docker."
    exit 1
}

pull_sdk_image() {
    log_info "Pulling Steam Runtime sniper SDK image..."
    $CONTAINER_RUNTIME pull "$CONTAINER_IMAGE"
}

download_wine_source() {
    local work_dir="$1"
    log_info "Downloading Wine ${WINE_VERSION} source..."

    if [[ -f "$work_dir/wine-${WINE_VERSION}.tar.xz" ]]; then
        log_info "Wine source already downloaded"
        return 0
    fi

    curl -L -o "$work_dir/wine-${WINE_VERSION}.tar.xz" "$WINE_SOURCE_URL"
}

download_winetricks() {
    log_info "Downloading winetricks..."
    curl -L -o "$WINETRICKS_OUTPUT" "$WINETRICKS_URL"
    chmod +x "$WINETRICKS_OUTPUT"
    log_info "Winetricks downloaded to: $WINETRICKS_OUTPUT"
}

build_wine() {
    local work_dir="$1"

    log_info "Building Wine inside sniper SDK container..."
    log_info "This may take 30-60 minutes depending on your system..."

    # Create output directory
    mkdir -p "$OUTPUT_DIR"

    # Create build script that runs inside the container
    cat > "$work_dir/build-inside-container.sh" << 'BUILDSCRIPT'
#!/bin/bash
set -euo pipefail

WINE_VERSION="$1"
BUILD_DIR="/build"
INSTALL_PREFIX="/output"

cd "$BUILD_DIR"

# Extract source
echo "[CONTAINER] Extracting Wine source..."
tar -xf "wine-${WINE_VERSION}.tar.xz"
cd "wine-${WINE_VERSION}"

# Install additional build dependencies that might be missing
echo "[CONTAINER] Installing additional build dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
    libfreetype6-dev:amd64 libfreetype6-dev:i386 \
    libfontconfig1-dev:amd64 libfontconfig1-dev:i386 \
    libgnutls28-dev:amd64 libgnutls28-dev:i386 \
    libpng-dev:amd64 libpng-dev:i386 \
    libjpeg-dev:amd64 libjpeg-dev:i386 \
    libx11-dev:amd64 libx11-dev:i386 \
    libxext-dev:amd64 libxext-dev:i386 \
    libxrender-dev:amd64 libxrender-dev:i386 \
    libxcursor-dev:amd64 libxcursor-dev:i386 \
    libxi-dev:amd64 libxi-dev:i386 \
    libxrandr-dev:amd64 libxrandr-dev:i386 \
    libxfixes-dev:amd64 libxfixes-dev:i386 \
    libxcomposite-dev:amd64 libxcomposite-dev:i386 \
    libgl1-mesa-dev:amd64 libgl1-mesa-dev:i386 \
    libglu1-mesa-dev:amd64 libglu1-mesa-dev:i386 \
    libosmesa6-dev:amd64 libosmesa6-dev:i386 \
    libpulse-dev:amd64 libpulse-dev:i386 \
    libudev-dev:amd64 libudev-dev:i386 \
    libdbus-1-dev:amd64 libdbus-1-dev:i386 \
    libgstreamer1.0-dev:amd64 libgstreamer1.0-dev:i386 \
    libgstreamer-plugins-base1.0-dev:amd64 libgstreamer-plugins-base1.0-dev:i386 \
    libsdl2-dev:amd64 libsdl2-dev:i386 \
    libvulkan-dev:amd64 libvulkan-dev:i386 \
    libcups2-dev:amd64 libcups2-dev:i386 \
    libv4l-dev:amd64 libv4l-dev:i386 \
    gettext \
    flex \
    bison \
    2>/dev/null || true

# Create build directories
mkdir -p build64 build32

# Configure and build 64-bit Wine
echo "[CONTAINER] Configuring Wine64..."
cd build64
../configure \
    --prefix="$INSTALL_PREFIX" \
    --enable-win64 \
    --disable-tests \
    --without-oss \
    --without-mingw

echo "[CONTAINER] Building Wine64..."
make -j$(nproc)

# Configure and build 32-bit Wine (WoW64)
echo "[CONTAINER] Configuring Wine32..."
cd ../build32
../configure \
    --prefix="$INSTALL_PREFIX" \
    --with-wine64=../build64 \
    --disable-tests \
    --without-oss \
    --without-mingw

echo "[CONTAINER] Building Wine32..."
make -j$(nproc)

# Install both
echo "[CONTAINER] Installing Wine..."
cd ../build32
make install
cd ../build64
make install

echo "[CONTAINER] Wine build complete!"
BUILDSCRIPT

    chmod +x "$work_dir/build-inside-container.sh"

    # Run the build inside the container
    $CONTAINER_RUNTIME run --rm \
        -v "$work_dir:/build:Z" \
        -v "$OUTPUT_DIR:/output:Z" \
        "$CONTAINER_IMAGE" \
        /build/build-inside-container.sh "$WINE_VERSION"

    log_info "Wine build complete!"
    log_info "Output directory: $OUTPUT_DIR"
}

verify_build() {
    log_info "Verifying Wine build..."

    local wine_bin="$OUTPUT_DIR/bin/wine64"
    if [[ ! -x "$wine_bin" ]]; then
        log_error "Wine binary not found at $wine_bin"
        exit 1
    fi

    # Check for required directories
    for dir in bin lib lib64 share; do
        if [[ ! -d "$OUTPUT_DIR/$dir" ]]; then
            log_warn "Expected directory not found: $OUTPUT_DIR/$dir"
        fi
    done

    log_info "Wine build verified successfully!"

    # Show size
    local size=$(du -sh "$OUTPUT_DIR" | cut -f1)
    log_info "Total Wine size: $size"
}

clean_build() {
    log_info "Cleaning build artifacts..."
    rm -rf "$OUTPUT_DIR"
    rm -f "$WINETRICKS_OUTPUT"
    log_info "Clean complete"
}

usage() {
    cat << EOF
Usage: $0 [command]

Commands:
    build       Build Wine (default)
    clean       Remove built Wine
    pull        Pull the SDK container image
    winetricks  Download winetricks only
    verify      Verify existing build
    help        Show this help

Environment Variables:
    WINE_VERSION        Wine version to build (default: 10.0)
    CONTAINER_RUNTIME   Container runtime to use (default: podman, falls back to docker)

Examples:
    $0                          # Build Wine with defaults
    WINE_VERSION=10.1 $0        # Build Wine 10.1
    CONTAINER_RUNTIME=docker $0 # Use Docker instead of Podman
EOF
}

main() {
    local command="${1:-build}"

    case "$command" in
        build)
            check_container_runtime

            # Create temporary work directory
            local work_dir
            work_dir=$(mktemp -d)
            trap "rm -rf $work_dir" EXIT

            pull_sdk_image
            download_wine_source "$work_dir"
            build_wine "$work_dir"
            verify_build
            download_winetricks

            log_info ""
            log_info "Build complete!"
            log_info "Wine installed to: $OUTPUT_DIR"
            log_info "Winetricks installed to: $WINETRICKS_OUTPUT"
            log_info ""
            log_info "Next steps:"
            log_info "  1. Run 'cargo tauri build --config src-tauri/tauri.linux.conf.json' to create the bundled app"
            log_info "  2. The Wine binaries will be included in the Linux package"
            log_info ""
            log_info "CI command:"
            log_info "  TAURI_CONFIG=src-tauri/tauri.linux.conf.json cargo tauri build"
            ;;
        clean)
            clean_build
            ;;
        pull)
            check_container_runtime
            pull_sdk_image
            ;;
        winetricks)
            download_winetricks
            ;;
        verify)
            verify_build
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
