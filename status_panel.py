from __future__ import annotations

from PySide6.QtCore import Signal, Qt
from PySide6.QtWidgets import QFormLayout, QHBoxLayout, QLabel, QProgressBar, QPushButton, QVBoxLayout, QWidget

from state import CharacterState, HealthStatus, PetForm


BAR_STYLES = {
    "energy": ("#4caf7d", "精力：随时间消耗，休息可以恢复"),
    "hunger": ("#e2a03f", "饱食度：数值越高越饿，喂食可以降低"),
    "affection": ("#e77c8e", "好感度：陪伴和互动会慢慢积累，解锁更多内容"),
    "attention": ("#5b9bd5", "注意力：长时间被忽略会下降，点击和聊天可以恢复"),
}


class StatusPanel(QWidget):
    feed_requested = Signal()
    rest_requested = Signal()
    treatment_requested = Signal()

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("流萤状态")
        self.setWindowFlags(Qt.Tool | Qt.WindowStaysOnTopHint)
        self.resize(340, 340)
        self.labels: dict[str, QLabel] = {}
        self.bars: dict[str, QProgressBar] = {}

        form = QFormLayout()
        self.labels["health"] = QLabel()
        self.labels["unlocks"] = QLabel()
        self.labels["unlocks"].setWordWrap(True)
        form.addRow("健康", self.labels["health"])
        form.addRow("解锁", self.labels["unlocks"])
        for key in BAR_STYLES:
            bar = QProgressBar()
            bar.setRange(0, 100)
            bar.setFormat("%v/100")
            bar.setAlignment(Qt.AlignCenter)
            bar.setStyleSheet(
                f"QProgressBar::chunk {{ background-color: {BAR_STYLES[key][0]}; }}"
            )
            bar.setToolTip(BAR_STYLES[key][1])
            self.bars[key] = bar
            title = {"energy": "精力", "hunger": "饱食度", "affection": "好感度", "attention": "注意力"}[key]
            form.addRow(title, bar)

        feed = QPushButton("喂食")
        rest = QPushButton("休息")
        treatment = QPushButton("治疗")
        feed.clicked.connect(self.feed_requested.emit)
        rest.clicked.connect(self.rest_requested.emit)
        treatment.clicked.connect(self.treatment_requested.emit)
        care_row = QHBoxLayout()
        care_row.addWidget(feed)
        care_row.addWidget(rest)
        care_row.addWidget(treatment)

        self.feedback = QLabel()
        self.feedback.setWordWrap(True)
        self.feedback.setStyleSheet("color: #55627a; font-size: 12px;")

        layout = QVBoxLayout(self)
        layout.addLayout(form)
        layout.addLayout(care_row)
        layout.addWidget(self.feedback)
        layout.addStretch(1)

    def refresh(self, state: CharacterState) -> None:
        health_labels = {
            HealthStatus.HEALTHY: "健康",
            HealthStatus.TIRED: "疲惫",
            HealthStatus.SICK: "失熵症/不适",
            HealthStatus.TREATMENT: "治疗中",
            HealthStatus.RECOVERED: "恢复中",
        }
        unlock_names = {
            "basic_care": "基础照顾",
            "special_dialogue": "特殊对话",
        }
        self.labels["health"].setText(health_labels[state.health])
        self.labels["unlocks"].setText(
            "、".join(unlock_names.get(feature, feature) for feature in state.unlocked_features())
        )
        for key in BAR_STYLES:
            self.bars[key].setValue(getattr(state, key))

    def show_feedback(self, text: str) -> None:
        self.feedback.setText(text)
