@echo off
chcp 65001 >nul
cd /d "%~dp0"
firefly run
if errorlevel 1 (
    echo [错误] firefly run 退出
    pause
)
