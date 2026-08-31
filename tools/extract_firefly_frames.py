from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import QRect
from PySide6.QtGui import QImage


FRAME_RECTS: dict[str, tuple[QRect, ...]] = {
    "idle": (
        QRect(24, 456, 146, 145),
        QRect(176, 456, 146, 145),
        QRect(328, 456, 146, 145),
        QRect(480, 456, 146, 145),
    ),
    "happy": (
        QRect(20, 672, 145, 148),
        QRect(170, 672, 145, 148),
        QRect(1020, 188, 145, 148),
    ),
    "thinking": (
        QRect(1060, 215, 145, 142),
        QRect(692, 672, 145, 148),
        QRect(840, 456, 140, 148),
    ),
    "sleepy": (
        QRect(610, 450, 170, 155),
        QRect(617, 675, 130, 145),
    ),
    "surprised": (
        QRect(1240, 25, 135, 150),
        QRect(1390, 25, 135, 150),
    ),
    "dragged": (
        QRect(324, 670, 165, 150),
        QRect(468, 670, 150, 150),
    ),
}


def main() -> int:
    project_dir = Path(__file__).resolve().parents[1]
    asset_dir = project_dir / "assets" / "firefly"
    source_path = asset_dir / "firefly.png"

    source = QImage(str(source_path))
    if source.isNull():
        raise FileNotFoundError(f"Source image cannot be loaded: {source_path}")

    written = 0
    for action_id, rects in FRAME_RECTS.items():
        action_dir = asset_dir / action_id
        action_dir.mkdir(parents=True, exist_ok=True)

        for index, rect in enumerate(rects, start=1):
            frame_path = action_dir / f"frame_{index:03}.png"
            if not source.copy(rect).save(str(frame_path), "PNG"):
                raise OSError(f"Frame cannot be written: {frame_path}")
            written += 1

    print(f"wrote {written} frames")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())