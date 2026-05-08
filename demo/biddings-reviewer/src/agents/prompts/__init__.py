"""System Prompt 加载工具"""
from pathlib import Path


_PROMPTS_DIR = Path(__file__).parent


def load_prompt(name: str) -> str:
    """加载 System Prompt 文件内容

    Args:
        name: 文件名（不含 .md 后缀），如 'dpa', 'bca', 'fca', 'ora'
    """
    path = _PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    return path.read_text(encoding="utf-8")
