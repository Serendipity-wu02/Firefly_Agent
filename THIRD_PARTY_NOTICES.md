# Third-party notices

## Upstream Cyrene source code

This Firefly migration retains substantial source code and architecture from [Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent). The original MIT notice, `Copyright (c) 2026 Playa`, remains in [LICENSE](./LICENSE). The Firefly additions and adaptations are attributed to `Serendipity-wu02` under the same MIT source-code terms. Existing upstream contributions are recorded in [docs/CONTRIBUTORS.md](./docs/CONTRIBUTORS.md). Product links point to [Serendipity-wu02/Firefly_Agent](https://github.com/Serendipity-wu02/Firefly_Agent); that does not transfer authorship of upstream work.

## Character and visual assets

- The Firefly Live2D files in `src/renderer/public/models/firefly/` match assets from the old local Firefly project. The project owner confirms having obtained authorization from the model's original creator; the repository does not yet contain the creator's attribution or the authorization's covered files and redistribution terms. The avatar in `src/renderer/public/avatars/firefly-avatar.png`, the Firefly icon preset, and the twelve task portraits require their own scope check. **Do not publish an installer or asset bundle until the applicable creator, source, scope, and redistribution terms are documented.**
- The upstream Cyrene Live2D model and its existing creator/source statement remain documented in [MODEL_LICENSE.md](./MODEL_LICENSE.md). That statement concerns the Cyrene model only. The Cyrene model is not an active Firefly load path; its retired source and bundled copies have been removed from this working tree.
- Other historical character illustrations, status images, stickers, installer artwork, and icons have not been individually cleared for redistribution. Hidden or unused assets are not automatically licensed. The current installer no longer selects the old Cyrene sidebar or tray icon. Any later distribution must review the remaining files individually.
- No standalone UI font files are stored under `src/renderer/` or `assets/`; the general UI uses a system-font stack and supports user-imported local fonts. The build **does** include KaTeX `.woff`, `.woff2`, and `.ttf` math fonts from the `katex` dependency. KaTeX is MIT-licensed, with `Copyright (c) 2013-2020 Khan Academy and other contributors`; its full `node_modules/katex/LICENSE` is copied to `licenses/KaTeX-LICENSE` in the installer. Other fonts require separate review before bundling.
- Firefly and _Honkai: Star Rail_ character IP, artwork, names, and lore belong to HoYoverse / miHoYo. The project is unofficial. MIT covers the source code, not those assets or underlying IP.

## JavaScript packages and plugins

Runtime and build dependencies are declared in `package.json` and locked in `package-lock.json`; their individual package licenses remain applicable. The retired `vendor/cloud-music-mcp/` source is no longer shipped. Its provenance and license remain in repository history and historical migration records. The project-maintained SDK is now locally built as `@firefly/plugin-sdk`, with the original MIT notice included. It is not published to npm. The upstream plugin registry is no longer a default service; local ZIP installation remains available.

## Current sticker source

The 21 current Firefly stickers were supplied by the repository owner for this resource update. Original filenames, current asset paths and descriptions are recorded in [the resource update report](./docs/architecture/resource-refresh-2026-09-26.md). This source record does not claim original authorship or transfer the underlying artwork/IP rights; the applicable asset permissions remain separate from the source-code MIT license.

## Historical design research sources

Retired design notes identified BiliNote (`https://github.com/JefferyHcool/BiliNote`, recorded there as MIT), moesnow/March7thAssistant (recorded there as GPL-3.0), and SnowLuma as external research or integration references. Removing those obsolete plans does not claim authorship of these projects or grant redistribution rights. The original GameBot research boundary prohibited copying March7thAssistant code, templates, images, configuration and artwork. The SnowLuma proposal did not include its binary and left its distribution license for separate verification. No such implementation or binary is added by this documentation cleanup. These are provenance records, not a new license audit or a claim that a proposed integration is available.

## Git for Windows MinGit 2.55.0.3

Windows release builds include [Git for Windows MinGit 2.55.0.3](https://github.com/git-for-windows/git/releases/tag/v2.55.0.windows.3) only as a fallback when the user's system Git is unavailable. The archive is downloaded from the official Git for Windows release and SHA-256 verified before packaging.

Git for Windows and Git are distributed under GPL-2.0. The bundled MinGit archive retains its own license files. Source and license information are available from the [Git for Windows project](https://github.com/git-for-windows/git).
