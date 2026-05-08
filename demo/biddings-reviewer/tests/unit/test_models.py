"""数据模型单元测试"""
import json
import pytest
from src.shared.models import (
    ReviewPhase, ReviewVerdict, RiskLevel,
    ReviewBaseline, StarClause, QualificationItem,
    ScoringCriterion, FormatRequirement,
    ComplianceResult, DimensionSummary, ReviewReport,
    PipelineState, VALID_TRANSITIONS,
)


class TestEnums:
    def test_phase_transitions_valid(self):
        """合法状态转换"""
        assert ReviewPhase.DPA_ROUND_2 in VALID_TRANSITIONS[ReviewPhase.DPA_ROUND_1]
        assert ReviewPhase.BCA_BCA in VALID_TRANSITIONS[ReviewPhase.DPA_ROUND_2]
        assert ReviewPhase.REPORT_COMPILING in VALID_TRANSITIONS[ReviewPhase.BCA_BCA]
        assert ReviewPhase.DONE in VALID_TRANSITIONS[ReviewPhase.REPORT_COMPILING]

    def test_phase_transitions_no_skip(self):
        """不能跳阶段"""
        assert ReviewPhase.DONE not in VALID_TRANSITIONS[ReviewPhase.DPA_ROUND_1]
        assert ReviewPhase.BCA_BCA not in VALID_TRANSITIONS[ReviewPhase.DPA_ROUND_1]

    def test_verdict_values(self):
        assert ReviewVerdict.PASS.value == "PASS"
        assert ReviewVerdict.FAIL.value == "FAIL"
        assert ReviewVerdict.WARNING.value == "WARNING"

    def test_risk_level_values(self):
        assert RiskLevel.HIGH.value == "高"
        assert RiskLevel.MEDIUM.value == "中"
        assert RiskLevel.LOW.value == "低"


class TestReviewBaseline:
    def test_empty_baseline(self):
        b = ReviewBaseline()
        assert b.star_clauses == []
        assert b.qualifications == []
        assert b.scoring_criteria == []

    def test_with_star_clauses(self):
        b = ReviewBaseline(
            project_name="测试项目",
            project_code="TEST001",
            star_clauses=[
                StarClause(clause_ref="★1.1", text="系统响应时间≤100ms")
            ],
            qualifications=[
                QualificationItem(item_type="保密资质", requirement_summary="二级及以上")
            ],
        )
        assert len(b.star_clauses) == 1
        assert len(b.qualifications) == 1
        assert b.star_clauses[0].clause_ref == "★1.1"


class TestComplianceResult:
    def test_to_dict(self):
        r = ComplianceResult(
            check_id="QUAL-001",
            dimension="废标红线",
            check_item="保密资质检查",
            verdict=ReviewVerdict.PASS,
            requirement="二级及以上",
            actual="二级保密资格",
            evidence_location="资质文件P3",
            is_rejection=False,
            detail="资质等级满足要求",
        )
        d = r.to_dict()
        assert d["check_id"] == "QUAL-001"
        assert d["verdict"] == "PASS"
        assert d["is_rejection"] is False

    def test_fail_verdict(self):
        r = ComplianceResult(
            check_id="STAR-003",
            dimension="废标红线",
            check_item="★条款3.1响应",
            verdict=ReviewVerdict.FAIL,
            is_rejection=True,
            detail="完全未响应",
            fix_suggestion="补充对★3.1条款的响应和支撑材料",
        )
        assert r.verdict == ReviewVerdict.FAIL
        assert r.is_rejection is True


class TestDimensionSummary:
    def test_empty_summary(self):
        s = DimensionSummary(dimension="废标红线")
        assert s.status == ""
        assert s.risk_level == RiskLevel.LOW
        assert s.rejection_items == []

    def test_with_rejection(self):
        s = DimensionSummary(
            dimension="废标红线",
            status="存在风险",
            risk_level=RiskLevel.HIGH,
            rejection_items=["保密资质过期", "★3.1未响应"],
        )
        assert len(s.rejection_items) == 2
        assert s.risk_level == RiskLevel.HIGH


class TestReviewReport:
    def test_empty_report(self):
        r = ReviewReport(project_code="TEST001")
        json_str = r.to_json()
        data = json.loads(json_str)
        assert data["project_code"] == "TEST001"

    def test_report_with_dimensions(self):
        r = ReviewReport(
            project_code="TEST001",
            project_name="某部队信息系统采购项目",
            review_date="2026-05-04",
            waste_redline=DimensionSummary(
                dimension="废标红线",
                status="合格",
                core_conclusion="无否决项",
                risk_level=RiskLevel.LOW,
            ),
            scoring_evaluation=DimensionSummary(
                dimension="中标胜算",
                status="良",
                core_conclusion="商务+技术预估得分75%",
                risk_level=RiskLevel.MEDIUM,
            ),
        )
        json_str = r.to_json()
        data = json.loads(json_str)
        assert data["waste_redline"]["status"] == "合格"
        assert data["scoring_evaluation"]["status"] == "良"


class TestPipelineState:
    def test_init(self):
        s = PipelineState(project_code="TEST001")
        assert s.phase == ReviewPhase.DPA_ROUND_1
        assert s.review_baseline is None

    def test_serialize_roundtrip(self):
        s = PipelineState(
            project_code="TEST001",
            phase=ReviewPhase.DPA_ROUND_2,
        )
        json_str = s.to_json()
        s2 = PipelineState.from_json(json_str)
        assert s2.project_code == "TEST001"
        assert s2.phase == ReviewPhase.DPA_ROUND_2

    def test_serialize_with_baseline(self):
        s = PipelineState(
            project_code="TEST001",
            phase=ReviewPhase.BCA_BCA,
            review_baseline=ReviewBaseline(
                project_name="测试",
                star_clauses=[StarClause(clause_ref="★1.1", text="测试")]
            ),
            compliance_results=[
                ComplianceResult(
                    check_id="Q-001",
                    verdict=ReviewVerdict.PASS,
                )
            ],
        )
        json_str = s.to_json()
        s2 = PipelineState.from_json(json_str)
        assert s2.review_baseline is not None
        assert len(s2.review_baseline.star_clauses) == 1
        assert len(s2.compliance_results) == 1
        assert s2.compliance_results[0].verdict == ReviewVerdict.PASS
