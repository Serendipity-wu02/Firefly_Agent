from __future__ import annotations

import json
import urllib.error
import urllib.request

from ai_manager import AIMessage, AIReply, AISettings


DEFAULT_DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions"
DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro"


class DeepSeekProvider:
    id = "deepseek"

    def __init__(self, settings: AISettings) -> None:
        self.settings = settings

    def chat(self, messages: tuple[AIMessage, ...]) -> AIReply:
        if not self.settings.api_key:
            return AIReply(
                text="DeepSeek API Key 还没有设置。请在聊天窗口的设置里填写 API Key。",
                action_id="thinking",
            )

        endpoint = self.settings.endpoint or DEFAULT_DEEPSEEK_ENDPOINT
        model = self.settings.model or DEFAULT_DEEPSEEK_MODEL
        payload = {
            "model": model,
            "messages": [
                {"role": message.role, "content": message.content}
                for message in messages
            ],
            "stream": False,
        }

        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.settings.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                response_data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            return AIReply(
                text=f"DeepSeek 请求失败：HTTP {error.code}。{detail}",
                action_id="thinking",
            )
        except OSError as error:
            return AIReply(
                text=f"DeepSeek 请求失败：{error}",
                action_id="thinking",
            )

        text = self._extract_text(response_data)
        return AIReply(text=text, action_id="idle", raw=response_data)

    def _extract_text(self, response_data: object) -> str:
        if not isinstance(response_data, dict):
            raise ValueError("DeepSeek response must be an object")

        choices = response_data.get("choices")
        if not isinstance(choices, list) or not choices:
            raise ValueError("DeepSeek response.choices must be a non-empty array")

        first_choice = choices[0]
        if not isinstance(first_choice, dict):
            raise ValueError("DeepSeek response.choices[0] must be an object")

        message = first_choice.get("message")
        if not isinstance(message, dict):
            raise ValueError("DeepSeek response.choices[0].message must be an object")

        content = message.get("content")
        if not isinstance(content, str):
            raise ValueError("DeepSeek response.choices[0].message.content must be a string")

        return content