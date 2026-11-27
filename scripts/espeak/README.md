# GameMate's eSpeak NG build

GameMate includes eSpeak NG 1.52.0 (GPL-3.0-or-later), compiled to WebAssembly, in
`vendor/espeak-ng/`. It was built by `.github/workflows/espeak.yml` with `build.sh` from
eSpeak NG commit 4870adfa25b1a32b4361592f1be8a40337c58d6c (tag 1.52.0) and Emscripten 3.1.50.
`manifest.json` lists the files it produced with their SHA-256 hashes.

To build it yourself, on Ubuntu 24.04:

1. Install the build tools: `sudo apt-get install make autoconf automake libtool pkg-config gcc`.
2. Install Emscripten 3.1.50: clone https://github.com/emscripten-core/emsdk, check out tag
   `3.1.50`, run `./emsdk install 3.1.50`, `./emsdk activate 3.1.50` and
   `source ./emsdk_env.sh`.
3. Unpack eSpeak NG's source (`espeak-ng-1.52.0-source.tar.gz` from a GameMate release, or a
   checkout of the commit above) and run:

   ```
   ESPEAK_COMMIT=4870adfa25b1a32b4361592f1be8a40337c58d6c ESPEAK_VERSION=1.52.0 \
     bash build.sh <eSpeak NG source folder> <output folder> 3.1.50
   ```

The script builds eSpeak NG natively first (to compile its dictionaries), keeps the dictionaries
of English, Spanish, French, Italian and Portuguese, then compiles the program with Emscripten
with that data embedded. It changes nothing in eSpeak NG's source; the one build flag it adds
(including `wchar.h` first) is explained in the script.
