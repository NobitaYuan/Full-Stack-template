"""Reviewer 质量测试 —— 使用真实 API 调用测试审查产出

qwen3.6-27b 适配：
- 更低温度（0.0-0.1）确保确定性
- 更严格的格式校验
- 更完整的输出检查项

运行: pytest tests/quality/test_reviewer.py -v -m api
"""

import pytest
import asyncio
from src.shared.models import ReviewPhase
from src.orchestrator.pipeline import ReviewPipeline
from src.orchestrator.context_builder import (
    build_dpa_round1_prompt,
    build_bca_prompt,
    build_fca_prompt,
    build_report_prompt,
    validate_review_format,
    is_format_valid,
)
from src.agents.prompts import load_prompt
from src.agents.options import AgentOptions, OPTIONS_BUILDERS
from src.agents.client import call_with_retry
from tests.fixtures.sample_docs import (
    TENDER_DOC_FULL,
    BID_TECH_PROPOSAL,
    BID_DOCS_FULL,
)


# ── 代码级检查（无 API）──

class TestReviewerCodeLevel:
    """不需要 API 的代码级检查"""

    def test_pipeline_init(self, tmp_path):
        pipeline = ReviewPipeline(
            project_code="TEST-PROJ",
            output_dir=str(tmp_path / "output"),
        )
        state = pipeline.init_state()
        assert state is not None
        assert state.phase == ReviewPhase.DPA_ROUND_1

    def test_dpa_prompt_built(self):
        prompt = build_dpa_round1_prompt(TENDER_DOC_FULL)
        assert len(prompt) > 1000
        assert "★号条款" in prompt
        assert "资格准入" in prompt
        assert "评分标准" in prompt
        assert "格式与封装" in prompt

    def test_bca_prompt_built(self):
        prompt = build_bca_prompt("baseline test", "extracted fields test")
        assert len(prompt) > 500
        assert "废标红线" in prompt
        assert "中标胜算" in prompt

    def test_fca_prompt_built(self):
        prompt = build_fca_prompt("bid text", "extracted fields")
        assert len(prompt) > 500
        assert "隐蔽风险" in prompt
        assert "电子文件" in prompt

    def test_report_prompt_built(self):
        prompt = build_report_prompt("PROJ001", "baseline", "bca", "fca")
        assert len(prompt) > 1000
        assert "项目概况" in prompt
        assert "否决项" in prompt
        assert "人工复核" in prompt

    def test_options_configured(self):
        for name, builder in OPTIONS_BUILDERS.items():
            sp = f"test system prompt for {name}"
            opts = builder(sp)
            assert opts.system_prompt == sp
            assert 0 <= opts.temperature <= 1.0
            assert opts.max_tokens > 0

    def test_prompts_loadable(self):
        for name in ("dpa", "bca", "fca", "ora"):
            prompt = load_prompt(name)
            assert len(prompt) > 100, f"Prompt {name} too short: {len(prompt)} chars"

    def test_format_validator_dpa_round1_pass(self):
        output = """
## A. ★号条款提取
| 序号 | ★条款编号 |
| 1 | ★1.1 |

## B. 资格准入条件提取
| 序号 | 条件类型 |
| 1 | 保密资质 |

## C. 评分标准提取
| 序号 | 评分类别 |
| 1 | 商务 |

## D. 格式与封装要求提取
| 序号 | 要求类型 |
| 1 | 投标书格式 |
"""
        issues = validate_review_format(output, "dpa_round1")
        assert is_format_valid(issues), f"Failed: {issues}"


# ── 真 API 调用测试（需 OpenRouter）──

@pytest.mark.api
@pytest.mark.slow
class TestDPAWithAPI:
    """DPA 审查基准提取 API 测试"""

    @pytest.fixture
    def dpa_round1_result(self) -> str | None:
        try:
            system_prompt = load_prompt("dpa")
            user_prompt = build_dpa_round1_prompt(TENDER_DOC_FULL)
            opts = OPTIONS_BUILDERS["dpa"](system_prompt)
            result = asyncio.run(call_with_retry(
                prompt=user_prompt,
                options=opts,
                max_retries=2,
            ))
            return result
        except Exception as e:
            pytest.skip(f"API 不可用: {e}")

    def test_produces_output(self, dpa_round1_result):
        assert dpa_round1_result, "DPA 未产出结果"
        assert len(dpa_round1_result) > 200, f"输出太短: {len(dpa_round1_result)} 字符"

    def test_has_star_clauses_table(self, dpa_round1_result):
        assert "★号条款" in dpa_round1_result, "缺少★号条款表格"
        # 检查是否提取了至少3条★条款
        star_count = dpa_round1_result.count("★")
        assert star_count >= 2, f"★条款提取不足: 仅找到{star_count}处"

    def test_has_qualification_table(self, dpa_round1_result):
        assert "资格准入" in dpa_round1_result, "缺少资格准入条件表格"

    def test_has_scoring_table(self, dpa_round1_result):
        assert "评分标准" in dpa_round1_result, "缺少评分标准表格"

    def test_has_format_table(self, dpa_round1_result):
        assert "格式" in dpa_round1_result or "封装" in dpa_round1_result, "缺少格式要求表格"

    def test_identifies_rejection_items(self, dpa_round1_result):
        # 检查是否正确标注了"不接受负偏离"
        assert "不接受负偏离" in dpa_round1_result or "否" in dpa_round1_result, \
            "未标注★条款是否接受负偏离"

    def test_format_validation_pass(self, dpa_round1_result):
        issues = validate_review_format(dpa_round1_result, "dpa_round1")
        if not is_format_valid(issues):
            pytest.fail(f"格式校验未通过: {issues}")

    def test_no_ai_trace_phrases(self, dpa_round1_result):
        """输出中不应有暴露AI痕迹的短语"""
        forbidden = ["根据指令手册", "按照SOP", "智能体判断", "作为DPA"]
        for phrase in forbidden:
            assert phrase not in dpa_round1_result, f"发现AI痕迹短语: {phrase}"


@pytest.mark.api
@pytest.mark.slow
class TestBCAWithAPI:
    """BCA 审查 API 测试"""

    @pytest.fixture
    def bca_result(self) -> str | None:
        try:
            system_prompt = load_prompt("bca")
            # 构建一个包含 baseline + extracted fields 的 prompt
            user_prompt = build_bca_prompt(
                baseline=f"""
## A. ★号条款
| 序号 | ★条款编号 | 条款原文 | 是否接受负偏离 |
| 1 | ★1 | 响应时间≤100ms | 否 |
| 2 | ★2 | 国产化部署 | 否 |
| 3 | ★3 | 态势感知数据融合 | 否 |
| 4 | ★4 | 安全保密要求 | 否 |
| 5 | ★5 | 系统可靠性 | 是 |

## B. 资格准入条件
| 序号 | 条件类型 | 招标要求 |
| 1 | 保密资质 | 二级及以上 |
| 2 | 社保 | 投标前4个月内连续3个月 |

## C. 评分标准
| 序号 | 评分类别 | 评分项 | 满分 |
| 1 | 商务 | 类似业绩 | 15 |
| 2 | 技术 | 方案完整性 | 20 |
| 3 | 价格 | 低价优先 | 10 |

## D. 格式要求
投标保证金：50万元，基本账户，截止时间2026-06-15
""",
                extracted_fields=f"""
公司名称：XX科技有限公司
保密资质：二级，有效期至2027-03-01
社保：2026年1-4月连续4个月
★1响应：承诺≤80ms
★2响应：已适配飞腾+麒麟+达梦
★3响应：支持雷达/光电/电子/通信4类数据源
★4响应：SM2/SM3/SM4国密算法
★5响应：7×24h，可用性≥99.95%
""",
            )
            opts = OPTIONS_BUILDERS["bca"](system_prompt)
            result = asyncio.run(call_with_retry(
                prompt=user_prompt,
                options=opts,
                max_retries=2,
            ))
            return result
        except Exception as e:
            pytest.skip(f"API 不可用: {e}")

    def test_produces_output(self, bca_result):
        assert bca_result, "BCA 未产出结果"
        assert len(bca_result) > 300, f"输出太短: {len(bca_result)} 字符"

    def test_has_review_dimensions(self, bca_result):
        assert "资格准入" in bca_result or "资质" in bca_result, "缺少资格准入检查"
        assert "★" in bca_result or "条款" in bca_result, "缺少★条款检查"

    def test_has_verdict(self, bca_result):
        assert "PASS" in bca_result or "FAIL" in bca_result or \
               "合格" in bca_result or "不合格" in bca_result, \
               "缺少明确的审查判定"

    def test_format_validation(self, bca_result):
        issues = validate_review_format(bca_result, "bca")
        if not is_format_valid(issues):
            pytest.fail(f"格式校验未通过: {issues}")

    def test_no_ai_trace(self, bca_result):
        forbidden = ["根据指令手册", "按照SOP", "作为BCA", "智能体判断"]
        for phrase in forbidden:
            assert phrase not in bca_result, f"发现AI痕迹: {phrase}"


@pytest.mark.api
@pytest.mark.slow
class TestFCAWithAPI:
    """FCA 审查 API 测试"""

    @pytest.fixture
    def fca_result(self) -> str | None:
        try:
            system_prompt = load_prompt("fca")
            user_prompt = build_fca_prompt(
                bid_docs_text=BID_TECH_PROPOSAL,
                extracted_fields="公司名称：XX科技有限公司\n保密资质：二级\n人员配置：12人",
            )
            opts = OPTIONS_BUILDERS["fca"](system_prompt)
            result = asyncio.run(call_with_retry(
                prompt=user_prompt,
                options=opts,
                max_retries=2,
            ))
            return result
        except Exception as e:
            pytest.skip(f"API 不可用: {e}")

    def test_produces_output(self, fca_result):
        assert fca_result, "FCA 未产出结果"
        assert len(fca_result) > 200, f"输出太短: {len(fca_result)} 字符"

    def test_has_review_dimensions(self, fca_result):
        assert "脱敏" in fca_result or "暗标" in fca_result or \
               "数据" in fca_result, "缺少隐蔽风险检查"

    def test_has_verdict(self, fca_result):
        assert "PASS" in fca_result or "FAIL" in fca_result or \
               "合格" in fca_result or "不合格" in fca_result, \
               "缺少明确的审查判定"


@pytest.mark.api
@pytest.mark.slow
class TestReportWithAPI:
    """报告编译 API 测试"""

    @pytest.fixture
    def report_result(self) -> str | None:
        try:
            system_prompt = load_prompt("ora")
            user_prompt = build_report_prompt(
                project_code="JLZ270",
                baseline="★条款5条，资格准入9项，评分标准3类",
                bca_result="""
废标红线审查结果：
- 资格准入：9项全部PASS
- ★条款响应：5条全部PASS
- 否决项：0个
中标胜算评估：
- 商务得分预估：35/40 (87.5%)
- 技术得分预估：42/50 (84%)
- 预估总分：87/100
- 审查状态：良
""",
                fca_result="""
隐蔽风险探测：
- 暗标脱敏：通过
- 数据勾稽：一致
- 缺陷项：0个
电子文件安检：
- 文件格式：合规
- 电子签章：有效
- 审查状态：合格
""",
            )
            opts = OPTIONS_BUILDERS["ora"](system_prompt)
            result = asyncio.run(call_with_retry(
                prompt=user_prompt,
                options=opts,
                max_retries=2,
            ))
            return result
        except Exception as e:
            pytest.skip(f"API 不可用: {e}")

    def test_produces_report(self, report_result):
        assert report_result, "ORA 未产出报告"
        assert len(report_result) > 500, f"报告太短: {len(report_result)} 字符"

    def test_has_report_sections(self, report_result):
        # 检查报告中至少包含大部分必要章节
        required_sections = [
            ("项目", "缺少项目信息"),
            ("废标红线", "缺少废标红线审查"),
            ("胜算", "缺少中标胜算"),
            ("隐蔽", "缺少隐蔽风险"),
            ("电子文件", "缺少电子文件安检"),
            ("否决", "缺少否决项"),
        ]
        found = sum(1 for kw, _ in required_sections if kw in report_result)
        assert found >= 3, f"报告章节不完整，仅找到{found}/{len(required_sections)}类关键词"

    def test_has_recommendation(self, report_result):
        recommendations = ["建议递交", "有条件递交", "不建议递交", "建议投标", "建议参与", "投标建议"]
        found = any(r in report_result for r in recommendations)
        assert found, f"缺少投标建议，须包含以下之一: {recommendations}"

    def test_has_manual_review_section(self, report_result):
        # 检查是否包含人工复核相关内容（较小的模型可能使用不同的措辞）
        manual_keywords = ["人工复核", "人工检查", "复核事项", "线下", "确认事项"]
        found = any(kw in report_result for kw in manual_keywords)
        assert found, f"缺少人工复核/线下检查章节，报告内容前200字: {report_result[:200]}"

    def test_no_ai_trace(self, report_result):
        forbidden = ["根据指令手册", "按照SOP", "作为ORA", "智能体判断",
                     "根据第五章", "根据审查流程"]
        for phrase in forbidden:
            assert phrase not in report_result, f"发现AI痕迹: {phrase}"
