# Third-party software in GameMate

GameMate includes the software below. Each part keeps its own license; the license texts are in
this folder. GameMate itself is free software under the GNU General Public License, version 3 or
(at your option) any later version.

## eSpeak NG

- What it does in GameMate: works out how the Kokoro voice pronounces text, in every language
  Kokoro speaks (English, Spanish, French, Italian and Portuguese). It runs on your PC.
- Project: https://github.com/espeak-ng/espeak-ng
- Copyright: the eSpeak NG authors and contributors. The language data bundled with it names
  Reece H. Dunn as its maintainer.
- License: GNU General Public License, version 3 or (at your option) any later version. See
  `GPL-3.0.txt`.
- GameMate includes two WebAssembly builds of eSpeak NG, listed in the next two sections.

## espeak-ng.js 1.0.2

- eSpeak NG (version 1.52-dev) compiled to WebAssembly with Emscripten, by Ian Armour. GameMate
  uses it for Spanish, French, Italian and Portuguese.
- Package: npm `espeak-ng` 1.0.2, https://registry.npmjs.org/espeak-ng/-/espeak-ng-1.0.2.tgz
- Source: https://github.com/ianmarmour/espeak-ng.js (its README has the build steps)
- License: GPL-3.0-or-later. See `GPL-3.0.txt`.

## phonemizer 1.2.1

- phonemizer.js by Xenova, a text-to-phonemes converter that contains its own build of eSpeak NG.
  kokoro-js uses it for English.
- Package: npm `phonemizer` 1.2.1, https://registry.npmjs.org/phonemizer/-/phonemizer-1.2.1.tgz
- Source: https://github.com/xenova/phonemizer.js
- License: the package is published under the Apache License 2.0 (see `Apache-2.0.txt`); the
  eSpeak NG build it contains is under the GPL-3.0-or-later (see `GPL-3.0.txt`).

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

The source code of the GPL-licensed parts above is available from the links in each section.
Every GameMate release on https://github.com/TSCKey/gamemate/releases also has the exact
`espeak-ng` and `phonemizer` packages it was built with, as `espeak-ng-1.0.2.tgz` and
`phonemizer-1.2.1.tgz`.
