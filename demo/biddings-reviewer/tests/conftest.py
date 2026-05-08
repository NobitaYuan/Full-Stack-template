"""pytest 配置 —— biddings-reviewer

标记体系（对应 TDD §九）：
- api: 需要真实 API 调用（Qwen 27B OpenRouter）
- claude: 需要 Claude API（Judge 评估）
- slow: 运行超过30秒
- dpa: DPA Agent 专项测试
- bca: BCA Agent 专项测试
- fca: FCA Agent 专项测试
- ora: ORA Agent 专项测试
"""
import pytest


def pytest_configure(config):
    config.addinivalue_line("markers", "api: test requires real API call (Qwen 27B OpenRouter)")
    config.addinivalue_line("markers", "claude: test requires Claude API (Judge evaluation)")
    config.addinivalue_line("markers", "slow: test is slow (API call, >30s)")
    config.addinivalue_line("markers", "dpa: DPA Agent specific test")
    config.addinivalue_line("markers", "bca: BCA Agent specific test")
    config.addinivalue_line("markers", "fca: FCA Agent specific test")
    config.addinivalue_line("markers", "ora: ORA Agent specific test")
