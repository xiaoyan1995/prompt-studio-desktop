#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"

cd "$DESKTOP_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org/"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. Install it from https://www.python.org/"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  npm install
fi

mkdir -p build
if [ -f "$ROOT_DIR/prompt_studio_icon.png" ]; then
  cp "$ROOT_DIR/prompt_studio_icon.png" build/icon.png
fi
if [ -f "$ROOT_DIR/prompt_studio_icon.ico" ]; then
  cp "$ROOT_DIR/prompt_studio_icon.ico" build/icon.ico
fi
if [ -f "build/icon.png" ] && [ ! -f "build/icon.icns" ]; then
  ICONSET="build/icon.iconset"
  rm -rf "$ICONSET"
  mkdir -p "$ICONSET"
  sips -z 16 16     build/icon.png --out "$ICONSET/icon_16x16.png" >/dev/null
  sips -z 32 32     build/icon.png --out "$ICONSET/icon_16x16@2x.png" >/dev/null
  sips -z 32 32     build/icon.png --out "$ICONSET/icon_32x32.png" >/dev/null
  sips -z 64 64     build/icon.png --out "$ICONSET/icon_32x32@2x.png" >/dev/null
  sips -z 128 128   build/icon.png --out "$ICONSET/icon_128x128.png" >/dev/null
  sips -z 256 256   build/icon.png --out "$ICONSET/icon_128x128@2x.png" >/dev/null
  sips -z 256 256   build/icon.png --out "$ICONSET/icon_256x256.png" >/dev/null
  sips -z 512 512   build/icon.png --out "$ICONSET/icon_256x256@2x.png" >/dev/null
  sips -z 512 512   build/icon.png --out "$ICONSET/icon_512x512.png" >/dev/null
  sips -z 1024 1024 build/icon.png --out "$ICONSET/icon_512x512@2x.png" >/dev/null
  iconutil -c icns "$ICONSET" -o build/icon.icns
  rm -rf "$ICONSET"
fi

python3 -m pip show pyinstaller >/dev/null 2>&1 || python3 -m pip install pyinstaller
rm -rf server-dist server-build
mkdir -p server-dist
python3 -m PyInstaller --clean --noconfirm --onefile \
  --name prompt-studio-server \
  --distpath server-dist \
  --workpath server-build \
  --specpath server-build \
  studio/server.py

CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac -- --publish never

echo ""
echo "Done. macOS packages are in:"
echo "$DESKTOP_DIR/dist"
