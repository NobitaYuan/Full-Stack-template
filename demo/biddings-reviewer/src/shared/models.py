"""biddings-reviewer 数据模型

审查流水线的核心数据结构：
- ReviewPhase: 审查阶段枚举
- ReviewVerdict: 审查判定枚举
- ReviewBaseline: DPA 提取的审查基准
- ComplianceResult: 单项合规检查结果
- ReviewReport: 最终审查报告
- PipelineState: 流水线状态
"""

import json
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional


class ReviewPhase(str, Enum):
    DPA_ROUND_1 = "dpa_round_1"       # 招标文件解析 + 审查基准提取
    DPA_ROUND_2 = "dpa_round_2"       # 投标文件解析 + 字段护照提取
    BCA_BCA = "bca_bca"               # BCA 审查（废标红线 + 中标胜算）
    FCA_FCA = "fca_fca"               # FCA 审查（隐蔽风险 + 电子文件安检）
    REPORT_COMPILING = "report_compiling"  # 报告编译
    DONE = "done"


class ReviewVerdict(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARNING = "WARNING"
    PENDING = "PENDING"


class RiskLevel(str, Enum):
    HIGH = "高"      # 含否决项
    MEDIUM = "中"    # 有失分风险或合规瑕疵
    LOW = "低"       # 仅形式规范问题


@dataclass
class StarClause:
    """★号条款"""
    clause_ref: str = ""
    text: str = ""
    chapter: str = ""
    accept_negative_deviation: bool = False  # 是否接受负偏离
    required_evidence_type: str = ""  # 所需支撑材料类型


@dataclass
class QualificationItem:
    """资格准入条件"""
    item_type: str = ""         # 保密资质/社保/纳税/审计/...
    requirement_summary: str = ""  # 招标要求摘要
    chapter: str = ""
    is_rejection_item: bool = False  # 是否标注废标项


@dataclass
class ScoringCriterion:
    """评分标准"""
    category: str = ""       # 商务/技术/价格
    item_name: str = ""
    max_score: float = 0
    rule_summary: str = ""


@dataclass
class FormatRequirement:
    """格式与封装要求"""
    req_type: str = ""
    requirement: str = ""
    chapter: str = ""


@dataclass
class ReviewBaseline:
    """DPA 提取的审查基准"""
    project_name: str = ""
    project_code: str = ""
    bid_opening_date: str = ""  # 开标日期
    star_clauses: list[StarClause] = field(default_factory=list)
    qualifications: list[QualificationItem] = field(default_factory=list)
    scoring_criteria: list[ScoringCriterion] = field(default_factory=list)
    format_requirements: list[FormatRequirement] = field(default_factory=list)
    bid_bond_amount: str = ""    # 投标保证金金额
    bid_bond_deadline: str = ""  # 保证金截止时间


@dataclass
class ComplianceResult:
    """单项合规检查结果"""
    check_id: str = ""
    dimension: str = ""          # 废标红线/中标胜算/隐蔽风险/电子文件安检
    check_item: str = ""         # 具体检查项
    verdict: ReviewVerdict = ReviewVerdict.PENDING
    requirement: str = ""        # 招标要求
    actual: str = ""             # 标书实际
    evidence_location: str = ""  # 支撑材料位置
    is_rejection: bool = False   # 是否否决项
    detail: str = ""             # 详细说明
    fix_suggestion: str = ""     # 整改建议

    def to_dict(self) -> dict:
        d = asdict(self)
        d["verdict"] = self.verdict.value
        return d


@dataclass
class DimensionSummary:
    """单个审查维度的汇总"""
    dimension: str = ""          # 维度名
    status: str = ""             # 合格/存在风险/优/良/中/低/严谨/存在瑕疵
    core_conclusion: str = ""    # 核心结论
    risk_level: RiskLevel = RiskLevel.LOW
    rejection_items: list[str] = field(default_factory=list)
    defect_items: list[str] = field(default_factory=list)
    results: list[ComplianceResult] = field(default_factory=list)


@dataclass
class ReviewReport:
    """最终审查报告"""
    project_code: str = ""
    project_name: str = ""
    review_date: str = ""
    bid_opening_date: str = ""

    # 四维度汇总
    waste_redline: Optional[DimensionSummary] = None      # 废标红线
    scoring_evaluation: Optional[DimensionSummary] = None  # 中标胜算
    hidden_risk: Optional[DimensionSummary] = None         # 隐蔽风险
    file_inspection: Optional[DimensionSummary] = None     # 电子文件安检

    # 综合结论
    overall_conclusion: str = ""   # 综合审查结论
    bid_recommendation: str = ""   # 投标建议：建议递交/有条件递交/不建议递交
    conditions: list[str] = field(default_factory=list)

    # 否决项与缺陷项
    rejection_list: list[dict] = field(default_factory=list)
    defect_list: list[dict] = field(default_factory=list)

    # 人工复核事项
    manual_review_items: list[dict] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=2, default=str)


@dataclass
class PipelineState:
    """审查流水线状态"""
    project_code: str = ""
    phase: ReviewPhase = ReviewPhase.DPA_ROUND_1
    review_baseline: Optional[ReviewBaseline] = None
    compliance_results: list[ComplianceResult] = field(default_factory=list)
    report: Optional[ReviewReport] = None
    errors: list[dict] = field(default_factory=list)

    def to_json(self) -> str:
        d = {
            "project_code": self.project_code,
            "phase": self.phase.value,
            "review_baseline": asdict(self.review_baseline) if self.review_baseline else None,
            "compliance_results": [r.to_dict() for r in self.compliance_results],
            "report": json.loads(self.report.to_json()) if self.report else None,
            "errors": self.errors,
        }
        return json.dumps(d, ensure_ascii=False, indent=2, default=str)

    @classmethod
    def from_json(cls, text: str) -> "PipelineState":
        d = json.loads(text)
        state = cls(
            project_code=d.get("project_code", ""),
            phase=ReviewPhase(d.get("phase", "dpa_round_1")),
            errors=d.get("errors", []),
        )
        if d.get("review_baseline"):
            state.review_baseline = ReviewBaseline(**d["review_baseline"])
        if d.get("compliance_results"):
            state.compliance_results = [
                ComplianceResult(**{**r, "verdict": ReviewVerdict(r.get("verdict", "PENDING"))})
                for r in d["compliance_results"]
            ]
        return state


VALID_TRANSITIONS: dict[ReviewPhase, list[ReviewPhase]] = {
    ReviewPhase.DPA_ROUND_1: [ReviewPhase.DPA_ROUND_2],
    ReviewPhase.DPA_ROUND_2: [ReviewPhase.BCA_BCA],  # BCA+FCA 并行由 pipeline 内部处理
    ReviewPhase.BCA_BCA: [ReviewPhase.REPORT_COMPILING],
    ReviewPhase.REPORT_COMPILING: [ReviewPhase.DONE],
}
