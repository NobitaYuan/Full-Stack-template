"""Report Validator 单元测试"""
import pytest
from src.orchestrator.report_validator import (
    validate_report_structure,
    validate_report_tables,
    validate_report_quality,
)


class TestReportStructure:
    def test_complete_report(self):
        report = """
# 标书合规检验报告

## 第一部分：项目概况与审查摘要
项目名称：测试项目
审查结论：无否决项

## 第二部分：废标红线审查
资格准入全部PASS

## 第三部分：中标胜算评估
得分预测：良

## 第四部分：隐蔽风险探测
暗标脱敏通过

## 第五部分：电子文件安检
文件合规

## 第六部分：审查发现与整改建议
否决项：无
建议递交

## 第七部分：线下人工复核事项
| 序号 | 复核事项 |
|------|---------|
| 1 | 打印质量 |
"""
        issues = validate_report_structure(report)
        assert len(issues) <= 2, f"Unexpected issues: {issues}"

    def test_minimal_report(self):
        report = "项目无否决项，建议递交"
        issues = validate_report_structure(report)
        assert len(issues) > 3  # 缺少大部分章节

    def test_missing_sections(self):
        report = """
## 第一部分：项目概况
审查结论看板

## 第二部分：废标红线审查
资格准入 PASS

## 第六部分：否决项清单
无误
"""
        issues = validate_report_structure(report)
        # 缺少：中标胜算、隐蔽风险、电子文件安检、人工复核
        assert len(issues) >= 4

    def test_too_short(self):
        report = "一切合规"
        issues = validate_report_structure(report)
        assert any("过短" in i for i in issues)

    def test_has_conclusion(self):
        report = """
项目概况：某部队信息系统
废标红线：合格
中标胜算：良
隐蔽风险：严谨
建议递交
"""
        issues = validate_report_structure(report)
        # 虽然章节不完整，但应该有审查结论
        assert not any("实质性审查结论" in i for i in issues)


class TestReportTables:
    def test_with_tables(self):
        report = """
| 字段 | 内容 |
|------|------|
| 项目名称 | 测试项目 |
| 项目编号 | TEST-001 |

| 序号 | 检查项 | 判定 |
|------|-------|------|
| 1 | 保密 | PASS |

| 维度 | 审查状态 | 核心结论 | 风险等级 |
|------|---------|---------|---------|
| 废标红线 | 合格 | 无否决项 | 低 |

| 序号 | 问题描述 | 风险等级 | 整改建议 |
|------|---------|---------|---------|
| 1 | 否决项测试 | 高 | 修复 |
"""
        issues = validate_report_tables(report)
        assert len(issues) == 0, f"Unexpected issues: {issues}"

    def test_without_tables(self):
        report = "纯文本报告，没有任何表格"
        issues = validate_report_tables(report)
        assert len(issues) > 0

    def test_single_table(self):
        report = """
| 序号 | 检查项 |
|------|--------|
| 1 | 测试 |
"""
        issues = validate_report_tables(report)
        assert any("表格数量" in i for i in issues)


class TestReportQuality:
    def test_perfect_report(self):
        report = """
# 标书合规检验报告

## 第一部分：项目概况与审查摘要

### 1.1 项目基本信息
| 字段 | 内容 |
|------|------|
| 项目名称 | 某部队信息系统采购项目 |
| 项目编号 | 2026-JLZ270-W1001 |
| 采购方式 | 公开招标 |
| 审查日期 | 2026-05-05 |

### 1.2 审查结论总览

审查摘要：本次审查对投标文件进行了四维度全面审查，未发现否决项，中标胜算评估为良，建议递交。

| 维度 | 审查状态 | 核心结论 | 风险等级 |
|------|---------|---------|---------|
| 废标红线 | 合格 | 资格准入全部通过，★条款无偏离 | 低 |
| 中标胜算 | 良 | 商务+技术预估得分85%，具备竞争力 | 中 |
| 隐蔽风险 | 严谨 | 暗标脱敏彻底，数据勾稽一致 | 低 |
| 电子文件安检 | 合格 | 文件格式合规，签章有效 | 低 |

## 第二部分：废标红线审查

### 2.1 资格准入合规性
| 序号 | 检查项 | 招标要求 | 标书实际 | 合规判定 |
|------|--------|---------|---------|---------|
| 1 | 保密资质 | 二级及以上 | 二级，有效期至2027年 | 合格 |
| 2 | 营业执照 | 有效期内 | 有效，注册资本5000万 | 合格 |

### 2.3 ★号条款响应对撞矩阵
| 序号 | ★条款编号 | 招标要求 | 标书响应 | 偏离判定 | 结论 |
|------|----------|---------|---------|---------|------|
| 1 | ★1 | 响应时间≤100ms | ≤80ms | 正偏离 | 合格 |

## 第三部分：中标胜算评估

### 3.1 商务响应
得分预测：商务预估35/40分，业绩三位一体证据链完整。

## 第四部分：隐蔽风险探测

### 4.1 暗标脱敏
暗标脱敏检查通过，无敏感信息残留。

## 第五部分：电子文件安检

### 5.1 文件合规
电子文件格式合规，签章有效，元数据已清除。

## 第六部分：审查发现与整改建议

### 6.1 否决项清单
| 序号 | 问题描述 | 对应招标条款 | 判定依据 | 整改要求 |
|------|---------|-------------|---------|---------|
| — | 无否决项 | — | — | — |

### 6.2 缺陷项与改进建议
| 序号 | 问题描述 | 风险等级 | 整改建议 | 是否影响评分 |
|------|---------|---------|---------|-------------|
| 1 | 技术方案可增加关键技术创新点详述 | 低 | 补充技术细节 | 是 |

### 6.3 综合审查结论与投标建议
审查综述：投标文件整体合规，无否决项，建议递交。
投标建议：建议递交

## 第七部分：线下人工复核事项
| 序号 | 复核事项 | 复核方法 |
|------|---------|---------|
| 1 | 打印页面质量 | 逐页检查缺页/重页 |
| 2 | 公章与签章 | 确认所有盖章处已加盖公章 |
| 3 | 骑缝章与密封条 | 检查连续性 |
| 4 | 正副本数量 | 确认符合要求 |
| 5 | 封面与目录 | 封面格式/目录页码对应 |
| 6 | 开标现场材料 | 备齐所有材料 |
"""
        result = validate_report_quality(report)
        assert result["score"] >= 60, f"Score: {result['score']}, issues: {result['issues']}"
        assert result["is_pass"]

    def test_empty_report(self):
        result = validate_report_quality("")
        assert result["score"] < 30
        assert not result["is_pass"]

    def test_ai_traces_detected(self):
        report = """
根据指令手册的要求，智能体判断该项目无否决项。
按照SOP规范，建议递交。
"""
        result = validate_report_quality(report)
        assert len(result["warnings"]) >= 2
        assert result["score"] < 80  # AI痕迹触发扣分

    def test_no_ai_traces(self):
        report = """
标书合规检验报告
经过审查，该项目投标文件完整合规，无否决项。
建议递交。
"""
        result = validate_report_quality(report)
        assert len(result["warnings"]) == 0
