from __future__ import annotations

import json
from pathlib import Path

from ai_manager import AIMessage


class ChatHistoryStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> list[AIMessage]:
        if not self.path.exists():
            return []

        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []

        if not isinstance(data, list):
            return []

        messages: list[AIMessage] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if isinstance(role, str) and isinstance(content, str):
                messages.append(AIMessage(role=role, content=content))
        return messages

    def save(self, messages: list[AIMessage]) -> bool:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            payload = [{"role": item.role, "content": item.content} for item in messages]
            self.path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError:
            return False
        return True

    def clear(self) -> bool:
        try:
            if self.path.exists():
                self.path.unlink()
        except OSError:
            return False
        return True
