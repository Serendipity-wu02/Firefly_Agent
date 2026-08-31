from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from resources import FireflyResourceCatalog


@dataclass(frozen=True)
class Action:
    id: str
    label: str
    frames: tuple[Path, ...]
    frame_ms: int
    duration_ms: int
    priority: int
    interruptible: bool
    dialogue: tuple[str, ...] = ()
    loop: bool = False


def firefly_actions(project_dir: Path) -> dict[str, Action]:
    resources = FireflyResourceCatalog(project_dir)

    def normal(action_id: str, fallback: str = "idle") -> tuple[Path, ...]:
        return resources.action_frames(action_id, form="normal", fallback_action_id=fallback)

    def action(action_id: str, label: str, frames: tuple[Path, ...], frame_ms: int, duration_ms: int, priority: int, dialogue: tuple[str, ...], loop: bool = False, interruptible: bool = True) -> Action:
        return Action(action_id, label, frames, frame_ms, duration_ms, priority, interruptible, dialogue, loop)

    return {
        "idle": action("idle", "待机", normal("idle"), 600, 5200, 0, ("今天也要一起看星星吗？", "我在这里。"), True),
        "happy": action("happy", "开心", normal("happy"), 600, 5000, 3, ("嘿嘿，被发现啦。", "摸摸头的话，心情会变好。")),
        "thinking": action("thinking", "思考", normal("thinking"), 600, 5000, 2, ("让我想一想。", "有个想法正在发光。")),
        "sleepy": action("sleepy", "困了", normal("sleepy"), 600, 5000, 1, ("先眯一小会儿。", "能量快见底了。")),
        "surprised": action("surprised", "惊讶", normal("surprised"), 600, 5000, 4, ("欸？叫我吗？", "我听见了。")),
        "dragged": action("dragged", "被拖动", normal("dragged"), 600, 5000, 5, ("慢一点慢一点。", "这里风景也不错."), interruptible=False),
        "touched": action("touched", "感动", normal("touched", "happy"), 600, 5000, 3, ("这份温暖，我会好好记住的。",)),
        "shy": action("shy", "害羞", normal("shy"), 600, 5000, 3, ("突、突然这样……会不好意思的。",)),
        "waving": action("waving", "打招呼", normal("waving"), 600, 5000, 2, ("欢迎回来，开拓者！",)),
        "reading": action("reading", "看书", normal("reading", "thinking"), 600, 4200, 2, ("安静陪我看一会儿书吧。",), loop=True),
        "talking": action("talking", "说话", normal("talking", "happy"), 600, 5000, 3, ("嗯嗯，我在听。",)),
        "eating": action("eating", "进食", normal("eating", "happy"), 600, 8000, 4, ("好好吃，谢谢你照顾我。",)),
        "resting": action("resting", "休息", normal("resting", "sleepy"), 600, 8000, 2, ("我进休眠舱休息一会儿。", "能量补充中，别走开。")),
        "treatment": action("treatment", "治疗", normal("treatment", "thinking"), 600, 8000, 4, ("没关系，正在慢慢恢复。",)),
        "hungry": action("hungry", "饥饿", normal("hungry", "thinking"), 600, 5000, 2, ("那个…我好像有点饿了。",)),
        "tired": action("tired", "疲惫", normal("tired", "sleepy"), 600, 5000, 2, ("今天的能量，好像不太够了。",)),
        "sick": action("sick", "不适", normal("sick", "sleepy"), 600, 5000, 3, ("不用担心，我只是需要休息和治疗。",)),
        "attention": action("attention", "呼唤", normal("attention", "happy"), 600, 5000, 3, ("开拓者…你还在吗？",)),
        "ignored": action("ignored", "被忽略", normal("ignored", "sad"), 600, 5000, 3, ("你是不是…忘记我了。",)),
    }


AI_ALLOWED_ACTIONS = (
    "idle",
    "happy",
    "thinking",
    "sleepy",
    "surprised",
    "touched",
    "shy",
    "waving",
    "reading",
    "talking",
)
