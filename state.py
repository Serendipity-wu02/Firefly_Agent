from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from random import choices, random


class HealthStatus(str, Enum):
    HEALTHY = "healthy"
    TIRED = "tired"
    SICK = "sick"
    TREATMENT = "treatment"
    RECOVERED = "recovered"


class PetForm(str, Enum):
    NORMAL = "normal"


class TransformState(str, Enum):
    STABLE = "stable"


@dataclass
class CharacterState:
    energy: int = 72
    hunger: int = 25
    mood: str = "calm"
    affection: int = 50
    attention: int = 70
    current_action: str = "idle"
    health: HealthStatus = HealthStatus.HEALTHY
    form: PetForm = PetForm.NORMAL
    transform_state: TransformState = TransformState.STABLE
    last_interaction: datetime | None = None
    last_state_update: datetime | None = None

    def __post_init__(self) -> None:
        self.health = HealthStatus(self.health)
        self.form = PetForm(self.form)
        self.transform_state = TransformState(self.transform_state)
        if self.last_state_update is None:
            self.last_state_update = datetime.now(timezone.utc)

    def tick(self) -> None:
        self.apply_elapsed(15)

    def apply_elapsed(self, minutes: int) -> None:
        elapsed_minutes = max(0, int(minutes))
        decay_steps = elapsed_minutes // 15
        if decay_steps:
            self.energy = max(0, self.energy - decay_steps)
            self.hunger = min(100, self.hunger + decay_steps)
            self.attention = max(0, self.attention - decay_steps * 2)
            self._refresh_health()
        self.last_state_update = datetime.now(timezone.utc)

    def apply_offline_time(self, now: datetime | None = None) -> int:
        current_time = now or datetime.now(timezone.utc)
        if current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=timezone.utc)
        previous_time = self.last_state_update or current_time
        if previous_time.tzinfo is None:
            previous_time = previous_time.replace(tzinfo=timezone.utc)
        elapsed_minutes = max(0, int((current_time - previous_time).total_seconds() // 60))
        self.apply_elapsed(elapsed_minutes)
        self.last_state_update = current_time
        return elapsed_minutes

    def feed(self) -> str:
        self.hunger = max(0, self.hunger - 28)
        self.energy = min(100, self.energy + 5)
        self.affection = min(100, self.affection + 2)
        self.attention = min(100, self.attention + 5)
        self.mood = "eating"
        self.last_interaction = datetime.now(timezone.utc)
        self._refresh_health()
        return "eating"

    def rest(self) -> str:
        self.energy = min(100, self.energy + 35)
        self.attention = min(100, self.attention + 8)
        self.mood = "resting"
        self.last_interaction = datetime.now(timezone.utc)
        self._refresh_health()
        return "resting"

    def treatment(self) -> str:
        self.health = HealthStatus.TREATMENT
        self.energy = min(100, self.energy + 12)
        self.hunger = min(100, self.hunger + 3)
        self.mood = "treatment"
        self.last_interaction = datetime.now(timezone.utc)
        self.health = HealthStatus.RECOVERED
        return "treatment"

    def react_to_click(self) -> str:
        was_attention_low = self.attention < 35
        was_energy_low = self.energy < 30
        self.affection = min(100, self.affection + 3)
        self.attention = min(100, self.attention + 15)
        self.last_interaction = datetime.now(timezone.utc)

        if self.health == HealthStatus.SICK:
            self.mood = "sick"
            return "sick"
        if was_energy_low:
            self.mood = "sleepy"
            return "sleepy"
        if was_attention_low:
            self.mood = "surprised"
            return "surprised"
        if self.affection >= 75 and random() < 0.35:
            self.mood = "touched"
            return "touched"
        if self.health == HealthStatus.TIRED and random() < 0.4:
            self.mood = "tired"
            return "tired"
        self.mood = "happy"
        return "happy"

    def react_to_pet(self) -> str:
        was_stranger = self.affection < 60
        self.affection = min(100, self.affection + 2)
        self.attention = min(100, self.attention + 18)
        self.last_interaction = datetime.now(timezone.utc)

        if self.health == HealthStatus.SICK:
            self.mood = "sick"
            return "sick"
        if was_stranger:
            self.mood = "surprised"
            return "surprised"
        if random() < 0.5:
            self.mood = "shy"
            return "shy"
        self.mood = "touched"
        return "touched"

    def react_to_message(self, action_id: str) -> str:
        self.affection = min(100, self.affection + 1)
        self.attention = min(100, self.attention + 25)
        self.mood = action_id
        self.last_interaction = datetime.now(timezone.utc)
        return action_id

    def react_to_drag_finished(self) -> str:
        self.energy = max(0, self.energy - 4)
        self.mood = "dragged"
        self.last_interaction = datetime.now(timezone.utc)
        return "dragged"

    def choose_idle_action(self) -> str:
        weighted_actions = {"idle": 42, "thinking": 16, "happy": 12, "sleepy": 8, "surprised": 6}
        if self.energy < 30:
            weighted_actions["sleepy"] += 28
        if self.attention < 35:
            weighted_actions["surprised"] += 20
        if self.affection > 70:
            weighted_actions["happy"] += 12
        if self.hunger > 75:
            weighted_actions["hungry"] = weighted_actions.get("hungry", 0) + 18
        elif self.hunger > 55:
            weighted_actions["hungry"] = weighted_actions.get("hungry", 0) + 8
        if self.health == HealthStatus.SICK:
            weighted_actions["sick"] = weighted_actions.get("sick", 0) + 26
        elif self.health == HealthStatus.TIRED:
            weighted_actions["tired"] = weighted_actions.get("tired", 0) + 16
        if self.mood == "sad" or self.health == HealthStatus.RECOVERED:
            weighted_actions["thinking"] += 8
        if self.affection >= 85 and random() < 0.25:
            weighted_actions["waving"] = weighted_actions.get("waving", 0) + 10
        actions = tuple(weighted_actions.keys())
        weights = tuple(weighted_actions.values())
        return choices(actions, weights=weights, k=1)[0]

    def unlocked_features(self) -> tuple[str, ...]:
        unlocked = ["basic_care"]
        if self.affection >= 90:
            unlocked.append("special_dialogue")
        return tuple(unlocked)

    def proactive_action(self) -> str | None:
        if self.health == HealthStatus.SICK:
            return "sick"
        if self.energy <= 20:
            return "tired"
        if self.hunger >= 85:
            return "hungry"
        if self.attention <= 20:
            return "attention"
        if self.is_ignored():
            return "ignored"
        return None

    def is_ignored(self, now: datetime | None = None, idle_minutes: int = 8) -> bool:
        if self.last_interaction is None:
            return False
        current_time = now or datetime.now(timezone.utc)
        if current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=timezone.utc)
        last_time = self.last_interaction
        if last_time.tzinfo is None:
            last_time = last_time.replace(tzinfo=timezone.utc)
        silent_minutes = (current_time - last_time).total_seconds() / 60
        return silent_minutes >= idle_minutes and self.attention < 60

    def _refresh_health(self) -> None:
        if self.health == HealthStatus.TREATMENT:
            return
        if self.energy <= 15 or self.hunger >= 92:
            self.health = HealthStatus.SICK
        elif self.energy <= 35 or self.hunger >= 75:
            self.health = HealthStatus.TIRED
        elif self.health in (HealthStatus.TIRED, HealthStatus.SICK, HealthStatus.RECOVERED):
            self.health = HealthStatus.RECOVERED
        else:
            self.health = HealthStatus.HEALTHY
