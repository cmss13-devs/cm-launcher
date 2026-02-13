#!/bin/bash
# Steam launch script for CM-SS13 Launcher

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export LD_LIBRARY_PATH="$SCRIPT_DIR/usr/lib/x86_64-linux-gnu:$SCRIPT_DIR/usr/lib"

export FONTCONFIG_FILE="$SCRIPT_DIR/usr/etc/fonts/fonts.conf"
export FONTCONFIG_PATH="$SCRIPT_DIR/usr/etc/fonts"

export GIO_MODULE_DIR="$SCRIPT_DIR/usr/lib/x86_64-linux-gnu/gio/modules"

source "$SCRIPT_DIR"/apprun-hooks/"linuxdeploy-plugin-gtk.sh"

exec "$SCRIPT_DIR/AppRun.wrapped" "$@"
