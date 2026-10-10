# Office token contract and format boundaries

These JSON keys and the packaged filenames are compatibility interfaces. Do not change their spelling or infer aliases. The validator accepts one UTF-8 JSON object and reports all independent field errors in a stable section order. It validates data only: it does not check installed fonts, contrast, layout, permissions or output artifacts.

## Required structure

| Field | Required values and validation |
|---|---|
| `id` | Nonblank string. Packaged files use `business`, `academic`, `formal-cn`, `financial` respectively. A custom ID does not register it with another Skill's loader. |
| `colors` | Object with `primary`, `secondary`, `accent`, `background`, `surface`, `foreground`, `muted`, `border`. Each required value is exactly `#RRGGBB`; uppercase and lowercase hex digits are valid. No short hex, alpha channel, whitespace or color names. |
| `fonts` | Object with `cjk`, `latin`, `fallback`. Each is a nonempty ordered array of nonblank strings. Verify availability and glyph coverage in the destination runtime; do not download fonts based on this list. |
| `spacing` | Object with `base`: a finite positive number, not a numeric string or boolean. This is a shared rhythm value, not a page margin or universal geometry unit. The destination workflow determines native units explicitly. |
| `roles` | Object with `table_header`, `input`, `formula`, `warning`, `success`. Each value is `#RRGGBB` or an exact existing key in `colors` whose value is valid hex. No case folding or chained role references. |
| `chart_colors` | Nonempty array of `#RRGGBB` strings; every entry must be valid. Order associates series with colors; keep labels and series order stable across outputs. |

Missing required keys are errors. Invalid types, nulls and empty font lists are errors. An empty `chart_colors` retains the diagnostic `chart_colors is required`. Optional fields are not removed or rewritten and are not evidence that any current consumer supports them. This validator does not impose a closed schema or verify every optional field.

## Semantic use

- `primary`: prominent headings and header backgrounds; pair with verified light text for fills.
- `secondary`: supporting visual hierarchy, not the main body color.
- `accent`: focus, links and emphasized series, not an automatic success state.
- `background` / `surface`: page and contained-table fills respectively.
- `foreground` / `muted`: primary and secondary text, with actual contrast checked at delivery.
- `border`: structural separators; avoid making it the only indication of a state.
- `roles.table_header`: resolves to the header fill. `roles.input` / `roles.formula`: editing provenance, not financial performance. `roles.warning` / `roles.success`: semantic states that also need text or symbols.

Keep layout and content separate: margins, font sizes, coordinates, row heights, number formats and formulas do not become shared tokens.

## Current consumer mappings

### PDF (`pdf/scripts/make.py`, `apply_theme`)

The loader resolves packaged themes relative to its own script location. It maps `id` to `theme_id` and:

| Shared color | PDF token |
|---|---|
| `accent` | `accent` |
| `surface` | `accent_lt` |
| `foreground` | `dark` |
| `muted` | `muted` |
| `background` | `page_bg`, `cover_fg` |
| `primary` | `cover_bg` |

It does not replace `body_text`, fonts, chart colors or spacing. In particular, the shared `fonts` list is not font registration and `foreground` is not a promise that every PDF text element uses it. Never rename these fields to a PDF-specific schema.

### PowerPoint (`pptx-generator/scripts/theme-loader.js`, `loadTheme`)

| Shared color | Loader output |
|---|---|
| `primary` | `primary` |
| `foreground` | `secondary` |
| `accent` | `accent` |
| `surface` | `light` |
| `background` | `bg` |

The loader strips the leading `#` and uppercases the six hex digits. Shared `secondary`, fonts, roles, charts and spacing are not consumed by this loader. Use the destination Skill for explicit font and chart setup; do not confuse a successful palette read with a generated PPTX.

### Excel and Word

There is no automatic shared-token reader in the current XLSX workflow or `write_word`. Map only supported native styles after validating the theme and inspecting the destination files/tools.

For `write_excel.colors`, a deliberate mapping is: resolved `roles.table_header` to `headerFill`, `background` to `headerFont` for these dark-header themes, `accent` to `headerBorder`, `surface` to `zebraFill`, `border` to `borderColor`. Remove `#` and prefix `FF` to make opaque `FFRRGGBB`. This mapping is not performed by the theme validator. These overrides do not style inputs, formulas, fonts or charts; those require the XLSX workflow. The shared roles keep input `#0000FF` and formula `#000000`; cross-sheet formulas remain the XLSX Skill's separate `00B050` convention.

`write_word.style` selects `docx/styles/` presets. Shared theme IDs are not interchangeable with that catalog. `write_pdf` exposes no shared-theme argument. Tool parameters, mode restrictions and artifact checks remain those of the host implementation, never those of this document.

## Validator result

Run the validator with an absolute script path built from the office-design directory returned by `invoke_skill` and an absolute theme file path. Do not run from an assumed installation directory.

Valid tokens emit `{"status": "ok", "errors": []}` to stdout and exit `0`. Invalid tokens emit `{"status": "error", "errors": [...]}` to stdout and exit `1`. File, UTF-8 and JSON parse failures emit the error report to stderr and exit `2`. No path normalization, token repair, input mutation or output file creation occurs.

Implementation references: Python 3.13 [JSON decoding](https://docs.python.org/3.13/library/json.html#json.loads), [full-string regex validation](https://docs.python.org/3.13/library/re.html#re.fullmatch), and [finite-number checks](https://docs.python.org/3.13/library/math.html#math.isfinite). Consumer mappings above are grounded in the accompanying Firefly source, not in a generic format library's capabilities.
