from __future__ import annotations

from PySide6.QtCore import Signal, Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from memory import MemoryStore
from settings import AppSettings


class SettingsPanel(QWidget):
    settings_saved = Signal()
    memory_changed = Signal()

    def __init__(self, settings: AppSettings, memory_store: MemoryStore) -> None:
        super().__init__()
        self.settings = settings
        self.memory_store = memory_store
        self.setWindowTitle("设置")
        self.setWindowFlags(Qt.Tool | Qt.WindowStaysOnTopHint)
        self.resize(460, 560)

        self.provider_id = QLineEdit(self)
        self.endpoint = QLineEdit(self)
        self.model = QLineEdit(self)
        self.api_key = QLineEdit(self)
        self.api_key.setEchoMode(QLineEdit.Password)
        self.start_on_boot = QCheckBox("开机时自动启动 Firefly Pet", self)
        self.status = QLabel(self)

        form = QFormLayout()
        form.addRow("Provider", self.provider_id)
        form.addRow("Endpoint", self.endpoint)
        form.addRow("Model", self.model)
        form.addRow("API Key", self.api_key)

        self.save_button = QPushButton("保存", self)
        self.close_button = QPushButton("关闭", self)
        self.save_button.clicked.connect(self.save_to_settings)
        self.close_button.clicked.connect(self.close)

        button_row = QHBoxLayout()
        button_row.addStretch(1)
        button_row.addWidget(self.save_button)
        button_row.addWidget(self.close_button)

        layout = QVBoxLayout(self)
        layout.addLayout(form)
        layout.addWidget(self.start_on_boot)
        layout.addWidget(self.status)
        layout.addWidget(QLabel("角色记忆", self))

        self.memory_list = QListWidget(self)
        self.memory_list.currentRowChanged.connect(self.load_selected_memory)
        layout.addWidget(self.memory_list)

        self.memory_key = QLineEdit(self)
        self.memory_key.setPlaceholderText("记忆名称，例如：称呼")
        self.memory_value = QLineEdit(self)
        self.memory_value.setPlaceholderText("记忆内容，例如：叫我小明")
        memory_form = QFormLayout()
        memory_form.addRow("名称", self.memory_key)
        memory_form.addRow("内容", self.memory_value)
        layout.addLayout(memory_form)

        self.remember_button = QPushButton("添加 / 更新记忆", self)
        self.forget_button = QPushButton("删除选中记忆", self)
        self.remember_button.clicked.connect(self.remember_memory)
        self.forget_button.clicked.connect(self.forget_memory)
        memory_buttons = QHBoxLayout()
        memory_buttons.addWidget(self.remember_button)
        memory_buttons.addWidget(self.forget_button)
        layout.addLayout(memory_buttons)
        layout.addLayout(button_row)

        self.load_from_settings()
        self.load_memories()

    def load_from_settings(self) -> None:
        self.provider_id.setText(self.settings.ai.provider_id)
        self.endpoint.setText(self.settings.ai.endpoint)
        self.model.setText(self.settings.ai.model)
        self.api_key.setText(self.settings.ai.api_key)
        self.start_on_boot.setChecked(self.settings.startup.enabled)

    def save_to_settings(self) -> None:
        self.settings.ai.provider_id = self.provider_id.text().strip()
        self.settings.ai.endpoint = self.endpoint.text().strip()
        self.settings.ai.model = self.model.text().strip()
        self.settings.ai.api_key = self.api_key.text()
        self.settings.startup.enabled = self.start_on_boot.isChecked()
        self.status.setText("设置已保存")
        self.settings_saved.emit()

    def load_memories(self) -> None:
        self.memory_list.clear()
        for item in self.memory_store.items.values():
            self.memory_list.addItem(f"{item.key}：{item.value}")

    def load_selected_memory(self, row: int) -> None:
        if row < 0:
            self.memory_key.clear()
            self.memory_value.clear()
            return

        item = list(self.memory_store.items.values())[row]
        self.memory_key.setText(item.key)
        self.memory_value.setText(item.value)

    def remember_memory(self) -> None:
        if not self.memory_store.remember(self.memory_key.text(), self.memory_value.text()):
            self.status.setText("记忆名称和内容不能为空")
            return

        self.load_memories()
        self.status.setText("记忆已保存")
        self.memory_changed.emit()

    def forget_memory(self) -> None:
        row = self.memory_list.currentRow()
        if row < 0:
            self.status.setText("请先选择一条记忆")
            return

        key = list(self.memory_store.items.values())[row].key
        self.memory_store.forget(key)
        self.load_memories()
        self.status.setText("记忆已删除")
        self.memory_changed.emit()

    def focus_panel(self) -> None:
        self.load_from_settings()
        self.show()
        self.raise_()
        self.activateWindow()
