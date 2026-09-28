---
name: office-design
description: 为 Word、Excel、PDF 和 PowerPoint 选择并校验统一品牌主题。仅在需要跨格式保持颜色、字体、间距和数据语义一致时使用；单一格式的编辑仍优先使用对应技能。
license: MIT
metadata:
  version: '1.0'
  category: document-design
---

# Shared Office appearance contract

Use this Skill to agree on one visual vocabulary before producing several document formats. It selects and validates tokens; it does not create documents, install dependencies, or authorize execution. Keep the existing format Skill responsible for content, layout, editing and artifact verification.

## Decide before applying

1. Establish the requested outputs, audience, language and any supplied brand or institutional rules. Read actual templates and existing styles rather than inferring field names or font availability.
2. For edits, retain the source document's styling unless the user explicitly requests a redesign. A shared theme is not permission to replace formatting, formulas, content or source files.
3. Choose a packaged theme only when its purpose fits the agreed requirements. Ask the user when the requirements do not identify a theme. Custom tokens belong in the authorized workspace, not in the installed Skill directory.

| Theme file under `assets/themes/` | Functional purpose |
|---|---|
| `business.json` | Sans-serif reports: dark navigation/header color, teal emphasis, pale table surfaces, readable secondary text. |
| `academic.json` | Long-form research: serif-first text, paper-colored background, restrained indigo headings and individually labeled chart series. Not an institutional template. |
| `formal-cn.json` | Chinese notices: CJK serif preference, dark text, neutral fills and limited red emphasis. Does not certify compliance with a document standard. |
| `financial.json` | Dense numeric work: compact spacing, clear input/formula distinction, dark headers and separate caution/success states. Never changes number formats or formulas. |

All four use a dark `primary` with a light `background`: the current PDF reader uses that pair for cover background and cover text. Font lists express preferences, not proof that the fonts are installed or support all needed glyphs. Charts also need labels or patterns; color alone must not carry meaning.

## Resolve and validate locally

Invoke `office-design` through `invoke_skill`. Set `$skillDir` to the exact absolute path displayed as **Skill 本地目录（仅用于定位资源，不授权执行）** in that result. It is a text path, not a JSON field. Never substitute the repository root, another Skill's directory, or the current working directory. Reinitialize these variables in each new PowerShell session.

Once `$skillDir` has that returned value, and execution is allowed by the current mode and authorization, this read-only example validates the packaged business theme:

```powershell
if (-not [System.IO.Path]::IsPathRooted($skillDir)) { throw 'Use the absolute directory returned by invoke_skill.' }
$scriptRoot = Join-Path $skillDir 'scripts'
$themePath = Join-Path $skillDir 'assets\themes\business.json'
python -B (Join-Path $scriptRoot 'validate_theme.py') $themePath
if ($LASTEXITCODE -ne 0) { throw 'Theme validation failed; do not apply this theme.' }
```

For a custom theme, set `$themePath` to its verified absolute workspace path while keeping the validator under `$skillDir`. Validation reads the file and emits a JSON report; it never repairs or rewrites it. Exit `0` means valid, `1` means invalid tokens, and `2` means the input could not be read as UTF-8 JSON. Resolve every reported error before use; do not silently substitute another theme. If Python or an execution tool is unavailable, report the blocker rather than install software or claim validation.

## Route using the actual consumers

Read [token-schema.md](references/token-schema.md) for required fields and exact mappings. Invoke each destination Skill separately and use its own returned absolute directory to resolve its resources.

| Route | What the current implementation supports |
|---|---|
| `pdf` | Its `scripts/make.py` accepts `--theme` with `business`, `academic`, `formal-cn` or `financial`. `apply_theme` reads shared **colors**, not shared fonts, roles, chart palettes or spacing. PDF typography and layout stay in the PDF pipeline. |
| `pptx-generator` | Its `scripts/theme-loader.js` exposes `loadTheme` and returns `primary`, `secondary`, `accent`, `light`, `bg` as six-digit hex without `#`. Here `secondary` comes from **foreground**, not the shared `secondary`. This loader does not generate a deck or apply fonts. |
| `xlsx` | Its visual workflow maps colors and roles deliberately; it has no automatic shared-theme loader. Resolve `roles` references against `colors` before writing native styles. Preserve blue hard-coded inputs, black formulas and the separate cross-sheet formula convention. |
| `docx` | Use the format Skill for native styles and verified font selection. The host `write_word` reads `docx/styles/`, not these themes, and accepts `style`, not a shared-theme parameter. A shared appearance needs explicit native-style mapping through the authorized DOCX workflow. |

The host registers `write_word`, `write_excel` and `write_pdf` in **Work mode only**, with `effectKind: mutation`. They are simple creation tools, not arbitrary theme engines. `write_excel` accepts `style` and these optional `colors` overrides: `headerFill`, `headerFont`, `headerBorder`, `zebraFill`, `borderColor` (opaque ARGB). It does not accept shared fonts, roles or chart palettes. `write_pdf` has no theme/style input. There is no registered PowerPoint writer; use only the actual permitted local workflow described by `pptx-generator` when its dependencies are present. Loading this Skill grants none of these tools or permissions.

## Verification handoff

Record the theme path and validation report, the exact tokens consumed by each format, verified fonts and unimplemented mappings. Create a separate authorized output instead of overwriting the source. Then use each format Skill's structural and visual checks: readable CJK glyphs, header contrast, chart labels, unclipped content, unchanged formulas and retained source content. Token validation alone is not an artifact or visual-verification receipt.

See `NOTICE.md` for current maintenance and the retained historical license lineage.
