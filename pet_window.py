from __future__ import annotations

import threading
import time

from random import choice, random
from pathlib import Path

from PySide6.QtCore import QPoint, QRect, QSize, Qt, QTimer, Signal
from PySide6.QtGui import QAction, QCloseEvent, QCursor, QPainter
from PySide6.QtWidgets import QLabel, QMenu, QWidget

from actions import AI_ALLOWED_ACTIONS, Action, firefly_actions
from animation import AnimationPlayer
from character_resources import CharacterResourceStore
from chat_panel import ChatPanel
from chat_history import ChatHistoryStore
from dialogue import LocalDialogueManager
from memory import MemoryStore, extract_memories
from provider_factory import build_ai_manager
from settings import AppSettings, CharacterSettings, SettingsStore, WindowSettings
from settings_panel import SettingsPanel
from status_panel import StatusPanel
from startup import StartupManager
from voice import NormalVoicePlayer, estimated_duration_ms
from state import CharacterState, HealthStatus, TransformState


class Bubble(QLabel):
    def __init__(self, parent: QWidget) -> None:
        super().__init__(parent)
        self.setObjectName("bubble")
        self.setAlignment(Qt.AlignCenter)
        self.setWordWrap(True)
        self.setStyleSheet(
            """
            QLabel#bubble {
                color: #223047;
                background: rgba(255, 255, 255, 218);
                border: 1px solid rgba(66, 125, 166, 125);
                border-radius: 13px;
                padding: 8px 10px;
                font-size: 13px;
                font-family: "Microsoft YaHei", "Segoe UI";
            }
            """
        )
        self.hide()


class PetWindow(QWidget):
    PET_SIZE = QSize(300, 400)
    BUBBLE_RECT = QRect(20, 12, 340, 84)
    PET_ORIGIN = QPoint(40, 102)
    DRAG_THRESHOLD = 12
    PROACTIVE_COOLDOWN_SECONDS = 240
    SPECIAL_DIALOGUE_COOLDOWN_SECONDS = 600
    SPECIAL_DIALOGUE_LINES = (
        "和你在一起的每一天，都像在发光。",
        "开拓者，谢谢你一直陪在我身边。",
        "只要你在，我就什么都不怕。",
        "这份心意，我会一直好好收着的。",
    )
    PROACTIVE_LINES = {
        "attention": "开拓者…你还在吗？",
        "tired": "我有点累了，我们休息一下吧。",
        "hungry": "那个…我好像有点饿了。",
        "sick": "不用担心，我会好好休息的。",
        "ignored": "你是不是…忘记我了。",
    }
    PROACTIVE_INSTRUCTIONS = {
        "attention": "主动呼唤一下用户，想知道对方还在不在",
        "tired": "告诉用户自己有点累了，想休息",
        "hungry": "有点不好意思地表示自己饿了",
        "sick": "让用户不要担心，自己会好好休息",
        "ignored": "委屈地说感觉被忽略了，希望对方多陪陪自己",
    }

    proactive_line_ready = Signal(str, str)

    def __init__(
        self,
        project_dir: Path,
        settings: AppSettings,
        settings_store: SettingsStore,
    ) -> None:
        super().__init__()
        self.project_dir = project_dir
        self.character_resources = CharacterResourceStore(project_dir)
        self.voice_player = NormalVoicePlayer(project_dir)
        self.settings = settings
        self.settings_store = settings_store
        self.history_store = ChatHistoryStore(project_dir / "config" / "chat_history.json")
        self.memory_store = MemoryStore(project_dir / "config" / "memory.json")
        self.startup_manager = StartupManager(project_dir)
        self.actions = firefly_actions(project_dir)
        self.state = settings.character.to_state()
        self.state.apply_offline_time()
        self.state.current_action = "sam_idle" if self.state.form.value == "sam" else "idle"
        self.frame_index = 0
        self.active_action = self.actions[self.state.current_action]
        self.animation_player = AnimationPlayer(self.PET_SIZE)
        self.drag_offset = QPoint()
        self.dragging = False
        self.drag_moved = False
        self.action_return_timer: QTimer | None = None

        self.dialogue_manager = self._build_dialogue_manager()

        self.chat_panel = ChatPanel()
        self.chat_panel.message_submitted.connect(self.handle_chat_message)
        self.chat_panel.settings_requested.connect(self.open_settings_panel)
        self.chat_panel.history_clear_requested.connect(self.clear_chat_history)
        self.chat_panel.export_requested.connect(self.export_chat_history)
        self.chat_panel.load_messages(self.history_store.load())

        self.settings_panel = SettingsPanel(settings, self.memory_store)
        self.settings_panel.settings_saved.connect(self.handle_settings_saved)
        self.settings_panel.memory_changed.connect(self.handle_memory_changed)

        self.status_panel = StatusPanel()
        self.status_panel.feed_requested.connect(self.handle_feed)
        self.status_panel.rest_requested.connect(self.handle_rest)
        self.status_panel.treatment_requested.connect(self.handle_treatment)
        self.status_panel.transform_requested.connect(self.handle_transform)
        self.status_panel.combustion_requested.connect(self.handle_combustion)
        self.status_panel.normal_requested.connect(self.handle_return_to_normal)
        self.status_panel.refresh(self.state)

        self.setWindowFlags(
            Qt.FramelessWindowHint
            | Qt.WindowStaysOnTopHint
            | Qt.Tool
        )
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setContextMenuPolicy(Qt.CustomContextMenu)
        self.customContextMenuRequested.connect(self.show_context_menu)

        self.pet = QLabel(self)
        self.pet.setAttribute(Qt.WA_TranslucentBackground)
        self.pet.setScaledContents(True)
        self.pet.setGeometry(
            self.PET_ORIGIN.x(),
            self.PET_ORIGIN.y(),
            self.PET_SIZE.width(),
            self.PET_SIZE.height(),
        )

        self.bubble = Bubble(self)
        bubble_asset = project_dir / "assets" / "firefly" / "ui" / "bubbles" / "ui_frame_01.png"
        if bubble_asset.is_file():
            bubble_path = str(bubble_asset).replace("\\", "/")
            self.bubble.setStyleSheet(
                f'QLabel#bubble {{ color: #223047; border-image: url("{bubble_path}") 20 20 20 20 stretch stretch; padding: 16px 24px; font-size: 15px; font-family: "Microsoft YaHei", "Segoe UI"; }}'
            )
        self.bubble.setGeometry(self.BUBBLE_RECT)

        self.pet_scale = max(0.5, min(1.6, float(self.settings.window.pet_scale or 1.0)))
        self._apply_pet_scale(self.pet_scale)
        self._restore_window_position()

        self.frame_timer = QTimer(self)
        self.frame_timer.timeout.connect(self.next_frame)
        self.frame_timer.start(self.active_action.frame_ms)

        self.action_timer = QTimer(self)
        self.action_timer.timeout.connect(self.next_idle_action)
        self.action_timer.start(18000)

        self.bubble_timer = QTimer(self)
        self.bubble_timer.setSingleShot(True)
        self.bubble_timer.timeout.connect(self.bubble.hide)

        self.decay_timer = QTimer(self)
        self.decay_timer.timeout.connect(self.handle_decay)
        self.decay_timer.start(15000)

        self.proactive_timer = QTimer(self)
        self.proactive_timer.timeout.connect(self.handle_proactive_behavior)
        self.proactive_timer.start(45000)
        self.proactive_cooldowns: dict[str, float] = {}
        self.proactive_line_ready.connect(self._show_proactive_line)

        self.save_timer = QTimer(self)
        self.save_timer.timeout.connect(self.save_settings)
        self.save_timer.start(30000)

        self._sync_startup_setting(show_status=False)
        self.play_action(self.active_action.id)

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        super().paintEvent(event)

    def closeEvent(self, event: QCloseEvent) -> None:
        self.save_settings()
        self.chat_panel.close()
        self.settings_panel.close()
        self.status_panel.close()
        super().closeEvent(event)

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.LeftButton:
            self.dragging = True
            self.drag_moved = False
            self.drag_offset = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            self.play_action(self.state.react_to_click())
            self.status_panel.refresh(self.state)
            event.accept()

    def mouseDoubleClickEvent(self, event) -> None:
        if event.button() == Qt.LeftButton:
            self.play_action(self.state.react_to_pet())
            self.status_panel.refresh(self.state)
            event.accept()

    def mouseMoveEvent(self, event) -> None:
        if self.dragging and event.buttons() & Qt.LeftButton:
            new_position = event.globalPosition().toPoint() - self.drag_offset
            if (new_position - self.frameGeometry().topLeft()).manhattanLength() > self.DRAG_THRESHOLD:
                self.drag_moved = True
            self.move(new_position)
            event.accept()

    def mouseReleaseEvent(self, event) -> None:
        if event.button() == Qt.LeftButton and self.dragging:
            self.dragging = False
            if self.drag_moved:
                self.play_action(self.state.react_to_drag_finished())
                self.save_settings()
                self.status_panel.refresh(self.state)
            event.accept()

    def open_chat_panel(self) -> None:
        self.chat_panel.focus_input()

    def open_status_panel(self) -> None:
        self.status_panel.refresh(self.state)
        self.status_panel.show()
        self.status_panel.raise_()
        self.status_panel.activateWindow()
        self.status_panel.raise_()
        self.status_panel.activateWindow()

    def open_settings_panel(self) -> None:
        self.settings_panel.focus_panel()

    def handle_settings_saved(self) -> None:
        self.dialogue_manager = self._build_dialogue_manager()
        self._sync_startup_setting(show_status=True)
        self.save_settings()

    def handle_chat_message(self, message: str) -> None:
        reply = self.dialogue_manager.reply(message, self.state)
        self.chat_panel.add_pet_message(reply.text)
        self.say(reply.text, 3600)
        action_id = self.state.react_to_message(reply.action_id)
        self.play_action(action_id, prefer_text=reply.text, bubble_text=reply.text)
        if action_id == "idle":
            self._play_voice_line("idle", prefer_text=reply.text)
        memories = extract_memories(message)
        for key, value in memories:
            self.memory_store.remember(key, value)
        if memories:
            self.dialogue_manager.refresh_memory_context()
        self.save_settings()

    def _play_voice_line(self, action_id: str, prefer_text: str | None = None) -> None:
        voice_text = self.voice_player.play_for_action(action_id, prefer_text=prefer_text)
        if voice_text:
            self.say(voice_text, estimated_duration_ms(voice_text))

    def handle_decay(self) -> None:
        self.state.tick()
        self.status_panel.refresh(self.state)
        self.save_settings()

    def handle_feed(self) -> None:
        if self.state.hunger <= 3:
            self.status_panel.show_feedback("流萤现在很饱，暂时吃不下更多了。")
            return
        self.play_action(self.state.feed())
        self.status_panel.refresh(self.state)
        self.status_panel.show_feedback(f"她吃得津津有味，饱食度降到了 {self.state.hunger}/100。")
        self.save_settings()

    def handle_rest(self) -> None:
        if self.state.energy >= 92:
            self.status_panel.show_feedback("精力还很充沛，先陪我继续玩一会儿吧。")
            return
        self.play_action(self.state.rest())
        self.status_panel.refresh(self.state)
        self.status_panel.show_feedback(f"休息了一会儿，精力恢复到了 {self.state.energy}/100。")
        self.save_settings()

    def handle_treatment(self) -> None:
        if self.state.health == HealthStatus.HEALTHY:
            self.status_panel.show_feedback("现在很健康，不需要治疗。")
            return
        self.play_action(self.state.treatment())
        self.status_panel.refresh(self.state)
        self.status_panel.show_feedback("治疗完成，身体感觉好多了。")
        self.save_settings()

    def handle_transform(self) -> None:
        if self.state.transform_state == TransformState.TRANSFORMING:
            self.status_panel.show_feedback("正在变身中，请等一下。")
            return
        if self.state.form.value == "normal":
            self.state.transform_to_sam()
            self.play_action("transform")

            def resume_sam_idle() -> None:
                self.state.transform_state = TransformState.STABLE
                if self.state.form.value == "sam":
                    self._return_to_default()

            QTimer.singleShot(3600, resume_sam_idle)
        else:
            self.handle_return_to_normal()
        self.status_panel.refresh(self.state)
        self.save_settings()

    def handle_return_to_normal(self) -> None:
        if self.state.transform_state == TransformState.TRANSFORMING:
            self.status_panel.show_feedback("正在变身中，请等一下。")
            return
        self.state.return_to_normal()
        self.play_action("idle")
        self.status_panel.refresh(self.state)
        self.save_settings()

    def handle_combustion(self) -> None:
        if self.state.transform_state == TransformState.TRANSFORMING:
            self.status_panel.show_feedback("正在变身中，请等一下。")
            return
        if "combustion" not in self.state.unlocked_features():
            self.say("再陪我走一段路，完全燃烧还没有解锁。", 3200)
            self.status_panel.show_feedback(f"完全燃烧需要好感度 80（当前 {self.state.affection}）。")
            return
        self.state.combustion()
        self.play_action("combustion")
        self.voice_player.play_sam_combustion()
        self.status_panel.refresh(self.state)
        self.save_settings()

    def handle_proactive_behavior(self) -> None:
        if self.voice_player.is_busy():
            return
        if self.state.transform_state == TransformState.TRANSFORMING:
            return
        if self.active_action.id in ("transform", "combustion"):
            return

        action_id = self.state.proactive_action()
        if action_id is not None:
            if self._cooldown_ready(action_id, self.PROACTIVE_COOLDOWN_SECONDS):
                self._speak_proactive(action_id)
            return

        if "special_dialogue" in self.state.unlocked_features() and random() < 0.12:
            if self._cooldown_ready("special", self.SPECIAL_DIALOGUE_COOLDOWN_SECONDS):
                self._play_special_dialogue()

    def _cooldown_ready(self, key: str, cooldown_seconds: int) -> bool:
        now = time.monotonic()
        last = self.proactive_cooldowns.get(key)
        if last is not None and now - last < cooldown_seconds:
            return False
        self.proactive_cooldowns[key] = now
        return True

    def _speak_proactive(self, action_id: str) -> None:
        manager = self.dialogue_manager.ai_manager
        if manager.provider.id == "local":
            self._show_proactive_line(self.PROACTIVE_LINES[action_id], action_id)
            return

        instruction = (
            f"请以流萤的身份主动对用户说一句话，场景：{self.PROACTIVE_INSTRUCTIONS[action_id]}。"
            "只说这一句，不超过 20 个字，可以在末尾带动作标记。"
        )

        def work() -> None:
            try:
                reply = manager.generate_proactive(instruction)
                intent = self.dialogue_manager.intent_parser.parse(reply)
                text = intent.text or self.PROACTIVE_LINES[action_id]
                action = intent.action_id
            except Exception:
                text = self.PROACTIVE_LINES[action_id]
                action = action_id
            self.proactive_line_ready.emit(text, action)

        threading.Thread(target=work, daemon=True).start()

    def _show_proactive_line(self, text: str, action_id: str) -> None:
        if self.voice_player.is_busy():
            return
        self.play_action(action_id, prefer_text=text, bubble_text=text, automatic=True)

    def _play_special_dialogue(self) -> None:
        line = choice(self.SPECIAL_DIALOGUE_LINES)
        self.play_action(
            choice(("touched", "shy", "waving")),
            prefer_text=line,
            bubble_text=line,
            automatic=True,
        )

    def export_chat_history(self) -> None:
        export_path = self.project_dir / "config" / "chat_history_export.txt"
        messages = self.history_store.load()
        lines = []
        for message in messages:
            if message.role == "user":
                lines.append(f"你：{message.content}")
            elif message.role == "assistant":
                lines.append(f"流萤：{message.content}")
        export_path.parent.mkdir(parents=True, exist_ok=True)
        export_path.write_text("\n".join(lines), encoding="utf-8")
        self.settings_panel.status.setText(f"聊天记录已导出：{export_path.name}")

    def clear_chat_history(self) -> None:
        self.dialogue_manager.ai_manager.clear_history()
        if not self.history_store.clear():
            self.settings_panel.status.setText("聊天记录清空失败，请检查 config 目录权限")
            return
        self.chat_panel.clear_messages()
        self.status_panel.refresh(self.state)
        self.settings_panel.status.setText("聊天记录已清空")

    def handle_memory_changed(self) -> None:
        self.dialogue_manager = self._build_dialogue_manager()

    def next_frame(self) -> None:
        if not self.active_action.frames:
            return

        self.pet.setPixmap(self.animation_player.frame(self.active_action, self.frame_index))
        self.frame_index += 1

    def next_idle_action(self) -> None:
        next_action = self.state.choose_idle_action()
        self.play_action(next_action, automatic=True)

    def play_action(self, action_id: str, prefer_text: str | None = None, bubble_text: str | None = None, automatic: bool = False) -> None:
        action = self.actions[action_id]

        if self.state.transform_state == TransformState.TRANSFORMING and action_id != "transform":
            return

        if (
            not self.active_action.interruptible
            and action.priority < self.active_action.priority
        ):
            return

        self.active_action = action
        self.state.current_action = action_id
        self.frame_index = 0
        self.frame_timer.start(action.frame_ms)
        self.next_frame()

        voice_text = None
        if action_id != "idle":
            if automatic:
                voice_text = self.voice_player.play_auto_line(action_id, prefer_text=prefer_text)
            else:
                voice_text = self.voice_player.play_for_action(action_id, prefer_text=prefer_text)

        if voice_text:
            self.say(voice_text, estimated_duration_ms(voice_text))
        elif bubble_text:
            self.say(bubble_text, max(3200, estimated_duration_ms(bubble_text)))
        elif action.dialogue:
            self.say(choice(action.dialogue), action.duration_ms)

        if self.action_return_timer is not None:
            self.action_return_timer.stop()
            self.action_return_timer.deleteLater()
            self.action_return_timer = None

        if not action.loop:
            self.action_return_timer = QTimer(self)
            self.action_return_timer.setSingleShot(True)
            self.action_return_timer.timeout.connect(self._return_to_default)
            self.action_return_timer.start(action.duration_ms)

    def _return_to_default(self) -> None:
        return_action = "sam_idle" if self.state.form.value == "sam" else "idle"
        action = self.actions[return_action]
        self.active_action = action
        self.state.current_action = return_action
        self.frame_index = 0
        self.frame_timer.start(action.frame_ms)
        self.next_frame()

    def say(self, text: str, duration_ms: int = 2600) -> None:
        self.bubble.setText(text)
        self.bubble.adjustSize()
        width = min(max(self.bubble.width(), 240), self.width() - 40)
        self.bubble.setFixedWidth(width)
        self.bubble.setGeometry(
            max(4, (self.width() - width) // 2),
            0,
            width,
            max(76, self.bubble.height()),
        )
        self.bubble.raise_()
        self.bubble.show()
        self.bubble_timer.start(duration_ms)

    def show_context_menu(self, position: QPoint) -> None:
        menu = QMenu(self)

        chat_action = QAction("和她聊天", self)
        chat_action.triggered.connect(self.open_chat_panel)
        menu.addAction(chat_action)

        status_action = QAction("她的状态", self)
        status_action.triggered.connect(self.open_status_panel)
        menu.addAction(status_action)

        size_menu = menu.addMenu("调整角色大小")
        for label, scale in (("小", 0.70), ("标准", 0.90), ("大", 1.00), ("特大", 1.25)):
            size_action = QAction(label, self)
            size_action.triggered.connect(lambda checked=False, value=scale: self.set_pet_scale(value))
            size_menu.addAction(size_action)

        menu.exec(QCursor.pos())

    def set_pet_scale(self, scale: float) -> None:
        self.pet_scale = max(0.5, min(1.6, float(scale)))
        self._apply_pet_scale(self.pet_scale)
        self.save_settings()

    def _apply_pet_scale(self, scale: float) -> None:
        self.pet_size = QSize(int(self.PET_SIZE.width() * scale), int(self.PET_SIZE.height() * scale))
        self.animation_player = AnimationPlayer(self.pet_size)
        self.pet.setGeometry(self.PET_ORIGIN.x(), self.PET_ORIGIN.y(), self.pet_size.width(), self.pet_size.height())
        self.resize(self.pet_size.width() + 80, self.pet_size.height() + 130)
        self.bubble.setGeometry(20, 12, max(340, self.width() - 40), 84)

    def save_settings(self) -> None:
        self.settings.window = WindowSettings(x=self.x(), y=self.y(), pet_scale=self.pet_scale)
        self.settings.character = CharacterSettings.from_state(self.state)
        self.settings_store.save(self.settings)

    def _build_dialogue_manager(self) -> LocalDialogueManager:
        ai_action_ids = tuple(action_id for action_id in AI_ALLOWED_ACTIONS if action_id in self.actions)
        return LocalDialogueManager(
            ai_manager=build_ai_manager(self.settings.ai),
            action_ids=ai_action_ids,
            history_store=self.history_store,
            memory_store=self.memory_store,
            character_context=self.character_resources.prompt_context(),
        )

    def _sync_startup_setting(self, show_status: bool) -> None:
        success = self.startup_manager.set_enabled(self.settings.startup.enabled)
        if success:
            if show_status:
                if self.settings.startup.enabled:
                    self.settings_panel.status.setText("设置已保存，开机自启动已开启")
                else:
                    self.settings_panel.status.setText("设置已保存，开机自启动已关闭")
            return

        if show_status:
            error = self.startup_manager.last_error or "系统没有返回错误信息"
            self.settings_panel.status.setText(f"设置已保存，开机自启动设置失败：{error}")

    def _restore_window_position(self) -> None:
        if self.settings.window.x is None or self.settings.window.y is None:
            self._move_to_bottom_right()
            return

        self.move(self.settings.window.x, self.settings.window.y)

    def _move_to_bottom_right(self) -> None:
        screen = self.screen().availableGeometry()
        self.move(
            screen.right() - self.width() - 24,
            screen.bottom() - self.height() - 32,
        )
        