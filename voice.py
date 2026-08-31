from __future__ import annotations

import re
import time
from pathlib import Path
from random import choice

from PySide6.QtCore import QObject, QUrl
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer

EMOTION_TAG_PATTERN = re.compile(r"^【[^】]*】\s*")
CJK_PATTERN = re.compile(r"[\u4e00-\u9fff]")

AUTO_VOICE_COOLDOWN_MS = 30 * 60 * 1000


def line_text_from_filename(path: Path) -> str | None:
    """Extracts the spoken line from a voice file name like 【生气_angry】可是你看…….wav"""
    text = EMOTION_TAG_PATTERN.sub("", path.stem).strip()
    if not text:
        return None
    if not CJK_PATTERN.search(text):
        return None
    return text


def estimated_duration_ms(text: str) -> int:
    return min(12000, max(2600, 380 * len(text)))


class NormalVoicePlayer(QObject):
    """Plays the supplied normal-form voice lines by action emotion."""

    ACTION_DIRECTORIES = {
        "idle": "中立_neutral",
        "thinking": "中立_neutral",
        "reading": "中立_neutral",
        "talking": "中立_neutral",
        "attention": "中立_neutral",
        "surprised": "中立_neutral",
        "happy": "开心_happy",
        "touched": "开心_happy",
        "shy": "开心_happy",
        "waving": "开心_happy",
        "eating": "开心_happy",
        "sleepy": "难过_sad",
        "hungry": "难过_sad",
        "tired": "难过_sad",
        "sick": "难过_sad",
        "resting": "难过_sad",
        "ignored": "难过_sad",
        "dragged": "生气_angry",
    }

    def __init__(self, project_dir: Path) -> None:
        super().__init__()
        self.audio_root = project_dir / "assets" / "firefly" / "audio" / "normal"
        self.sam_audio_root = project_dir / "assets" / "firefly" / "audio" / "sam"
        self.audio_output = QAudioOutput(self)
        self.audio_output.setVolume(0.7)
        self.player = QMediaPlayer(self)
        self.player.setAudioOutput(self.audio_output)
        self.enabled = True
        self.auto_voice_cooldown_ms = AUTO_VOICE_COOLDOWN_MS
        self._last_file: Path | None = None
        self._active = False
        self._last_voice_monotonic: float | None = None

    def play_sam_combustion(self) -> bool:
        return self._play_file(self.sam_audio_root / "sam入场音乐.wav", force=True)

    def is_busy(self) -> bool:
        if not self._active:
            return False
        if self.player.mediaStatus() in (
            QMediaPlayer.MediaStatus.EndOfMedia,
            QMediaPlayer.MediaStatus.InvalidMedia,
            QMediaPlayer.MediaStatus.NoMedia,
        ):
            self._active = False
            return False
        return True

    def auto_voice_ready(self) -> bool:
        if self._last_voice_monotonic is None:
            return True
        elapsed_ms = (time.monotonic() - self._last_voice_monotonic) * 1000
        return elapsed_ms >= self.auto_voice_cooldown_ms

    def play_auto_line(self, action_id: str, prefer_text: str | None = None) -> str | None:
        """Plays an ambient voice line, but at most once per auto cooldown window."""
        if not self.auto_voice_ready():
            return None
        return self.play_for_action(action_id, prefer_text=prefer_text)

    def play_for_action(self, action_id: str, prefer_text: str | None = None) -> str | None:
        """Plays a random voice line for the action and returns its spoken text.

        A currently playing line is never interrupted; new triggers are skipped
        until playback finishes. When prefer_text is given, the line whose text
        overlaps most with it is preferred over a fully random pick.
        """
        if not self.enabled or self.is_busy():
            return None

        directory_name = self.ACTION_DIRECTORIES.get(action_id)
        if directory_name is None:
            return None

        directory = self.audio_root / directory_name
        files = tuple(directory.glob("*.wav")) if directory.is_dir() else ()
        if not files:
            return None

        candidates = [path for path in files if path != self._last_file] or list(files)
        path = None
        if prefer_text:
            path = self._best_matching_line(candidates, prefer_text)
        if path is None:
            path = choice(candidates)
        if not self._play_file(path):
            return None

        return line_text_from_filename(path)

    def _best_matching_line(self, candidates: list[Path], prefer_text: str) -> Path | None:
        normalized = prefer_text.strip()
        if len(normalized) < 2:
            return None

        grams = {normalized[index : index + 2] for index in range(len(normalized) - 1)}
        best_path: Path | None = None
        best_score = 0
        for path in candidates:
            text = line_text_from_filename(path)
            if not text:
                continue
            score = sum(1 for gram in grams if gram in text)
            if score > best_score:
                best_path = path
                best_score = score
        return best_path

    def _play_file(self, path: Path, force: bool = False) -> bool:
        if not self.enabled or not path.is_file():
            return False
        if self.is_busy() and not force:
            return False

        self.player.stop()
        self.player.setSource(QUrl.fromLocalFile(str(path)))
        self.player.play()
        self._last_file = path
        self._active = True
        self._last_voice_monotonic = time.monotonic()
        return True
