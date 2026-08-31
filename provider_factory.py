from __future__ import annotations

from ai_manager import AIManager, AIMessage, AIProvider, AIReply, AISettings, LocalRuleProvider
from deepseek_provider import DeepSeekProvider


class MissingConfiguredProvider:
    id = "missing"

    def __init__(self, settings: AISettings) -> None:
        self.settings = settings

    def chat(self, messages: tuple[AIMessage, ...]) -> AIReply:
        provider_id = self.settings.provider_id or "未设置"
        return AIReply(
            text=f"AI provider「{provider_id}」还没有接入。先把 API 的请求和响应结构给我，我再精确实现。",
            action_id="thinking",
        )


def build_ai_manager(settings: AISettings) -> AIManager:
    provider = build_provider(settings)
    return AIManager(provider=provider, settings=settings)


def build_provider(settings: AISettings) -> AIProvider:
    if settings.provider_id in ("", LocalRuleProvider.id):
        return LocalRuleProvider()

    if settings.provider_id == DeepSeekProvider.id:
        return DeepSeekProvider(settings)

    return MissingConfiguredProvider(settings)