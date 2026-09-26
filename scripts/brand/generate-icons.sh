#!/usr/bin/env bash
#
# Regenerate the raster app icons from the brand mark.
#
#   bash scripts/brand/generate-icons.sh
#
# The SVG favicon covers every current browser, so this only matters for the
# places that cannot use SVG: the iOS home-screen icon and the PWA install
# icons in site.webmanifest. Run it after changing joydigi-mark.svg.
#
# Needs rsvg-convert, which renders SVG properly (ImageMagick alone delegates
# SVG to a rasteriser and often produces a blurry or blank result):
#   sudo apt install -y librsvg2-bin
# Optional, for favicon.ico:
#   sudo apt install -y imagemagick

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PUBLIC_DIR="$REPO_ROOT/apps/web/public"
SOURCE="$PUBLIC_DIR/joydigi-mark.svg"

[ -f "$SOURCE" ] || { echo "Missing $SOURCE" >&2; exit 1; }

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert is not installed. On Ubuntu:" >&2
  echo "  sudo apt install -y librsvg2-bin" >&2
  exit 1
fi

render() {
  local size="$1" out="$2"
  rsvg-convert -w "$size" -h "$size" "$SOURCE" -o "$PUBLIC_DIR/$out"
  echo "  $out (${size}x${size})"
}

echo "Rendering from $(basename "$SOURCE"):"
render 96  favicon-96x96.png
render 180 apple-touch-icon.png
render 192 web-app-manifest-192x192.png
render 512 web-app-manifest-512x512.png

# favicon.ico is a legacy fallback: index.html points at favicon.svg first, so
# this is only reached by browsers that ignore SVG icons.
if command -v magick >/dev/null 2>&1 || command -v convert >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  for s in 16 32 48; do
    rsvg-convert -w "$s" -h "$s" "$SOURCE" -o "$tmp/$s.png"
  done
  if command -v magick >/dev/null 2>&1; then
    magick "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" "$PUBLIC_DIR/favicon.ico"
  else
    convert "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" "$PUBLIC_DIR/favicon.ico"
  fi
  echo "  favicon.ico (16/32/48)"
else
  echo "  favicon.ico skipped (ImageMagick not installed)"
fi

echo "Done."
