# Firefly Live2D Model Directory (流萤 Live2D 模型资源目录)

This directory is designated for the Live2D Cubism 3/4 runtime model files.

## Third-Party Asset Notice (第三方资产说明)
The Live2D model assets (`.moc3`, textures `.png`, motion sound `.mp3`) are third-party character assets and are **NOT** redistributed in this public repository due to copyright and licensing restrictions.

## Resource Installation (模型安装指引)
To enable full Live2D rendering in local development:
1. Place the model bundle files into this directory (`assets/firefly/models/`):
   - `Firefly.model3.json` (Main model configuration)
   - `Moc_0.moc3` (Live2D Cubism model binary)
   - `Textures_0_0.png` (Texture atlas)
   - `Physics_0.json` (Physics calculation definitions)
   - `Expressions_*.json` (Expression configuration files)
   - `Motions_*.json` (Motion definition files)
2. When model files are present, Firefly-Pet automatically activates Live2D Cubism rendering with eye focus and mouth synchronization.
3. If model files are absent, the application automatically falls back to the embedded PNG sequential frame animation engine (`assets/firefly/normal/` and `assets/firefly/sam/`) with zero crashes.
