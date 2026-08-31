from __future__ import annotations

import sys
from pathlib import Path


REQUIRED_DIRECTORIES = (
    "models",
    "effects/fire",
    "effects/ember",
    "effects/firefly",
    "effects/combustion",
    "effects/transformation",
    "audio/interaction",
    "audio/special",
    "audio/system",
    "ui/icons",
    "ui/buttons",
    "ui/bubbles",
    "ui/status",
    "ui/dialogue",
    "ui/backgrounds",
)


def main() -> int:
    project_dir = Path(__file__).resolve().parents[1]
    asset_root = project_dir / "assets" / "firefly"
    missing = [directory for directory in REQUIRED_DIRECTORIES if not (asset_root / directory).is_dir()]
    if missing:
        print("Missing asset directories:")
        print("\n".join(missing))
        return 1

    print(f"Asset structure validated: {len(REQUIRED_DIRECTORIES)} directories (Live2D-only character architecture)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
