@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================================
echo  [Firefly-Pet] 初始化开发环境 (Node.js 24+ / npm 11)
echo ========================================================

echo.
echo [1/4] 检查 Node.js 运行时版本...
node -e "const v = parseInt(process.versions.node.split('.')[0], 10); if (v < 24) { console.error('错误: 需要 Node.js 24+ (当前: ' + process.versions.node + ')'); process.exit(1); }"
if errorlevel 1 (
    echo [错误] Node.js 版本不满足要求，请安装 Node.js 24 LTS。
    pause
    exit /b 1
)
echo [OK] Node.js 版本满足要求。

echo.
echo [2/4] 使用项目随附 npm 11 安装项目依赖...
node tools/npm.mjs install
if errorlevel 1 (
    echo [错误] npm install 失败
    pause
    exit /b 1
)

echo.
echo [3/4] 执行环境基线自检...
node tools/test_environment_baseline.mjs
if errorlevel 1 (
    echo [错误] 环境基线自检未通过
    pause
    exit /b 1
)

echo.
echo [4/4] 编译构建项目...
node tools/npm.mjs run build
if errorlevel 1 (
    echo [错误] npm run build 失败
    pause
    exit /b 1
)

echo.
echo ========================================================
echo  [Firefly-Pet] 环境初始化成功！
echo  开发启动指令: node tools/npm.mjs run dev
echo  测试执行指令: node tools/npm.mjs test
echo ========================================================
pause
