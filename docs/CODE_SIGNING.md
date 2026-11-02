# Code signing policy

GameMate's Windows installer is meant to be signed, so Windows can show who published it and that nobody changed it.

**Status:** GameMate has applied to the SignPath Foundation's free code signing for open-source projects. Until the application is approved, releases are not signed, and Windows shows "Windows protected your PC" when you run the installer (click **More info**, then **Run anyway**).

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org)

## What gets signed

Only GameMate's own Windows installer and program, built from this repository's source code. Every release is built automatically by GitHub Actions from a version tag ([release workflow](../.github/workflows/release.yml)), and each signing request is approved by hand before it is signed. GameMate never asks anyone to sign other people's software.

## Team and roles

| Role                                                                      | Who                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------- |
| Authors (may change the source without further review)                    | Omar Abulebda ([@TSCKey](https://github.com/TSCKey)) |
| Reviewers (review every change proposed by others, such as pull requests) | Omar Abulebda ([@TSCKey](https://github.com/TSCKey)) |
| Approvers (approve each release for signing)                              | Omar Abulebda ([@TSCKey](https://github.com/TSCKey)) |

All team members use two-factor authentication for GitHub and SignPath.

## Privacy

GameMate runs on your PC and sends nothing to its developers. Features that connect to other services (Google Gemini and web search, online lookups on game wikis, finding your games' wikis) are off until you turn them on, and can be turned off at any time. The [Privacy Policy](PRIVACY.md) explains what each one sends and to whom, and GameMate shows it, together with the [Terms of Use](TERMS.md), before you first use it. Those services handle data under their own privacy policies, which the Privacy Policy links to.

## Uninstalling

Uninstall GameMate from Windows **Settings → Apps → Installed apps**. **Delete my data** in GameMate's **Settings → Privacy & legal** removes everything GameMate stored on your PC first.

## License

GameMate is free software under the [GNU General Public License v3.0 or later](../LICENSE).
