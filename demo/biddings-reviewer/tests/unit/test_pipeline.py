"""Pipeline 编排器单元测试

测试 ReviewPipeline 的初始化、阶段转换、格式修正 prompt 构建。
使用 mock 文档，不依赖 API。
"""
import pytest
from pathlib import Path
from src.shared.models import ReviewPhase, PipelineState
from src.orchestrator.pipeline import ReviewPipeline, _build_format_fix_prompt


# ── 测试文档 ──

MOCK_TENDER_DOC = """
某部队信息系统采购项目招标文件
招标编号：2026-JLZ270-W1001

一、投标人须知
1. 本项目采用公开招标方式
2. 投标人须具备二级及以上保密资格
3. 社保要求：投标前4个月内连续3个月缴纳记录
4. 开标日期：2026年6月15日

二、★号条款
★1.1 系统响应时间≤100ms，不接受负偏离
★2.1 支持国产化部署环境（飞腾CPU+麒麟OS）
★3.1 具备态势感知数据融合能力，不接受负偏离

三、评分标准
商务部分（40分）：类似业绩15分，团队资质10分，知识产权10分，财务状况5分
技术部分（50分）：方案完整性20分，关键技术15分，标准遵循10分，项目实施5分
价格部分（10分）：低价优先法，最高限价1500万元

四、投标文件要求
1. 投标书格式见附件A
2. 所有文件需加盖公章
3. 投标保证金：人民币50万元，从基本账户转出
"""

MOCK_BID_DOC = """
投标文件（技术方案）
投标人：XX科技有限公司

一、公司概况
XX科技有限公司成立于2010年，注册资本5000万元。
法定代表人：张三。经营范围包括软件开发、系统集成。

二、资质证明
1. 武器装备科研生产单位二级保密资格证书，编号BZ2022010001，有效期至2027年3月1日
2. 涉密信息系统集成资质证书（软件开发方向），编号JM20230001

三、技术方案
本系统采用"四化五层"架构设计。
针对★1.1系统响应时间：承诺≤80ms
针对★2.1国产化部署：方案全部使用国产化软硬件
针对★3.1态势感知数据融合：方案包含多源数据融合引擎

四、项目团队
项目经理：李四（PMP认证）
团队成员：12人

五、报价汇总
总报价：人民币壹仟贰佰万元整（¥12,000,000.00）
"""


class TestPipelineInit:
    def test_output_dir_created(self, tmp_path):
        pipeline = ReviewPipeline("TEST", output_dir=str(tmp_path / "output"))
        state = pipeline.init_state()
        assert (tmp_path / "output").exists()
        assert state is not None

    def test_state_initialized_correctly(self, tmp_path):
        pipeline = ReviewPipeline("TEST", output_dir=str(tmp_path))
        state = pipeline.init_state()
        assert state.phase == ReviewPhase.DPA_ROUND_1
        assert state.project_code == "TEST"

    def test_pipeline_creation(self, tmp_path):
        pipeline = ReviewPipeline(
            project_code="TEST001",
            output_dir=str(tmp_path / "output"),
        )
        assert pipeline.project_code == "TEST001"
        assert pipeline.output_dir.exists()


class TestPhaseTransition:
    def test_dpa_round1_to_round2(self, tmp_path):
        from src.orchestrator.state import transition
        pipeline = ReviewPipeline("TEST", output_dir=str(tmp_path))
        pipeline.init_state()
        pipeline.state = transition(pipeline.state, ReviewPhase.DPA_ROUND_2)
        assert pipeline.state.phase == ReviewPhase.DPA_ROUND_2

    def test_full_transition_chain(self, tmp_path):
        from src.orchestrator.state import transition
        pipeline = ReviewPipeline("TEST", output_dir=str(tmp_path))
        pipeline.init_state()

        pipeline.state = transition(pipeline.state, ReviewPhase.DPA_ROUND_2)
        pipeline.state = transition(pipeline.state, ReviewPhase.BCA_BCA)
        pipeline.state = transition(pipeline.state, ReviewPhase.REPORT_COMPILING)
        pipeline.state = transition(pipeline.state, ReviewPhase.DONE)
        assert pipeline.state.phase == ReviewPhase.DONE


class TestFormatFixPrompt:
    def test_build_format_fix_prompt_preserves_original(self):
        original = "请提取★号条款"
        issues = ["缺少「评分标准」表格"]
        fixed = _build_format_fix_prompt(original, issues)
        assert original in fixed
        assert "格式修正要求" in fixed
        assert "评分标准" in fixed

    def test_multiple_issues(self):
        original = "原始任务"
        issues = ["问题A", "问题B", "问题C"]
        result = _build_format_fix_prompt(original, issues)
        assert "问题A" in result
        assert "问题B" in result
        assert "问题C" in result


class TestMockDocuments:
    def test_tender_contains_star_clauses(self):
        assert "★1.1" in MOCK_TENDER_DOC
        assert "★2.1" in MOCK_TENDER_DOC
        assert "★3.1" in MOCK_TENDER_DOC

    def test_tender_contains_qualifications(self):
        assert "保密资格" in MOCK_TENDER_DOC
        assert "社保" in MOCK_TENDER_DOC
        assert "保证金" in MOCK_TENDER_DOC

    def test_bid_contains_responses(self):
        assert "XX科技有限公司" in MOCK_BID_DOC
        assert "≤80ms" in MOCK_BID_DOC
        assert "态势感知" in MOCK_BID_DOC

    def test_bid_contains_qualifications(self):
        assert "二级保密资格" in MOCK_BID_DOC
        assert "涉密信息系统集成资质" in MOCK_BID_DOC
