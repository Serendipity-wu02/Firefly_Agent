from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from ai_manager import AISettings
from state import CharacterState


@dataclass
class WindowSettings:
    x: int | None = None
    y: int | None = None
    pet_scale: float = 1.0


@dataclass
class StartupSettings:
    enabled: bool = False


@dataclass
class CharacterSettings:
    energy: int = 72
    hunger: int = 25
    mood: str = "calm"
    affection: int = 50
    attention: int = 70
    current_action: str = "idle"
    health: str = "healthy"
    form: str = "normal"
    transform_state: str = "stable"
    last_state_update: str | None = None
    last_interaction: str | None = None

    @classmethod
    def from_state(cls, state: CharacterState) -> CharacterSettings:
        return cls(
            energy=state.energy,
            hunger=state.hunger,
            mood=state.mood,
            affection=state.affection,
            attention=state.attention,
            current_action=state.current_action,
            health=state.health.value,
            form=state.form.value,
            transform_state=state.transform_state.value,
            last_state_update=state.last_state_update.isoformat() if state.last_state_update else None,
            last_interaction=state.last_interaction.isoformat()
            if state.last_interaction is not None
            else None,
        )

    def to_state(self) -> CharacterState:
        last_interaction = (
            datetime.fromisoformat(self.last_interaction)
            if self.last_interaction is not None
            else None
        )
        return CharacterState(
            energy=self.energy,
            hunger=self.hunger,
            mood=self.mood,
            affection=self.affection,
            attention=self.attention,
            current_action=self.current_action,
            health=self.health,
            form=self.form,
            transform_state=self.transform_state,
            last_state_update=datetime.fromisoformat(self.last_state_update) if self.last_state_update else None,
            last_interaction=last_interaction,
        )


@dataclass
class AppSettings:
    ai: AISettings = field(default_factory=AISettings)
    window: WindowSettings = field(default_factory=WindowSettings)
    startup: StartupSettings = field(default_factory=StartupSettings)
    character: CharacterSettings = field(default_factory=CharacterSettings)


class SettingsStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.last_error: str | None = None

    def load(self) -> AppSettings:
        if not self.path.exists():
            return AppSettings()

        data = json.loads(self.path.read_text(encoding="utf-8"))
        return AppSettings(
            ai=AISettings(**self._section(data, "ai")),
            window=WindowSettings(**self._section(data, "window")),
            startup=StartupSettings(**self._section(data, "startup")),
            character=CharacterSettings(**self._section(data, "character")),
        )

    def save(self, settings: AppSettings) -> bool:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(
                json.dumps(asdict(settings), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError as error:
            self.last_error = str(error)
            print(f"Settings save failed: {self.last_error}")
            return False

        self.last_error = None
        return True

    def _section(self, data: dict[str, Any], name: str) -> dict[str, Any]:
        section = data.get(name, {})
        if not isinstance(section, dict):
            raise ValueError(f"settings.{name} must be an object")
        return section