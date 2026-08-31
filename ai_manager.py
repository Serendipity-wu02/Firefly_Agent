from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


DEFAULT_SYSTEM_PROMPT = (
    "你是流萤，陪伴在用户桌面旁边的少女。用流萤本人的口吻回复：轻松、简短、亲近，一般不超过两句话。"
    "你可以在回复末尾添加一个动作意图标记，格式为 [action:动作id]，"
    "只使用系统提示中列出的可用动作 id，不要解释标记含义。"
    "你的自我认知、经历和说话方式完全以下方角色资料为准。"
)


@dataclass(frozen=True)
class AIMessage:
    role: str
    content: str


@dataclass(frozen=True)
class AIReply:
    text: str
    action_id: str
    raw: object | None = None


class AIProvider(Protocol):
    id: str

    def chat(self, messages: tuple[AIMessage, ...]) -> AIReply:
        pass


@dataclass
class AISettings:
    provider_id: str = "local"
    endpoint: str = ""
    model: str = ""
    api_key: str = ""
    system_prompt: str = DEFAULT_SYSTEM_PROMPT


@dataclass
class AIManager:
    provider: AIProvider
    settings: AISettings = field(default_factory=AISettings)
    history: list[AIMessage] = field(default_factory=list)
    memory_context: str = ""
    character_context: str = ""
    available_actions: tuple[str, ...] = ()

    def send_message(self, content: str) -> AIReply:
        if not self.history:
            self.history.append(
                AIMessage(role="system", content=self._system_prompt())
            )

        self.history.append(AIMessage(role="user", content=content))
        reply = self.provider.chat(tuple(self.history))
        self.history.append(AIMessage(role="assistant", content=reply.text))
        return reply

    def generate_proactive(self, instruction: str) -> AIReply:
        """Generates a one-off proactive line without touching the chat history."""
        messages = (
            AIMessage(role="system", content=self._system_prompt()),
            AIMessage(role="user", content=instruction),
        )
        return self.provider.chat(messages)

    def _system_prompt(self) -> str:
        sections = [DEFAULT_SYSTEM_PROMPT]
        if self.available_actions:
            sections.append("可用动作 id：" + "、".join(self.available_actions) + "。")
        if self.character_context:
            sections.append(self.character_context)
        if self.memory_context:
            sections.append(self.memory_context)
        return "\n\n".join(sections)

    def clear_history(self) -> None:
        self.history.clear()


class LocalRuleProvider:
    id = "local"

    def chat(self, messages: tuple[AIMessage, ...]) -> AIReply:
        last_user_message = self._last_user_message(messages)
        normalized = last_user_message.strip().lower()

        if any(word in normalized for word in ("困", "睡", "累", "sleep")):
            return AIReply(text="有点困，但我还能陪你一会儿。", action_id="sleepy")

        if any(word in normalized for word in ("开心", "喜欢", "可爱", "摸", "happy")):
            return AIReply(text="嘿嘿，我有认真收到这份好心情。", action_id="happy")

        if any(word in normalized for word in ("？", "?", "为什么", "怎么", "如何", "think")):
            return AIReply(text="让我想一想，先把问题拆小一点。", action_id="thinking")

        return AIReply(
            text="我听见了。现在先走 AIManager 的本地 provider，之后再接真实 API。",
            action_id="idle",
        )

    def _last_user_message(self, messages: tuple[AIMessage, ...]) -> str:
        for message in reversed(messages):
            if message.role == "user":
                return message.content
        return ""
