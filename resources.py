from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


FRAME_FILE_PATTERN = re.compile(r"^frame_(\d{3})\.png$")


@dataclass(frozen=True)
class ActionFrameSet:
    action_id: str
    directory: Path
    frames: tuple[Path, ...]


class FireflyResourceCatalog:
    def __init__(self, project_dir: Path) -> None:
        self.project_dir = project_dir
        self.asset_dir = project_dir / "assets" / "firefly"

    def action_frames(
        self,
        action_id: str,
        form: str = "normal",
        fallback_action_id: str | None = "idle",
    ) -> tuple[Path, ...]:
        frame_set = self.action_frame_set(
            action_id,
            form=form,
            fallback_action_id=fallback_action_id,
        )
        return frame_set.frames

    def action_frame_set(
        self,
        action_id: str,
        form: str = "normal",
        fallback_action_id: str | None = "idle",
    ) -> ActionFrameSet:
        primary_dir = self.asset_dir / form / action_id
        legacy_dir = self.asset_dir / action_id

        candidate_dirs: list[Path] = []
        if primary_dir.is_dir():
            candidate_dirs.append(primary_dir)
        if legacy_dir != primary_dir and legacy_dir.is_dir():
            candidate_dirs.append(legacy_dir)

        for directory in candidate_dirs:
            numbered_frames = self._numbered_frames(directory)
            if numbered_frames:
                self._validate_continuous_frames(action_id, numbered_frames)
                return ActionFrameSet(
                    action_id=action_id,
                    directory=directory,
                    frames=tuple(path for _, path in numbered_frames),
                )

        for directory in candidate_dirs:
            legacy_frames = self._legacy_frames(directory)
            if legacy_frames:
                return ActionFrameSet(
                    action_id=action_id,
                    directory=directory,
                    frames=tuple(legacy_frames),
                )

        if fallback_action_id is not None:
            fallback_candidates = (
                self.asset_dir / form / fallback_action_id,
                self.asset_dir / fallback_action_id,
            )
            own_dirs = set(candidate_dirs)
            for stage in ("numbered", "legacy"):
                for directory in fallback_candidates:
                    if directory in own_dirs or not directory.is_dir():
                        continue
                    if stage == "numbered":
                        numbered_frames = self._numbered_frames(directory)
                        if not numbered_frames:
                            continue
                        self._validate_continuous_frames(f"{action_id} (fallback)", numbered_frames)
                        return ActionFrameSet(
                            action_id=action_id,
                            directory=directory,
                            frames=tuple(path for _, path in numbered_frames),
                        )
                    legacy_frames = self._legacy_frames(directory)
                    if legacy_frames:
                        return ActionFrameSet(
                            action_id=action_id,
                            directory=directory,
                            frames=tuple(legacy_frames),
                        )

        raise FileNotFoundError(f"Action directory has no PNG frames for: {action_id}")

    def validate_actions(self, action_ids: tuple[str, ...]) -> tuple[ActionFrameSet, ...]:
        return tuple(self.action_frame_set(action_id) for action_id in action_ids)

    def _numbered_frames(self, action_dir: Path) -> list[tuple[int, Path]]:
        numbered_frames: list[tuple[int, Path]] = []

        for path in action_dir.iterdir():
            if not path.is_file():
                continue

            match = FRAME_FILE_PATTERN.fullmatch(path.name)
            if match is None:
                continue

            numbered_frames.append((int(match.group(1)), path))

        numbered_frames.sort(key=lambda item: item[0])
        return numbered_frames


    def _legacy_frames(self, action_dir: Path) -> list[Path]:
        return sorted(
            (path for path in action_dir.iterdir() if path.is_file() and path.suffix.lower() == ".png"),
            key=lambda path: path.name,
        )
    def _validate_continuous_frames(

        self,
        action_id: str,
        numbered_frames: list[tuple[int, Path]],
    ) -> None:
        expected_indexes = tuple(range(1, len(numbered_frames) + 1))
        actual_indexes = tuple(index for index, _ in numbered_frames)

        if actual_indexes == expected_indexes:
            return

        expected_text = ", ".join(f"frame_{index:03}.png" for index in expected_indexes)
        actual_text = ", ".join(f"frame_{index:03}.png" for index in actual_indexes)
        raise ValueError(
            f"Action frames must be continuous for {action_id}. "
            f"Expected: {expected_text}. Actual: {actual_text}."
        )