from __future__ import annotations

import sys
from pathlib import Path

from PySide6.QtGui import QImage


def main() -> int:
    project_dir = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(project_dir))

    from actions import firefly_actions

    actions = firefly_actions(project_dir)

    for action_id, action in actions.items():
        if not action.frames:
            raise ValueError(f"Action has no frames: {action_id}")

        for frame_path in action.frames:
            image = QImage(str(frame_path))
            if image.isNull():
                raise FileNotFoundError(f"Action frame cannot be loaded: {frame_path}")

        print(f"{action_id}: {len(action.frames)} frame(s)")

    print("Firefly assets validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())