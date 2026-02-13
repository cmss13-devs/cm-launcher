#!/bin/bash
# Steam launch script for CM-SS13 Launcher

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Use bundled libraries exclusively to avoid mixing with system libs
export LD_LIBRARY_PATH="$SCRIPT_DIR/usr/lib/x86_64-linux-gnu:$SCRIPT_DIR/usr/lib"

# Font configuration - use bundled fontconfig
export FONTCONFIG_FILE="$SCRIPT_DIR/usr/etc/fonts/fonts.conf"
export FONTCONFIG_PATH="$SCRIPT_DIR/usr/etc/fonts"

# GDK/GTK settings
export GDK_PIXBUF_MODULE_FILE="$SCRIPT_DIR/usr/lib/x86_64-linux-gnu/gdk-pixbuf-2.0/2.10.0/loaders.cache"
export GTK_PATH="$SCRIPT_DIR/usr/lib/x86_64-linux-gnu/gtk-3.0"

# GIO modules
export GIO_MODULE_DIR="$SCRIPT_DIR/usr/lib/x86_64-linux-gnu/gio/modules"

exec "$SCRIPT_DIR/usr/bin/CM_Launcher" "$@"
