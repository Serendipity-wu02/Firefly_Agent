from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

MEMORY_PATTERNS = (
    (re.compile(r"(?:我叫|我的名字[叫是]|请叫我)([\u4e00-\u9fffA-Za-z0-9]{1,12})"), "用户名字"),
    (re.compile(r"(?:我的生日是|我生日是)([0-9]{1,4}[月日号]?[0-9]{0,4})"), "用户生日"),
    (re.compile(r"(?:我喜欢|我最喜欢|我超喜欢)([^，。！？!?,.、\s]{1,12})"), "用户喜好"),
    (re.compile(r"(?:我讨厌|我不喜欢)([^，。！？!?,.、\s]{1,12})"), "用户忌讳"),
)


def extract_memories(text: str) -> list[tuple[str, str]]:
    """Heuristically extracts durable user facts from a chat message."""
    found: list[tuple[str, str]] = []
    seen: set[str] = set()
    for pattern, key in MEMORY_PATTERNS:
        match = pattern.search(text)
        if match is None:
            continue
        value = match.group(1).strip()
        if not value or value in seen:
            continue
        seen.add(value)
        found.append((key, value))
    return found


@dataclass(frozen=True)
class MemoryItem:
    key: str
    value: str
    updated_at: str


class MemoryStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.items: dict[str, MemoryItem] = {}
        self.load()

    def load(self) -> None:
        self.items.clear()
        if not self.path.exists():
            return

        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return

        if not isinstance(data, list):
            return

        for item in data:
            if not isinstance(item, dict):
                continue
            key = item.get("key")
            value = item.get("value")
            updated_at = item.get("updated_at")
            if all(isinstance(field, str) for field in (key, value, updated_at)):
                self.items[key] = MemoryItem(key=key, value=value, updated_at=updated_at)

    def remember(self, key: str, value: str) -> bool:
        normalized_key = key.strip()
        normalized_value = value.strip()
        if not normalized_key or not normalized_value:
            return False

        self.items[normalized_key] = MemoryItem(
            key=normalized_key,
            value=normalized_value,
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        return self.save()

    def forget(self, key: str) -> bool:
        self.items.pop(key.strip(), None)
        return self.save()

    def save(self) -> bool:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            payload = [asdict(item) for item in self.items.values()]
            self.path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError:
            return False
        return True

    def prompt_context(self) -> str:
        if not self.items:
            return ""
        lines = ["你可以参考这些已保存的陪伴记忆："]
        lines.extend(f"- {item.key}：{item.value}" for item in self.items.values())
        return "\n".join(lines)
