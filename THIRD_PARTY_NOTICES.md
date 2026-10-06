# Third-party notices

## node-forge security backport

The original `node-forge@1.4.0` package remains a Digital Bazaar dependency under
its BSD/GPL dual license; Firefly uses the BSD option. Firefly's hash-checked
installer applies the nested DigestAlgorithm validation correction from
upstream PR #1152, fixed commit `ceba34402e329f0365134f23fe19898756527d65`.
The correction and public regression inputs retain their attribution and BSD
terms in [the source record](vendor/security/node-forge/SOURCE.md) and
[complete BSD license](vendor/security/node-forge/LICENSE). This is a local
backport, not an upstream released version or a claim that npm audit is clear.

## Upstream source

Portions of this project derive from [Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent). Original MIT copyright: `Copyright (c) 2026 Playa`. The original MIT notice is preserved in [LICENSE](./LICENSE). Firefly_Agent is independently maintained; retaining this provenance does not claim original authorship of upstream work.

## Character and visual assets

- The Firefly Live2D files in `src/renderer/public/models/firefly/` match assets from the old local Firefly project. The project owner confirms having obtained authorization from the model's original creator; the repository does not yet contain the creator's attribution or the authorization's covered files and redistribution terms. The avatar in `src/renderer/public/avatars/firefly-avatar.png`, the Firefly icon preset, and the twelve task portraits require their own scope check. **Do not publish an installer or asset bundle until the applicable creator, source, scope, and redistribution terms are documented.**
- Remaining character artwork, stickers and icons require individual redistribution checks. Hidden or unused assets are not automatically licensed. Any later distribution must review applicable sources and permissions.
- No standalone UI font files are stored under `src/renderer/` or `assets/`; the general UI uses a system-font stack and supports user-imported local fonts. The build **does** include KaTeX `.woff`, `.woff2`, and `.ttf` math fonts from the `katex` dependency. KaTeX is MIT-licensed, with `Copyright (c) 2013-2020 Khan Academy and other contributors`; its full `node_modules/katex/LICENSE` is copied to `licenses/KaTeX-LICENSE` in the installer. Other fonts require separate review before bundling.
- Firefly and _Honkai: Star Rail_ character IP, artwork, names, and lore belong to HoYoverse / miHoYo. The project is unofficial. MIT covers the source code, not those assets or underlying IP.

## JavaScript packages and plugins

Runtime and build dependencies are declared in `package.json` and locked in `package-lock.json`; their individual package licenses remain applicable. The retired `vendor/cloud-music-mcp/` source is no longer shipped. Its provenance and license remain in repository history and historical migration records. The project-maintained SDK is now locally built as `@firefly/plugin-sdk`, with the original MIT notice included. It is not published to npm. The upstream plugin registry is no longer a default service; local ZIP installation remains available.

## ZIP parsing and extraction

The project currently uses `yauzl@3.4.0` for ZIP parsing. It is MIT-licensed, `Copyright (c) 2014 Josh Wolfe`; the complete original license remains at `node_modules/yauzl/LICENSE` and must remain with redistributed copies of that dependency. This notice does not replace or rewrite that license.

`src/shared/zip-extraction.ts` is the project's adapter for validating entries and writing extracted files. It is not an `extract-zip` fork, contains no copied `extract-zip` code, and does not claim an independently implemented ZIP parser. The unscoped `extract-zip` package is absent from both the lockfile and the installed dependency tree. The separate scoped package `@electron-internal/extract-zip` remains an Electron third-party dependency; it is not the project's replacement ZIP implementation.

## Inherited application Skills

The distributed `vendor/firefly-skills/` includes [complete additional licenses and scoped notices](./vendor/firefly-skills/LICENSE-NOTICES.md) and [file-level provenance](./vendor/firefly-skills/license-provenance.json). Distribute these materials and the complete licenses alongside the current directory-based Skills distribution. They identify the applicable authors and sources separately; no single repository license is applied to all Skills. The current self-improvement implementation uses a documented Firefly adaptation of Peter Skøtt Pedersen's pinned source with its complete license. The previous OpenClaw remake's ten unresolved files are absent from the current distribution, not retroactively licensed. Historical installations and backups remain separate from this distribution.

The nine bundled `sp-` Skills originate from [Superpowers commit ebdd4ec61f2f560bada4f6ded7b0806e62bf33f7](https://github.com/obra/superpowers/tree/ebdd4ec61f2f560bada4f6ded7b0806e62bf33f7) with Firefly host adaptations. Each carries the complete MIT LICENSE, `Copyright (c) 2025 Jesse Vincent`, and a provenance NOTICE. Supporting platform references retain their identified source history; this is not an official pristine single-version upstream distribution.

Firefly maintains the review/delegation adaptation, four reference briefs and three new Node helpers. The PPTX adaptation repairs six local anchors without changing generation behavior. These changes are not claimed as unmodified upstream originals. Other inherited Skill families retain their own source and license evidence; the Superpowers MIT text does not grant rights to unrelated assets. Current scope and adaptation evidence are recorded in the dependency governance report. This does not clear unrelated artwork or all release assets for redistribution.

## Current sticker source

The 21 current Firefly stickers were supplied by the repository owner for this resource update. Original filenames, current asset paths and descriptions are recorded in [the resource update report](docs/archive/reviews/resource-refresh-2026-09-26.md). This source record does not claim original authorship or transfer the underlying artwork/IP rights; the applicable asset permissions remain separate from the source-code MIT license.

## Historical design research sources

Retired design notes identified BiliNote (`https://github.com/JefferyHcool/BiliNote`, recorded there as MIT), moesnow/March7thAssistant (recorded there as GPL-3.0), and SnowLuma as external research or integration references. Removing those obsolete plans does not claim authorship of these projects or grant redistribution rights. The original GameBot research boundary prohibited copying March7thAssistant code, templates, images, configuration and artwork. The SnowLuma proposal did not include its binary and left its distribution license for separate verification. No such implementation or binary is added by this documentation cleanup. These are provenance records, not a new license audit or a claim that a proposed integration is available.

## Git for Windows MinGit 2.55.0.3

Simple-git 4 uses `@simple-git/argv-parser@2.0.1`, MIT, Copyright (c) 2025 Steve King. Firefly maintains a narrow Windows null-device compatibility adaptation, documented with exact input/output hashes and its complete license in [vendor/security/argv-parser](./vendor/security/argv-parser/SOURCE.md). This preserves bundled Git's configuration isolation without enabling unsafe configuration paths or inherited pager execution; it is not an upstream release. The package's original identity and license remain unchanged.

The Windows packaging configuration includes [Git for Windows MinGit 2.55.0.3](https://github.com/git-for-windows/git/releases/tag/v2.55.0.windows.3) as a fallback when the user's system Git is unavailable. `vendor/mingit-manifest.json` records the source archive and SHA-256; `scripts/packaging/prepare-mingit.mjs` performs preparation and verification. This describes the configured input, not a newly verified installer or release.

Git for Windows and Git are distributed under GPL-2.0. The bundled MinGit archive retains its own license files. Source and license information are available from the [Git for Windows project](https://github.com/git-for-windows/git).
