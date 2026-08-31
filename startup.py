from __future__ import annotations

import sys
from pathlib import Path

if sys.platform == "win32":
    import winreg
else:
    winreg = None


APP_NAME = "Firefly Pet"
RUN_KEY_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"


class StartupManager:
    def __init__(self, project_dir: Path) -> None:
        self.project_dir = project_dir
        self.last_error: str | None = None

    def command(self) -> str:
        interpreter = self.project_dir / ".venv" / "Scripts" / "pythonw.exe"
        if not interpreter.exists():
            interpreter = Path(sys.executable)

        main_file = self.project_dir / "main.py"
        return f'"{interpreter}" "{main_file}"'

    def is_enabled(self) -> bool:
        if winreg is None:
            return False

        try:
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                RUN_KEY_PATH,
                0,
                winreg.KEY_READ,
            ) as key:
                value, value_type = winreg.QueryValueEx(key, APP_NAME)
        except FileNotFoundError:
            return False
        except OSError as error:
            self.last_error = str(error)
            return False

        self.last_error = None
        return value_type == winreg.REG_SZ and value == self.command()

    def set_enabled(self, enabled: bool) -> bool:
        if enabled:
            return self.enable()

        return self.disable()

    def enable(self) -> bool:
        if winreg is None:
            self.last_error = "开机自启动仅支持 Windows。"
            return False

        try:
            with winreg.CreateKeyEx(
                winreg.HKEY_CURRENT_USER,
                RUN_KEY_PATH,
                0,
                winreg.KEY_SET_VALUE,
            ) as key:
                winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, self.command())
        except OSError as error:
            self.last_error = str(error)
            return False

        self.last_error = None
        return True

    def disable(self) -> bool:
        if winreg is None:
            self.last_error = "开机自启动仅支持 Windows。"
            return False

        try:
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                RUN_KEY_PATH,
                0,
                winreg.KEY_SET_VALUE,
            ) as key:
                winreg.DeleteValue(key, APP_NAME)
        except FileNotFoundError:
            self.last_error = None
            return True
        except OSError as error:
            self.last_error = str(error)
            return False

        self.last_error = None
        return True