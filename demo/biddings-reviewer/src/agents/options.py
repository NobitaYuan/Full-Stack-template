"""Agent 配置工厂 —— biddings-reviewer

qwen3.6-27b 适配：
- DPA: temperature=0.1 精确提取
- BCA: temperature=0.0 确定性审查判断
- FCA: temperature=0.0 确定性安全检查
- ORA: temperature=0.2 报告编译
"""

import os
from dataclasses import dataclass, field
from pathlib import Path


def _read_env_model(key: str, fallback_key: str = "PIPELINE_MODEL") -> str:
    env_file = Path(__file__).parent.parent.parent / ".env"
    env_vars: dict[str, str] = {}
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env_vars[k.strip()] = v.strip().strip("\"'")

    for k in (key, fallback_key, "ANTHROPIC_MODEL"):
        val = env_vars.get(k) or os.environ.get(k, "")
        if val:
            return val
    return ""


@dataclass
class AgentOptions:
    """单个 Agent 的运行时配置"""
    model: str = ""
    temperature: float = 0.0
    max_tokens: int = 4096
    system_prompt: str = ""
    tools: list[str] = field(default_factory=list)
    permission_mode: str = "acceptEdits"


def dpa_options(system_prompt: str) -> AgentOptions:
    return AgentOptions(
        model=_read_env_model("DPA_MODEL"),
        temperature=0.1,        # 极低温度，精确提取
        max_tokens=8192,        # 大输出：提取全部审查基准
        system_prompt=system_prompt,
        tools=[],
    )


def bca_options(system_prompt: str) -> AgentOptions:
    return AgentOptions(
        model=_read_env_model("BCA_MODEL"),
        temperature=0.0,        # 审查判断必须确定性
        max_tokens=8192,        # 27b 适配：完整审查结果需要更多 token
        system_prompt=system_prompt,
        tools=[],
    )


def fca_options(system_prompt: str) -> AgentOptions:
    return AgentOptions(
        model=_read_env_model("FCA_MODEL"),
        temperature=0.0,
        max_tokens=8192,        # 27b 适配：完整检查结果需要更多 token
        system_prompt=system_prompt,
        tools=[],
    )


def ora_options(system_prompt: str) -> AgentOptions:
    return AgentOptions(
        model=_read_env_model("ORA_MODEL"),
        temperature=0.2,
        max_tokens=16384,       # 27b 适配：生成完整7章节报告需要更多 token
        system_prompt=system_prompt,
        tools=[],
    )


OPTIONS_BUILDERS = {
    "dpa": dpa_options,
    "bca": bca_options,
    "fca": fca_options,
    "ora": ora_options,
}
