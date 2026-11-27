# Third-party software in GameMate

GameMate includes the software below. Each part keeps its own license; the license texts are in
this folder. GameMate itself is free software under the GNU General Public License, version 3 or
(at your option) any later version.

## eSpeak NG 1.52.0

- What it does in GameMate: works out how the Kokoro voice pronounces text, in every language
  Kokoro speaks (English, Spanish, French, Italian and Portuguese). It runs on your PC.
- Project: https://github.com/espeak-ng/espeak-ng
- Copyright: the eSpeak NG authors and contributors. The language data bundled with it names
  Reece H. Dunn as its maintainer.
- License: GNU General Public License, version 3 or (at your option) any later version. See
  `GPL-3.0.txt`.
- GameMate includes its own WebAssembly build of eSpeak NG 1.52.0, compiled from commit
  4870adfa25b1a32b4361592f1be8a40337c58d6c of https://github.com/espeak-ng/espeak-ng with
  Emscripten 3.1.50, with the dictionaries of those five languages. The build script is
  `scripts/espeak/build.sh` in GameMate's source code.

## kokoro-js 1.2.1

- Runs the Kokoro voice model, by hexgrad.
- Package: npm `kokoro-js` 1.2.1, https://registry.npmjs.org/kokoro-js/-/kokoro-js-1.2.1.tgz
- Source: https://github.com/hexgrad/kokoro (folder `kokoro.js`)
- License: Apache License 2.0. See `Apache-2.0.txt`.

## Kokoro-82M voice model

- The Kokoro voice, downloaded by GameMate when you choose to download it (not part of the
  installer). GameMate uses the version published by onnx-community on Hugging Face:
  https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- License: Apache License 2.0. See `Apache-2.0.txt`.

## Source code

GameMate's own source code, including the eSpeak NG build script, is at
https://github.com/TSCKey/gamemate. From GameMate 0.4.0 on, every release on
https://github.com/TSCKey/gamemate/releases also has, next to the installer:

- `espeak-ng-1.52.0-source.tar.gz`: eSpeak NG's complete source code at the commit above;
- `gamemate-espeak-build.tar.gz`: the script and workflow that built GameMate's eSpeak NG from it,
  and the list of the files it produced with their SHA-256 hashes.
