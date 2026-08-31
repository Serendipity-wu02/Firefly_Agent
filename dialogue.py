from __future__ import annotations

from dataclasses import dataclass

from ai_manager import AIManager, AIMessage, LocalRuleProvider
from chat_history import ChatHistoryStore
from intent import ActionIntentParser
from memory import MemoryStore
from state import CharacterState


@dataclass(frozen=True)
class DialogueReply:
    text: str
    action_id: str


class LocalDialogueManager:
    def __init__(
        self,
        ai_manager: AIManager | None = None,
        action_ids: tuple[str, ...] = (),
        history_store: ChatHistoryStore | None = None,
        memory_store: MemoryStore | None = None,
        character_context: str = "",
    ) -> None:
        self.ai_manager = ai_manager or AIManager(provider=LocalRuleProvider())
        self.intent_parser = ActionIntentParser(action_ids=action_ids) if action_ids else ActionIntentParser()
        self.history_store = history_store
        self.memory_store = memory_store
        self.ai_manager.character_context = character_context
        self.ai_manager.available_actions = tuple(self.intent_parser.action_ids)
        if self.history_store is not None:
            self.ai_manager.history = self.history_store.load()
        if self.memory_store is not None:
            self.ai_manager.memory_context = self.memory_store.prompt_context()
            if self.ai_manager.history and self.ai_manager.history[0].role == "system":
                system_prompt = self.ai_manager._system_prompt()
                self.ai_manager.history[0] = AIMessage(
                    role="system",
                    content=system_prompt,
                )

    def refresh_memory_context(self) -> None:
        """Pushes updated memories into the system prompt of the live session."""
        if self.memory_store is None:
            return
        self.ai_manager.memory_context = self.memory_store.prompt_context()
        if self.ai_manager.history and self.ai_manager.history[0].role == "system":
            self.ai_manager.history[0] = AIMessage(
                role="system",
                content=self.ai_manager._system_prompt(),
            )

    def reply(self, message: str, state: CharacterState) -> DialogueReply:
        ai_reply = self.ai_manager.send_message(message)
        if self.history_store is not None:
            self.history_store.save(self.ai_manager.history)
        intent = self.intent_parser.parse(ai_reply)

        if state.attention < 35 and intent.action_id == "idle":
            return DialogueReply(text="你终于叫我啦，我刚刚还以为你忘记我了。", action_id="surprised")

        return DialogueReply(text=intent.text, action_id=intent.action_id)
