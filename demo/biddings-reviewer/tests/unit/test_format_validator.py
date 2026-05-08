"""格式校验器单元测试"""
import pytest
from src.orchestrator.context_builder import (
    validate_review_format,
    is_format_valid,
)


class TestDPAFormatValidation:
    def test_round1_all_tables_present(self):
        output = """
## A. ★号条款提取
| 序号 | ★条款编号 | ...
| 1 | ★1.1 | 测试

## B. 资格准入条件提取
| 序号 | 条件类型 | ...
| 1 | 保密资质 | 二级

## C. 评分标准提取
| 序号 | 评分类别 | ...
| 1 | 商务 | 业绩

## D. 格式与封装要求提取
| 序号 | 要求类型 | ...
| 1 | 投标书格式 | PDF
"""
        issues = validate_review_format(output, "dpa_round1")
        assert is_format_valid(issues), f"Unexpected issues: {issues}"

    def test_round1_missing_tables(self):
        output = "只有一些文字描述，没有规范表格"
        issues = validate_review_format(output, "dpa_round1")
        assert not is_format_valid(issues)
        assert any("★号条款" in i for i in issues)

    def test_round1_partial_tables(self):
        output = """
## A. ★号条款提取
| 序号 | ...
| 1 | ★1.1 | 测试

## B. 资格准入条件提取
| 序号 | ...
"""
        issues = validate_review_format(output, "dpa_round1")
        assert not is_format_valid(issues)
        # 缺少 C 和 D
        assert len(issues) >= 2

    def test_round2_complete(self):
        output = """
## 1. 公司基本信息
| 字段 | 值 |
| 公司名称 | XX科技 |

## 2. 资质证书信息
| 资质类型 | 证书编号 |

## 3. 社保与纳税
| 类型 | 参保单位 |

## 5. 报价信息
| 分项名称 | 单价 |
"""
        issues = validate_review_format(output, "dpa_round2")
        assert is_format_valid(issues), f"Unexpected issues: {issues}"

    def test_round2_incomplete(self):
        output = "只提取了公司名称：XX科技有限公司"
        issues = validate_review_format(output, "dpa_round2")
        assert not is_format_valid(issues)


class TestBCAFCAFormatValidation:
    def test_bca_with_pass_fail(self):
        output = """
检查项：保密资质
判定：PASS
招标要求：二级及以上
标书实际：二级保密资格

检查项：社保窗口期
判定：PASS
招标要求：投标前4个月连续3个月
标书实际：2026年1-4月连续

检查项：审计报告双签双章
判定：FAIL
招标要求：两名注册会计师签字盖章
标书实际：仅一名注册会计师盖章
"""
        issues = validate_review_format(output, "bca")
        assert is_format_valid(issues), f"Unexpected issues: {issues}"

    def test_bca_without_verdict(self):
        output = "保密资质看起来没问题，应该是合格的"
        issues = validate_review_format(output, "bca")
        assert not is_format_valid(issues)
        assert any("PASS" in i or "FAIL" in i for i in issues) or len(issues) > 0

    def test_bca_with_too_few_checks(self):
        output = """
检查项：保密资质
判定：PASS
"""
        issues = validate_review_format(output, "bca")
        assert not is_format_valid(issues)
        assert any("数量过少" in i for i in issues)

    def test_fca_with_pass_fail(self):
        output = """
检查项：暗标脱敏
判定：PASS
检查项：数据勾稽
判定：FAIL
检查项：电子签章
判定：PASS
检查项：文件命名
判定：PASS
"""
        issues = validate_review_format(output, "fca")
        assert is_format_valid(issues), f"Unexpected issues: {issues}"

    def test_fca_without_verdict(self):
        output = "文件看起来都是合规的，没什么大问题"
        issues = validate_review_format(output, "fca")
        assert not is_format_valid(issues)

    def test_empty_output(self):
        issues = validate_review_format("", "bca")
        assert not is_format_valid(issues)


class TestIsFormatValid:
    def test_empty_issues(self):
        assert is_format_valid([]) is True

    def test_with_issues(self):
        assert is_format_valid(["问题1"]) is False

    def test_none_issues(self):
        # 防御性：None 视为无效
        assert is_format_valid(None) is False
