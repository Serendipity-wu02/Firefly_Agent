from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    project_dir = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(project_dir))

    from ai_manager import AIManager, AIReply, LocalRuleProvider
    from dialogue import LocalDialogueManager
    from intent import ActionIntentParser
    from state import CharacterState

    action_ids = ("idle", "happy", "thinking", "sleepy", "surprised", "dragged")
    parser = ActionIntentParser(action_ids=action_ids)

    marker_intent = parser.parse(AIReply(text="收到 [action:happy]", action_id="idle"))
    if marker_intent.text != "收到" or marker_intent.action_id != "happy":
        raise AssertionError("marker action intent failed")

    fallback_intent = parser.parse(AIReply(text="继续", action_id="unknown"))
    if fallback_intent.text != "继续" or fallback_intent.action_id != "idle":
        raise AssertionError("unknown action fallback failed")

    from actions import AI_ALLOWED_ACTIONS

    ai_parser = ActionIntentParser(action_ids=AI_ALLOWED_ACTIONS)
    invalid_marker = ai_parser.parse(AIReply(text="看我的 [action:unknown_action]", action_id="idle"))
    if invalid_marker.action_id != "idle":
        raise AssertionError("invalid action leaked through the AI whitelist")
    if "shy" not in ai_parser.action_ids or "waving" not in ai_parser.action_ids:
        raise AssertionError("expressive actions missing from the AI whitelist")

    prompt_actions = ("idle", "happy")
    manager_prompt = AIManager(provider=LocalRuleProvider(), available_actions=prompt_actions)
    system_text = manager_prompt._system_prompt()
    if "可用动作 id：idle、happy" not in system_text:
        raise AssertionError("available actions missing from system prompt")

    provider = type(
        "Provider",
        (),
        {
            "id": "test",
            "chat": lambda self, messages: AIReply(text="普通回复", action_id="idle"),
        },
    )
    manager = LocalDialogueManager(
        ai_manager=AIManager(provider=provider()),
        action_ids=action_ids,
    )
    reply = manager.reply("你好", CharacterState(attention=10))
    if reply.action_id != "surprised":
        raise AssertionError("low attention dialogue override failed")

    print("AI intent validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())