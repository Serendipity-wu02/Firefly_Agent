from __future__ import annotations

import re

from PySide6.QtCore import Signal, Qt
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLineEdit,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from ai_manager import AIMessage


class ChatPanel(QWidget):
    message_submitted = Signal(str)
    settings_requested = Signal()
    history_clear_requested = Signal()
    export_requested = Signal()

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("和流萤聊天")
        self.setWindowFlags(Qt.Tool | Qt.WindowStaysOnTopHint)
        self.resize(400, 460)

        self.history = QTextEdit(self)
        self.history.setReadOnly(True)

        self.input = QLineEdit(self)
        self.input.setPlaceholderText("和她说点什么...")
        self.input.setMinimumWidth(200)
        self.input.returnPressed.connect(self.submit_message)

        self.send_button = QPushButton("发送", self)
        self.send_button.clicked.connect(self.submit_message)

        self.settings_button = QPushButton("设置", self)
        self.settings_button.clicked.connect(self.settings_requested.emit)

        self.clear_button = QPushButton("清空", self)
        self.clear_button.clicked.connect(self.history_clear_requested.emit)

        self.export_button = QPushButton("导出", self)
        self.export_button.clicked.connect(self.export_requested.emit)

        input_row = QHBoxLayout()
        input_row.addWidget(self.input, 1)
        input_row.addWidget(self.send_button)

        tool_row = QHBoxLayout()
        tool_row.addWidget(self.settings_button)
        tool_row.addWidget(self.clear_button)
        tool_row.addWidget(self.export_button)
        tool_row.addStretch(1)

        layout = QVBoxLayout(self)
        layout.addWidget(self.history)
        layout.addLayout(input_row)
        layout.addLayout(tool_row)

    def submit_message(self) -> None:
        text = self.input.text().strip()
        if not text:
            return

        self.add_user_message(text)
        self.input.clear()
        self.message_submitted.emit(text)

    def add_user_message(self, text: str) -> None:
        self.history.append(f"你：{text}")

    def add_pet_message(self, text: str) -> None:
        self.history.append(f"流萤：{text}")

    def load_messages(self, messages: list[AIMessage]) -> None:
        self.history.clear()
        for message in messages:
            if message.role == "user":
                self.add_user_message(message.content)
            elif message.role == "assistant":
                clean_text = re.sub(r"\s*\[action:[^\]]+\]\s*$", "", message.content)
                self.add_pet_message(clean_text)

    def clear_messages(self) -> None:
        self.history.clear()

    def focus_input(self) -> None:
        self.show()
        self.raise_()
        self.activateWindow()
        self.input.setFocus()
