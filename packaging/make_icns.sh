#!/usr/bin/env bash
# Generate packaging/AppIcon.icns from frontend/public/favicon.svg.
# Requires rsvg-convert (brew install librsvg). Best-effort: exits non-zero if
# it can't rasterize the SVG, and the build proceeds without a custom icon.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVG="$ROOT/frontend/public/favicon.svg"
OUT="$ROOT/packaging/AppIcon.icns"
TMPSET="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$TMPSET"
trap 'rm -rf "$(dirname "$TMPSET")"' EXIT

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "make_icns: rsvg-convert not found (brew install librsvg); skipping icon."
  exit 1
fi

rsvg-convert -w 1024 -h 1024 "$SVG" -o "$TMPSET/base.png"
sips -z 16 16     "$TMPSET/base.png" --out "$TMPSET/icon_16x16.png"      >/dev/null
sips -z 32 32     "$TMPSET/base.png" --out "$TMPSET/icon_16x16@2x.png"   >/dev/null
sips -z 32 32     "$TMPSET/base.png" --out "$TMPSET/icon_32x32.png"      >/dev/null
sips -z 64 64     "$TMPSET/base.png" --out "$TMPSET/icon_32x32@2x.png"   >/dev/null
sips -z 128 128   "$TMPSET/base.png" --out "$TMPSET/icon_128x128.png"    >/dev/null
sips -z 256 256   "$TMPSET/base.png" --out "$TMPSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256   "$TMPSET/base.png" --out "$TMPSET/icon_256x256.png"    >/dev/null
sips -z 512 512   "$TMPSET/base.png" --out "$TMPSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512   "$TMPSET/base.png" --out "$TMPSET/icon_512x512.png"    >/dev/null
cp "$TMPSET/base.png" "$TMPSET/icon_512x512@2x.png"
rm "$TMPSET/base.png"
iconutil -c icns "$TMPSET" -o "$OUT"
echo "make_icns: wrote $OUT"
