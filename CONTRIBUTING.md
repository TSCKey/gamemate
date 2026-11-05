# Contributing to GameMate

Thanks for helping make GameMate better. Bug reports, ideas, translation fixes and code are all welcome. Please follow the [code of conduct](CODE_OF_CONDUCT.md).

## Reporting a problem or an idea

Open an [issue](https://github.com/TSCKey/gamemate/issues/new/choose) and pick the form that fits: a bug report, a feature request or a translation fix. A good bug report says which GameMate version you use (**⚙ Settings → General**), which AI answered (built-in, Ollama or Gemini) and what you did.

GameMate's log is at `%APPDATA%\gamemate\logs\main.log`. It never contains your questions or answers, but check before you paste it, and **never post your Gemini API key**.

Security problems go privately to the maintainer, not into an issue: see [SECURITY.md](SECURITY.md).

## Improving a translation

GameMate is translated into Arabic, French, German, Spanish, Portuguese, Italian, Turkish, Russian, Japanese, Chinese and Korean, and the translations need native speakers. You can:

- open a **Translation fix** issue with what a text says now and what it should say, or
- edit the language's file in `src/shared/i18n/` (for example `de.json`) and open a pull request. Keep the keys and the `{{placeholders}}` exactly as they are, and keep the tags such as `<b>…</b>`.

The Terms of Use and Privacy Policy translations are in `docs/<language>/`. Their English versions in `docs/` are the binding ones, so changes to the legal texts are best suggested in an issue.

## Working on the code

You need Windows, [Node.js](https://nodejs.org/) 22 and Git.

```bash
git clone https://github.com/TSCKey/gamemate.git
cd gamemate
npm ci
npm run dev
```

`npm run dev` starts GameMate with your changes. It uses the same settings folder as an installed GameMate. To try changes with separate settings, build once and start it with its own folder:

```bash
npm run build
npx electron . --user-data-dir=C:\gamemate-dev
```

The code is in `src/`:

- `src/main/` runs in the background: the AI engines (`ai/`), games and wikis (`games/`), voice (`voice/`), the windows (`windows/`) and settings (`system/`).
- `src/renderer/src/` is what the windows show: the chat, the in-game window and Settings.
- `src/shared/` is used by both, including the translations in `i18n/`.
- Tests are in `tests/`.

### Before you open a pull request

Run the same checks as GitHub's CI:

```bash
npm run lint
npm run typecheck
npm test
npm run format
```

- **Add a test** for what you fix or add. Tests use [Vitest](https://vitest.dev/); look at a test file near your change for how they stub Electron.
- **Every text the player sees goes through the translation files**, in all 12 languages (`src/shared/i18n/*.json`). A test fails when a window shows text that isn't translated, or a language is missing a key. If you can't translate a text, put the English in the other files and say so in the pull request.
- **Keep GameMate local by default.** Anything that sends data off the PC must be off until the player turns it on, and must be described in the Privacy Policy.
- Keep pull requests focused on one change, and explain what it does for a player.

## License of contributions

GameMate is licensed under the [GNU General Public License v3.0 or later](LICENSE). By contributing, you agree that your contribution is licensed the same way.
