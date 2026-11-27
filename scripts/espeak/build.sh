#!/usr/bin/env bash
# Compiles eSpeak NG (GPL-3.0-or-later) to WebAssembly for GameMate's Kokoro voice, which uses it
# to work out pronunciation on the player's PC. Run by .github/workflows/espeak.yml on Linux with
# Emscripten activated; the result is committed to vendor/espeak-ng/ with manifest.json.
#
# Usage: build.sh <eSpeak NG source folder> <output folder> <Emscripten version>
# ESPEAK_COMMIT and ESPEAK_VERSION name the source in manifest.json; without them they're read
# from git, or "unknown" (the source archive attached to GameMate's releases has no git history).
#
# Based on the recipe in https://github.com/ianmarmour/espeak-ng.js (whose build GameMate used
# before): a native build first, which compiles the language data, then the program itself with
# Emscripten and the data embedded in it. The program is eSpeak NG's own command line (main), run
# once per call with Module.arguments, reading and writing files in its in-memory file system.
set -euo pipefail

SRC="$(cd "$1" && pwd)"
OUT="$(mkdir -p "$2" && cd "$2" && pwd)"
EMSCRIPTEN_VERSION="$3"
FEATURES=(--without-async --without-mbrola --without-sonic --without-pcaudiolib --without-klatt --without-speechplayer)
DATA="$(mktemp -d)/espeak-ng-data"

cd "$SRC"
COMMIT="${ESPEAK_COMMIT:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
VERSION="${ESPEAK_VERSION:-$(git describe --tags --exact-match 2>/dev/null || echo unknown)}"

# 1. Native build: compiles the dictionaries into espeak-ng-data.
./autogen.sh
./configure "${FEATURES[@]}"
make -j"$(nproc)"
cp -r espeak-ng-data "$DATA"
# Only the dictionaries of the languages Kokoro speaks in GameMate; the rest would only make the
# installer bigger.
find "$DATA" -maxdepth 1 -name '*_dict' \
  ! -name en_dict ! -name es_dict ! -name fr_dict ! -name it_dict ! -name pt_dict -delete
ls "$DATA"/*_dict

# 2. The same program with Emscripten. The data is embedded where the program looks for it
#    (the default prefix, /usr/local).
make distclean
# eSpeak NG's compat/wctype.h renames iswupper() and friends to its own Unicode functions. Unlike
# glibc's, Emscripten's (musl's) wchar.h declares those functions too, so when it's included after
# the rename the declarations clash. Including the real wchar.h first avoids it, without changing
# eSpeak NG's source.
SYSROOT_WCHAR="$(em-config CACHE)/sysroot/include/wchar.h"
emconfigure ./configure "${FEATURES[@]}" CFLAGS="-O2 -include $SYSROOT_WCHAR"
emmake make -j"$(nproc)" src/espeak-ng
# libtool leaves the library as a static archive or a "shared" object, depending on the version.
LIB="$(ls src/.libs/libespeak-ng.a src/.libs/libespeak-ng.so 2>/dev/null | head -1)"
emcc -O2 \
  "$LIB" src/espeak-ng.o \
  -o "$OUT/espeak-ng.js" \
  --embed-file "$DATA@/usr/local/share/espeak-ng-data/" \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=ESpeakNG \
  -s FORCE_FILESYSTEM=1 -s 'EXPORTED_RUNTIME_METHODS=["FS"]' \
  -s INITIAL_MEMORY=33554432 -s ALLOW_MEMORY_GROWTH=1

# 3. What was built, from what, with what.
cd "$OUT"
node -e '
const { createHash } = require("crypto")
const fs = require("fs")
const files = {}
for (const name of ["espeak-ng.js", "espeak-ng.wasm"])
  files[name] = createHash("sha256").update(fs.readFileSync(name)).digest("hex")
const [version, commit, emscripten] = process.argv.slice(1)
fs.writeFileSync("manifest.json", JSON.stringify({ version, commit, emscripten, files }, null, 2) + "\n")
' "$VERSION" "$COMMIT" "$EMSCRIPTEN_VERSION"
cat manifest.json
