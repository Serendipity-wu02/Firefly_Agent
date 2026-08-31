from __future__ import annotations

from dataclasses import dataclass

from PySide6.QtCore import QSize, Qt
from PySide6.QtGui import QPixmap

from actions import Action


@dataclass(frozen=True)
class AnimationFrame:
    pixmap: QPixmap


class AnimationPlayer:
    def __init__(self, target_size: QSize) -> None:
        self.target_size = target_size
        self._cache: dict[str, tuple[AnimationFrame, ...]] = {}

    def frame(self, action: Action, frame_index: int) -> QPixmap:
        frames = self._frames_for(action)
        return frames[frame_index % len(frames)].pixmap

    def _frames_for(self, action: Action) -> tuple[AnimationFrame, ...]:
        cached = self._cache.get(action.id)
        if cached is not None:
            return cached

        loaded_frames: list[AnimationFrame] = []
        for path in action.frames:
            pixmap = QPixmap(str(path))
            if pixmap.isNull():
                raise FileNotFoundError(f"Action frame cannot be loaded: {path}")

            loaded_frames.append(
                AnimationFrame(
                    pixmap=pixmap.scaled(
                        self.target_size,
                        Qt.KeepAspectRatio,
                        Qt.SmoothTransformation,
                    )
                )
            )

        if not loaded_frames:
            raise ValueError(f"Action has no frames: {action.id}")

        frames = tuple(loaded_frames)
        self._cache[action.id] = frames
        return frames