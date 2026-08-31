from __future__ import annotations

import re
from dataclasses import dataclass

from actions import AI_ALLOWED_ACTIONS
from ai_manager import AIReply


ACTION_DIRECTIVE_PATTERN = re.compile(r"\[action:([^\]\s]+)\]")
DEFAULT_ACTION_IDS = AI_ALLOWED_ACTIONS


@dataclass(frozen=True)
class ActionIntent:
    text: str
    action_id: str


class ActionIntentParser:
    def __init__(
        self,
        action_ids: tuple[str, ...] = DEFAULT_ACTION_IDS,
        default_action_id: str = "idle",
    ) -> None:
        if default_action_id not in action_ids:
            raise ValueError(f"default action id is not available: {default_action_id}")

        self.action_ids = frozenset(action_ids)
        self.default_action_id = default_action_id

    def parse(self, reply: AIReply) -> ActionIntent:
        marker_action_id = self._marker_action_id(reply.text)
        reply_action_id = self._validated_action_id(reply.action_id)
        text = ACTION_DIRECTIVE_PATTERN.sub("", reply.text).strip()

        return ActionIntent(
            text=text,
            action_id=marker_action_id or reply_action_id,
        )

    def _marker_action_id(self, text: str) -> str | None:
        for match in ACTION_DIRECTIVE_PATTERN.finditer(text):
            action_id = match.group(1)
            if action_id in self.action_ids:
                return action_id

        return None

    def _validated_action_id(self, action_id: str) -> str:
        if action_id in self.action_ids:
            return action_id

        return self.default_action_id