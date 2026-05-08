"""Agent 客户端 —— biddings-reviewer

通过 Claude Agent SDK 统一调用后端大模型。
复用 biddings-writer 的 client.py 模式，适配 qwen3.6-27b。
"""

import asyncio
import json
import os
import re
import tempfile
import tomllib
from pathlib import Path
from typing import Optional

from src.agents.options import AgentOptions

_PROJECT_ROOT = Path(__file__).parent.parent.parent
_CONFIG_PATH = _PROJECT_ROOT / "config" / "pipeline.toml"
_ENV_PATH = _PROJECT_ROOT / ".env"

_backend_config: Optional[dict] = None
_config_loaded: bool = False
_dotenv_loaded: dict[str, str] | None = None


def _load_dotenv() -> dict[str, str]:
    global _dotenv_loaded
    if _dotenv_loaded is not None:
        return _dotenv_loaded
    _dotenv_loaded = {}
    try:
        if _ENV_PATH.exists():
            raw = _ENV_PATH.read_text(encoding="utf-8")
            for line in raw.splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip("\"'")
                ref_match = re.match(r'^\$\{(\w+)\}$', value)
                if ref_match:
                    ref_key = ref_match.group(1)
                    value = _dotenv_loaded.get(ref_key, os.environ.get(ref_key, ""))
                _dotenv_loaded[key] = value
    except Exception:
        pass
    return _dotenv_loaded


def _load_backend_config() -> Optional[dict]:
    global _backend_config, _config_loaded
    if _config_loaded:
        return _backend_config
    _config_loaded = True
    try:
        if _CONFIG_PATH.exists():
            data = tomllib.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
            _backend_config = data.get("backend", {})
    except Exception:
        pass
    return _backend_config


_BACKEND_ENV_KEYS = [
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL",
]


def _build_backend_settings() -> str | None:
    dotenv = _load_dotenv()
    env_override: dict[str, str] = {}
    for key in _BACKEND_ENV_KEYS:
        val = dotenv.get(key, "") or os.environ.get(key, "")
        if val:
            env_override[key] = val

    if not env_override:
        return None

    settings = {"env": env_override}
    tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", prefix="biddings_reviewer_backend_", delete=False,
    )
    json.dump(settings, tmp)
    tmp.close()
    return tmp.name


def _normalize_output(text: str) -> str:
    """规范化小模型常见格式偏差"""
    text = re.sub(r'---\s*\n\s*REVIEW_END\s*---', '--- REVIEW_END ---', text)
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*$', '', text)
    return text


async def call_agent(prompt: str, options: AgentOptions) -> str:
    from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, ResultMessage

    settings_file = _build_backend_settings()

    model = options.model
    if not model:
        dotenv = _load_dotenv()
        model = dotenv.get("ANTHROPIC_MODEL", "") or os.environ.get("ANTHROPIC_MODEL", "")

    sdk_options: dict = {
        "allowed_tools": options.tools or ["Write"],
        "permission_mode": options.permission_mode,
        "system_prompt": options.system_prompt,
        "model": model,
        "setting_sources": [],
    }
    if settings_file:
        sdk_options["settings"] = settings_file

    parts = []
    async for msg in query(
        prompt=prompt,
        options=ClaudeAgentOptions(**sdk_options),
    ):
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if hasattr(block, "text"):
                    parts.append(block.text)
        elif isinstance(msg, ResultMessage):
            pass

    return _normalize_output("\n".join(parts))


async def call_with_retry(
    prompt: str,
    options: AgentOptions,
    max_retries: int = 3,
) -> str:
    last_error = None
    for attempt in range(max_retries):
        try:
            result = await call_agent(prompt, options)
            if result.strip():
                return result
            last_error = ValueError("Empty response from agent")
        except Exception as e:
            last_error = e
        if attempt < max_retries - 1:
            await asyncio.sleep(2 ** attempt)
    raise last_error or RuntimeError("Agent call failed after retries")
