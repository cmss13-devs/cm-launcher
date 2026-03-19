#!/bin/bash
# Steam launch script for CM-SS13 Launcher (sharun format)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export APPDIR="$SCRIPT_DIR"

if [ ! -e "$SCRIPT_DIR/lib/x86_64-linux-gnu" ]; then
    ln -sf . "$SCRIPT_DIR/lib/x86_64-linux-gnu"
fi

mkdir -p "$SCRIPT_DIR/usr/lib/CM-SS13 Launcher"
for file in wine.tar.zst winetricks cabextract; do
    if [ ! -e "$SCRIPT_DIR/usr/lib/CM-SS13 Launcher/$file" ]; then
        ln -sf "$SCRIPT_DIR/lib/SS13 Launcher/$file" "$SCRIPT_DIR/usr/lib/CM-SS13 Launcher/$file"
    fi
done

exec "$SCRIPT_DIR/AppRun" "$@"
