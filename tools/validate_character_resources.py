from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    project_dir = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(project_dir))

    from character_resources import CharacterResourceStore

    resource_store = CharacterResourceStore(project_dir)
    sources = resource_store.available_sources()
    if len(sources) != 3:
        raise AssertionError(f"expected 3 character resource sources, found {len(sources)}")

    context = resource_store.prompt_context()
    for section in ("角色设定", "背景故事线", "角色关系档案"):
        if section not in context:
            raise AssertionError(f"missing context section: {section}")

    print("Character resources validated; fixed voice files removed in favor of dynamic AI Voice")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
