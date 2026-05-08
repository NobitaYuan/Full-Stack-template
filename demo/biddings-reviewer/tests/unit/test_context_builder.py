"""Context Builder 单元测试"""
import pytest
from src.orchestrator.context_builder import (
    _truncate,
    build_dpa_round1_prompt,
    build_dpa_round2_prompt,
    build_bca_prompt,
    build_fca_prompt,
    build_report_prompt,
)
from src.orchestrator.pipeline import _build_format_fix_prompt


class TestTruncate:
    def test_no_truncation_needed(self):
        text = "短文本"
        assert _truncate(text, 1000) == text

    def test_truncation(self):
        text = "A" * 15000
        result = _truncate(text, 10000)
        assert len(result) <= 10000 + 200  # 含截断提示
        assert "截断" in result

    def test_exact_boundary(self):
        text = "A" * 100
        result = _truncate(text, 100)
        assert result == text


class TestDPAPrompts:
    def test_round1_contains_key_sections(self):
        tender = "招标文件测试内容：★1.1 系统响应时间≤100ms"
        prompt = build_dpa_round1_prompt(tender)
        assert "招标文件全文" in prompt
        assert "★号条款提取" in prompt
        assert "资格准入条件提取" in prompt
        assert "评分标准提取" in prompt
        assert "格式与封装要求提取" in prompt
        assert tender in prompt

    def test_round1_has_output_format_instructions(self):
        prompt = build_dpa_round1_prompt("测试")
        assert "输出要求" in prompt
        assert "表格" in prompt

    def test_round2_contains_key_sections(self):
        bid_docs = {"技术标.pdf": "技术方案内容", "商务标.pdf": "报价内容"}
        prompt = build_dpa_round2_prompt(bid_docs, "baseline")
        assert "公司基本信息" in prompt
        assert "资质证书" in prompt
        assert "社保" in prompt
        assert "报价" in prompt
        assert "技术标.pdf" in prompt
        assert "商务标.pdf" in prompt


class TestBCAPrompts:
    def test_contains_review_dimensions(self):
        prompt = build_bca_prompt("baseline", "extracted_fields")
        assert "废标红线" in prompt
        assert "中标胜算" in prompt
        assert "资格准入" in prompt
        assert "★号条款" in prompt
        assert "否决项" in prompt

    def test_contains_output_format(self):
        prompt = build_bca_prompt("baseline", "extracted_fields")
        assert "PASS" in prompt
        assert "FAIL" in prompt
        assert "输出要求" in prompt


class TestFCAPrompts:
    def test_contains_review_dimensions(self):
        prompt = build_fca_prompt("bid content", "fields")
        assert "隐蔽风险" in prompt
        assert "暗标脱敏" in prompt
        assert "数据勾稽" in prompt
        assert "电子文件" in prompt

    def test_contains_output_format(self):
        prompt = build_fca_prompt("bid content", "fields")
        assert "PASS" in prompt or "判定" in prompt
        assert "FAIL" in prompt


class TestReportPrompt:
    def test_contains_all_sections(self):
        prompt = build_report_prompt("PROJ001", "baseline", "bca result", "fca result")
        assert "项目概况" in prompt
        assert "废标红线" in prompt
        assert "中标胜算" in prompt
        assert "隐蔽风险" in prompt
        assert "电子文件安检" in prompt
        assert "否决项清单" in prompt
        assert "人工复核" in prompt


class TestFormatFixPrompt:
    def test_appends_issues(self):
        original = "原始prompt内容"
        issues = ["缺少★号条款提取表", "缺少资格准入条件提取表"]
        result = _build_format_fix_prompt(original, issues)
        assert original in result
        assert "格式修正要求" in result
        assert "★号条款" in result
        assert "资格准入条件" in result
