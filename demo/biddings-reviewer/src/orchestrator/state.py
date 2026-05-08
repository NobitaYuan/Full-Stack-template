"""状态管理 —— biddings-reviewer

原子写入 + asyncio.Lock 保护并发安全。
支持断点恢复。
"""

import asyncio
from pathlib import Path

from src.shared.models import (
    ReviewPhase, ReviewVerdict,
    PipelineState, VALID_TRANSITIONS,
)


class ReviewStateManager:
    """审查流水线状态管理器"""

    def __init__(self, state_file: Path):
        self.state_file = state_file
        self._lock = asyncio.Lock()

    def load_or_init(self, project_code: str) -> PipelineState:
        if self.state_file.exists():
            try:
                return PipelineState.from_json(self.state_file.read_text(encoding="utf-8"))
            except Exception:
                pass
        state = PipelineState(project_code=project_code)
        self._atomic_save(state)
        return state

    def load(self) -> PipelineState:
        return PipelineState.from_json(self.state_file.read_text(encoding="utf-8"))

    def save(self, state: PipelineState) -> None:
        self._atomic_save(state)

    async def transition_phase(self, new_phase: ReviewPhase) -> PipelineState:
        async with self._lock:
            state = self.load()
            allowed = VALID_TRANSITIONS.get(state.phase, [])
            if new_phase not in allowed:
                raise ValueError(
                    f"非法状态转换: {state.phase} → {new_phase}（允许: {allowed}）"
                )
            state.phase = new_phase
            self._atomic_save(state)
            return state

    async def update_state(self, **updates) -> None:
        async with self._lock:
            state = self.load()
            for key, val in updates.items():
                if hasattr(state, key):
                    setattr(state, key, val)
            self._atomic_save(state)

    def _atomic_save(self, state: PipelineState) -> None:
        tmp = self.state_file.with_suffix(".tmp")
        tmp.write_text(state.to_json(), encoding="utf-8")
        tmp.replace(self.state_file)


def transition(state: PipelineState, new_phase: ReviewPhase) -> PipelineState:
    allowed = VALID_TRANSITIONS.get(state.phase, [])
    if new_phase not in allowed:
        raise ValueError(f"非法状态转换: {state.phase} → {new_phase}（允许: {allowed}）")
    state.phase = new_phase
    return state


def save_state(state: PipelineState, path: str) -> None:
    p = Path(path)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(state.to_json(), encoding="utf-8")
    tmp.replace(p)


def load_state(path: str) -> PipelineState:
    return PipelineState.from_json(Path(path).read_text(encoding="utf-8"))
