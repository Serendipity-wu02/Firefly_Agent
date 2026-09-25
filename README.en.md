# Firefly · Desktop AI Companion

Current runtime and Skill organization: [architecture](./docs/architecture/firefly-runtime.md). Current branding, compatibility and acceptance evidence: [implementation record](./docs/migration/firefly-brand-skills-2026-09-25.md). Historical documents remain unchanged and are collected in the [archive index](./docs/archive/README.md).

Firefly is a Windows Live2D AI application using Electron, TypeScript and React. This branch retains the existing UI, Agent loop, tools, approvals, and task-state ownership. **This is not a completed public release.**

- Project: [Serendipity-wu02/Firefly_Agent](https://github.com/Serendipity-wu02/Firefly_Agent)
- Feedback: [GitHub Issues](https://github.com/Serendipity-wu02/Firefly_Agent/issues)
- Downloads and updates: There is **no compatible release** yet. Automatic updates are disabled. Do not install another version's release package over this build.

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

This build uses `%APPDATA%\Firefly`, separate from the original `%APPDATA%\firefly-agent`. Quit before directory migration, preserve source backups, and never overwrite an existing destination. Current writes, events and CLI use Firefly contracts; centralized migration handles older formats without overwriting existing current data or treating read errors as empty data.

## External speech service

GPT-SoVITS runs outside Firefly. Prepare and start your own service, then configure its address, a local reference audio file, and the exact matching transcript in the application's speech settings before enabling it. Missing settings produce a clear speech error without blocking text replies. The Firefly repository and installer do not include your local GPT-SoVITS environment, model weights, reference audio, or cache. Follow the original creators' terms for any voice model or audio you use.

## Contributing and licensing

Read the [contribution guide](./.github/CONTRIBUTING.md). Do not add a second Agent loop, expand permissions, replace the new UI with the old Firefly workbench, or include secrets and private data in issues.

Source code is under the [MIT License](./LICENSE). The upstream `Copyright (c) 2026 Playa` notice remains, and Firefly additions/adaptations are attributed to `Serendipity-wu02`. See [third-party notices](./THIRD_PARTY_NOTICES.md) and the [upstream contributors record](./docs/CONTRIBUTORS.md).

The MIT source-code license does **not** grant rights to character art, Live2D models, avatars, fonts, icons, or other third-party assets. See the separate [model notice](./MODEL_LICENSE.md). The project owner confirms obtaining the Firefly model creator's permission, but its written redistribution scope and permissions for the avatar and other assets have not been archived; no installer or asset bundle is being released. _Honkai: Star Rail_ and Firefly IP belong to HoYoverse / miHoYo; this is an unofficial project.
