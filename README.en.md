# Firefly · Desktop AI Companion

Firefly is a Windows Live2D AI application built on the Cyrene desktop runtime. This branch contains the migration source and retains the existing UI, Agent loop, tools, approvals, and task-state ownership. **This is not a completed public release.**

- Project: [Serendipity-wu02/Firefly_Agent](https://github.com/Serendipity-wu02/Firefly_Agent)
- Feedback: [GitHub Issues](https://github.com/Serendipity-wu02/Firefly_Agent/issues)
- Downloads and updates: There is **no compatible release** for this new base yet. Automatic updates are disabled. Do not install an older Firefly or upstream Cyrene package over this build.

## Migration status

| Area | Current evidence |
| --- | --- |
| Persona | Chat, Work, Learn, and Code load the structured Firefly persona; focused tests and the Batch 1 on-device Chat check passed. The cause of the earlier first-open empty lists remains unknown. |
| Desktop character | The source loads `models/firefly/Firefly.model3.json`; click and drag were checked on-device. Sustained 60 FPS has not been measured. |
| Chat | The existing conversation pipeline and reply-terminal fix have focused tests and Batch 1 on-device evidence. |
| Work / Learn / Code | Existing modes and permissions remain in place. Work file-read evidence, partial-read confirmation, and Markdown export are integrated. |
| Moments and stickers | Moments is off by default. Old character artwork without a Firefly equivalent is not used as a placeholder. |
| Music and speech | QQ Music desktop status and basic controls now use the existing tool-permission path; the NetEase entry is inactive. The GPT-SoVITS request protocol is adapted, while the service, reference audio, and matching transcript must be configured by the user. See the Batch 4 record for real-service verification. |

See the [Batch 1 implementation record](./docs/migration/firefly-batch1-implementation-2026-09-23.md) for source evidence and validation limits. Historical audit documents are preserved as historical records.

## Local use

Requirements: Windows, Node.js 24, and npm 10 or later. Do **not** copy credentials, chat history, or authorization data from the old application.

```powershell
npm ci
npm run build
npm start
```

Run these commands from the root of this migration branch. Public installers, automatic updates, and asset redistribution still need separate verification.

Configure your own model through the application's normal Settings UI. Check the model and avatar, main pages, and one complete Chat reply for identity, form of address, style, and clean termination. A successful build or visible main window does not prove that a model reply works. Local checks include `npm run check:renderer` and `npm test`.

This build uses `%APPDATA%\Firefly` for user data, separate from the original Firefly package directory `%APPDATA%\firefly-agent`. To migrate from the previous `Firefly-Cyrene-Base` directory, fully quit the app first; copy persistent data only if the target does not exist, retain the source as a backup, and skip runtime locks and rebuildable caches. Never overwrite or automatically merge an existing target directory. Remaining `cyrene` CLI commands, storage keys, and source names are compatibility identifiers, not product ownership claims.

## External speech service

GPT-SoVITS runs outside Firefly. Prepare and start your own service, then configure its address, a local reference audio file, and the exact matching transcript in the application's speech settings before enabling it. Missing settings produce a clear speech error without blocking text replies. The Firefly repository and installer do not include your local GPT-SoVITS environment, model weights, reference audio, or cache. Follow the original creators' terms for any voice model or audio you use.

## Contributing and licensing

Read the [contribution guide](./.github/CONTRIBUTING.md). Do not add a second Agent loop, expand permissions, replace the new UI with the old Firefly workbench, or include secrets and private data in issues.

Source code is under the [MIT License](./LICENSE). The upstream `Copyright (c) 2026 Playa` notice remains, and Firefly additions/adaptations are attributed to `Serendipity-wu02`. See [third-party notices](./THIRD_PARTY_NOTICES.md) and the [upstream contributors record](./docs/CONTRIBUTORS.md).

The MIT source-code license does **not** grant rights to character art, Live2D models, avatars, fonts, icons, or other third-party assets. The existing [Cyrene model notice](./MODEL_LICENSE.md) does not authorize the Firefly model. The project owner confirms obtaining the Firefly model creator's permission, but its written redistribution scope and permissions for the avatar and other assets have not been archived; no installer or asset bundle is being released. _Honkai: Star Rail_ and Firefly IP belong to HoYoverse / miHoYo; this is an unofficial project.
