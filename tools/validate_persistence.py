from __future__ import annotations

import sys
import tempfile
from pathlib import Path


def main() -> int:
    project_dir = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(project_dir))

    from ai_manager import AIManager, LocalRuleProvider
    from chat_history import ChatHistoryStore
    from dialogue import LocalDialogueManager
    from memory import MemoryStore
    from state import CharacterState

    with tempfile.TemporaryDirectory() as temporary_directory:
        root = Path(temporary_directory)
        history_store = ChatHistoryStore(root / "chat_history.json")
        memory_store = MemoryStore(root / "memory.json")

        if not memory_store.remember("称呼", "小明"):
            raise AssertionError("memory save failed")

        manager = LocalDialogueManager(
            ai_manager=AIManager(provider=LocalRuleProvider()),
            action_ids=("idle", "happy", "thinking", "sleepy", "surprised", "dragged"),
            history_store=history_store,
            memory_store=memory_store,
        )
        manager.reply("你好", CharacterState())

        restored_history = history_store.load()
        restored_memory = MemoryStore(root / "memory.json")
        if len(restored_history) != 3:
            raise AssertionError("chat history round-trip failed")
        if restored_memory.items["称呼"].value != "小明":
            raise AssertionError("memory round-trip failed")
        if "称呼：小明" not in restored_memory.prompt_context():
            raise AssertionError("memory prompt context failed")

        if not history_store.clear() or history_store.load():
            raise AssertionError("chat history clear failed")

    print("Persistence validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
