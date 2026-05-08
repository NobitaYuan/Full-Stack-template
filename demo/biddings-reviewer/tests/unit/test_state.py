"""状态管理单元测试 —— biddings-reviewer

测试 ReviewStateManager 的初始化、持久化、原子写入、状态转换。
"""
import pytest
from src.shared.models import ReviewPhase, PipelineState, VALID_TRANSITIONS
from src.orchestrator.state import ReviewStateManager, transition


class TestStateManager:
    def test_load_or_init_creates_new_state(self, tmp_path):
        """不存在状态文件时创建全新的 PipelineState"""
        manager = ReviewStateManager(tmp_path / "state.json")
        state = manager.load_or_init("TEST-PROJ")
        assert state.project_code == "TEST-PROJ"
        assert state.phase == ReviewPhase.DPA_ROUND_1

    def test_save_and_load_roundtrip(self, tmp_path):
        """保存后加载，状态一致"""
        manager = ReviewStateManager(tmp_path / "state.json")
        state = manager.load_or_init("TEST-PROJ")
        state.phase = ReviewPhase.DPA_ROUND_2
        manager.save(state)

        manager2 = ReviewStateManager(tmp_path / "state.json")
        restored = manager2.load()
        assert restored.project_code == "TEST-PROJ"
        assert restored.phase == ReviewPhase.DPA_ROUND_2

    def test_atomic_save_no_corruption(self, tmp_path):
        """写入不产生损坏文件——验证临时文件不存在"""
        state_file = tmp_path / "state.json"
        manager = ReviewStateManager(state_file)
        state = manager.load_or_init("TEST")
        manager.save(state)
        # 临时文件应该已被 rename 掉
        tmp_files = list(tmp_path.glob("*.tmp"))
        assert len(tmp_files) == 0

    def test_transition_valid_phase(self):
        """合法状态转换"""
        state = PipelineState(project_code="TEST")
        new_state = transition(state, ReviewPhase.DPA_ROUND_2)
        assert new_state.phase == ReviewPhase.DPA_ROUND_2

    def test_transition_invalid_phase_raises(self):
        """非法跳步应抛出 ValueError"""
        state = PipelineState(project_code="TEST")  # DPA_ROUND_1
        with pytest.raises(ValueError, match="非法状态转换"):
            transition(state, ReviewPhase.DONE)

    def test_transition_full_chain(self):
        """完整的状态转换链"""
        state = PipelineState(project_code="TEST")
        assert state.phase == ReviewPhase.DPA_ROUND_1

        state = transition(state, ReviewPhase.DPA_ROUND_2)
        assert state.phase == ReviewPhase.DPA_ROUND_2

        state = transition(state, ReviewPhase.BCA_BCA)
        assert state.phase == ReviewPhase.BCA_BCA

        state = transition(state, ReviewPhase.REPORT_COMPILING)
        assert state.phase == ReviewPhase.REPORT_COMPILING

        state = transition(state, ReviewPhase.DONE)
        assert state.phase == ReviewPhase.DONE

    def test_load_or_init_reuses_existing(self, tmp_path):
        """已存在合法状态文件时复用，而非创建新状态"""
        state_file = tmp_path / "state.json"
        manager1 = ReviewStateManager(state_file)
        state1 = manager1.load_or_init("PROJ-A")
        state1.phase = ReviewPhase.BCA_BCA
        manager1.save(state1)

        manager2 = ReviewStateManager(state_file)
        state2 = manager2.load_or_init("PROJ-B")  # different code, but file exists
        # 应加载已有状态，忽略传入的 project_code
        assert state2.project_code == "PROJ-A"
        assert state2.phase == ReviewPhase.BCA_BCA

    def test_corrupted_state_file_falls_back(self, tmp_path):
        """损坏的状态文件回退到新建"""
        state_file = tmp_path / "state.json"
        state_file.write_text("not valid json{{{", encoding="utf-8")

        manager = ReviewStateManager(state_file)
        state = manager.load_or_init("FALLBACK")
        assert state.project_code == "FALLBACK"
        assert state.phase == ReviewPhase.DPA_ROUND_1
