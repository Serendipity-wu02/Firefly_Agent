from __future__ import annotations

from pathlib import Path


class CharacterResourceStore:
    """Loads the local character profile without making it part of app settings."""

    def __init__(self, project_dir: Path, context_limit: int = 18000) -> None:
        self.project_dir = project_dir
        self.resource_dir = project_dir / "resources"
        self.context_limit = context_limit

    def prompt_context(self) -> str:
        sections = (
            ("角色设定", self.resource_dir / "firefly.yaml", 9000),
            ("背景故事线", self.resource_dir / "knowledge" / "firefly_lore.md", 5500),
            ("角色关系档案", self.resource_dir / "knowledge" / "facts.yaml", 3500),
        )
        parts: list[str] = []
        remaining = self.context_limit
        for title, path, section_limit in sections:
            if remaining <= 0:
                break
            content = self._read_text(path)
            if not content:
                continue
            limit = min(section_limit, remaining)
            parts.append(f"【{title}】\n{content[:limit]}")
            remaining -= limit
        return "\n\n".join(parts)

    def available_sources(self) -> tuple[Path, ...]:
        return tuple(
            path
            for path in (
                self.resource_dir / "firefly.yaml",
                self.resource_dir / "knowledge" / "firefly_lore.md",
                self.resource_dir / "knowledge" / "facts.yaml",
            )
            if path.is_file()
        )

    def _read_text(self, path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError):
            return ""
