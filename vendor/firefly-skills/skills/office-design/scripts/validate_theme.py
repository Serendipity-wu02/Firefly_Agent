from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any


REQUIRED: dict[str, tuple[str, ...]] = {
    "colors": ("primary", "secondary", "accent", "background", "surface", "foreground", "muted", "border"),
    "fonts": ("cjk", "latin", "fallback"),
    "spacing": ("base",),
    "roles": ("table_header", "input", "formula", "warning", "success"),
}


def is_color(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"#[0-9A-Fa-f]{6}", value) is not None


def validate_theme(theme: Any) -> list[str]:
    if not isinstance(theme, dict):
        return ["theme must be an object"]

    errors: list[str] = []
    if "id" not in theme:
        errors.append("id is required")
    elif not isinstance(theme["id"], str) or not theme["id"].strip():
        errors.append("id must be a nonblank string")

    colors = theme.get("colors")
    if not isinstance(colors, dict):
        colors = {}

    for section, keys in REQUIRED.items():
        if section not in theme:
            errors.append(f"{section} is required")
            continue

        fields = theme[section]
        if not isinstance(fields, dict):
            errors.append(f"{section} must be an object")
            continue

        for key in keys:
            label = f"{section}.{key}"
            if key not in fields:
                errors.append(f"{label} is required")
                continue

            value = fields[key]
            if section == "colors":
                if not is_color(value):
                    errors.append(f"{label} must be #RRGGBB")
            elif section == "fonts":
                if not isinstance(value, list) or not value or not all(
                    isinstance(font, str) and font.strip() for font in value
                ):
                    errors.append(f"{label} must be a nonempty array of nonblank strings")
            elif section == "spacing":
                if type(value) not in (int, float) or value <= 0 or (
                    isinstance(value, float) and not math.isfinite(value)
                ):
                    errors.append(f"{label} must be a finite positive number")
            elif section == "roles":
                if not is_color(value) and not (
                    isinstance(value, str) and value in colors and is_color(colors[value])
                ):
                    errors.append(f"{label} must be #RRGGBB or an existing colors key")

    chart_colors = theme.get("chart_colors")
    if "chart_colors" not in theme or chart_colors == []:
        errors.append("chart_colors is required")
    elif not isinstance(chart_colors, list) or not chart_colors or not all(map(is_color, chart_colors)):
        errors.append("chart_colors must be a nonempty array of #RRGGBB colors")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Read and validate Office theme tokens without modifying the file.")
    parser.add_argument("theme", type=Path, help="UTF-8 theme JSON path")
    args = parser.parse_args()
    try:
        theme = json.loads(args.theme.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        print(json.dumps({"status": "error", "errors": [str(error)]}), file=sys.stderr)
        return 2
    errors = validate_theme(theme)
    print(json.dumps({"status": "ok" if not errors else "error", "errors": errors}, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
