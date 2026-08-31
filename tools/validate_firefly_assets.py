from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    project_dir = Path(__file__).resolve().parents[1]
    models_dir = project_dir / "assets" / "firefly" / "models"
    model_json_path = models_dir / "Firefly.model3.json"

    if not model_json_path.is_file():
        raise FileNotFoundError(f"Missing main Live2D model config: {model_json_path}")

    with open(model_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    file_refs = data.get("FileReferences", {})

    # 1. Check Moc
    moc_file = file_refs.get("Moc")
    if not moc_file or not (models_dir / moc_file).is_file():
        raise FileNotFoundError(f"Missing moc3 binary: {moc_file}")

    # 2. Check Textures
    textures = file_refs.get("Textures", [])
    if not textures:
        raise ValueError("Live2D model3.json contains zero textures")
    for tex in textures:
        if not (models_dir / tex).is_file():
            raise FileNotFoundError(f"Missing texture file: {tex}")

    # 3. Check Physics
    physics_file = file_refs.get("Physics")
    if physics_file and not (models_dir / physics_file).is_file():
        raise FileNotFoundError(f"Missing physics file: {physics_file}")

    # 4. Check Motions
    motions = file_refs.get("Motions", {})
    motion_count = 0
    for group, m_list in motions.items():
        for item in m_list:
            m_file = item.get("File")
            if m_file and not (models_dir / m_file).is_file():
                raise FileNotFoundError(f"Missing motion file in group {group}: {m_file}")
            motion_count += 1

    # 5. Check Expressions
    expressions = file_refs.get("Expressions", [])
    for exp in expressions:
        exp_file = exp.get("File")
        if exp_file and not (models_dir / exp_file).is_file():
            raise FileNotFoundError(f"Missing expression file: {exp_file}")

    print(
        f"Live2D character assets validated: {len(textures)} texture(s), "
        f"{motion_count} motion(s), {len(expressions)} expression(s)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())