import contextlib
import os
import sys
from pathlib import Path

from PySide6.QtCore import QLoggingCategory
from PySide6.QtWidgets import QApplication

from pet_window import PetWindow
from settings import SettingsStore

QLoggingCategory.setFilterRules("qt.multimedia.*=false")


@contextlib.contextmanager
def _muted_native_stderr():
    """Hides one-time FFmpeg probe lines that the native library writes to fd 2."""
    sys.stderr.flush()
    saved_fd = os.dup(2)
    devnull_fd = os.open(os.devnull, os.O_WRONLY)
    try:
        os.dup2(devnull_fd, 2)
        yield
    finally:
        os.dup2(saved_fd, 2)
        os.close(saved_fd)
        os.close(devnull_fd)


def main() -> int:
    with _muted_native_stderr():
        app = QApplication(sys.argv)
        app.setApplicationName("Firefly Pet")

        project_dir = Path(__file__).resolve().parent
        settings_store = SettingsStore(project_dir / "config" / "settings.json")
        settings = settings_store.load()

        window = PetWindow(
            project_dir=project_dir,
            settings=settings,
            settings_store=settings_store,
        )

    window.show()

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())