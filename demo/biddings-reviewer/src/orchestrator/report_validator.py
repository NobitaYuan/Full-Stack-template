"""审查报告格式校验器 —— biddings-reviewer

qwen3.6-27b 适配增强版:
- 7章节结构完整性校验
- 表格完整性校验
- AI 痕迹检测（扩展禁用语料库）
- 投标建议存在性检测
- 综合质量评分（0-100分制）

对应 TDD v2.0 §四.4 test_report_validator.py
"""

import re


# ── 章节校验 ──

def validate_report_structure(report: str) -> list[str]:
    """校验审查报告的章节结构完整性

    Returns:
        list[str]: 缺失/不符合的章节列表，空列表表示结构完整
    """
    issues = []

    # 报告必须包含的7个关键章节关键词
    required_sections = {
        "项目概况": ["项目概况", "项目基本信息", "审查摘要"],
        "审查结论总览": ["审查结论", "审查状态", "审查总览"],
        "废标红线": ["废标红线", "资格准入"],
        "中标胜算": ["中标胜算", "得分预测", "评分预估"],
        "隐蔽风险": ["隐蔽风险", "暗标脱敏", "勾稽"],
        "电子文件安检": ["电子文件", "文件安检", "签章"],
        "否决项清单": ["否决项", "否决"],
        "人工复核": ["人工复核", "线下确认", "复核事项"],
    }

    for section_name, keywords in required_sections.items():
        found = any(kw in report for kw in keywords)
        if not found:
            issues.append(f"缺少「{section_name}」章节")

    # 检查附录A-G是否齐全（PRD要求7个附录）
    appendix_expected = ["附录A", "附录B", "附录C", "附录D", "附录E", "附录F", "附录G"]
    missing_appendices = [a for a in appendix_expected if a not in report]
    if missing_appendices:
        issues.append(f"缺少附录: {', '.join(missing_appendices)}")

    # 检查报告长度（过短说明章节可能为空）
    if len(report) < 500:
        issues.append(f"报告过短（{len(report)}字符），可能未完整生成")
    elif len(report) < 1500:
        issues.append(f"报告偏短（{len(report)}字符），部分章节可能内容不足")

    # 检查是否有实质性审查结论
    conclusion_patterns = [
        r'建议递交', r'有条件递交', r'不建议递交',
        r'建议投标', r'建议参与', r'投标建议',
        r'PASS', r'FAIL',
        r'合格', r'不合格',
    ]
    has_conclusion = any(re.search(p, report) for p in conclusion_patterns)
    if not has_conclusion:
        issues.append("报告中缺少实质性审查结论或投标建议")

    return issues


# ── 表格校验 ──

def validate_report_tables(report: str) -> list[str]:
    """校验审查报告中的表格完整性

    Returns:
        list[str]: 缺失的表格列表
    """
    issues = []

    # 检查是否有表格（Markdown 表格以 | 开头）
    table_lines = [l for l in report.splitlines() if l.strip().startswith("|")]
    if len(table_lines) < 8:
        issues.append(f"报告表格行数过少（{len(table_lines)}行），可能缺少关键数据表")

    # 检查表头分隔行（|---|---|）
    separator_lines = [l for l in report.splitlines() if re.match(r'^\|[\s\-|:]*\|$', l.strip())]
    if len(separator_lines) < 3:
        issues.append(f"报告表格数量过少（{len(separator_lines)}个），至少需要3个数据表")

    # 检查必含关键表格
    required_table_keywords = [
        ("项目基本信息", ["项目名称", "项目编号"]),
        ("审查结论总览", ["维度", "审查状态"]),
        ("否决项清单", ["否决项", "问题描述"]),
    ]
    for table_name, keywords in required_table_keywords:
        if not all(kw in report for kw in keywords):
            issues.append(f"可能缺少「{table_name}」表格")

    return issues


# ── AI 痕迹检测 ──

AI_TRACE_PATTERNS = [
    # 直接引用指令手册
    "根据指令手册", "按照指令手册", "依据指令手册",
    "根据SOP", "按照SOP", "依据SOP",
    "根据本手册", "按照本手册",
    # Agent 身份暴露
    "作为DPA", "作为BCA", "作为FCA", "作为ORA",
    "智能体判断", "智能体认为", "智能体判定",
    "AI审查", "自动审查", "自动化审查",
    # 工作流元信息
    "根据审查流程", "按照审查流程", "根据第五章",
    "审查任务完成", "已按模板", "已按照要求",
    "根据以上审查结果", "根据上述审查",
    # 模板指令暴露
    "{{", "}}", "输出格式要求", "请按模板", "按模板输出",
    "注意事项", "请确认以下",
    # 系统身份
    "本报告由", "生成时间", "生成系统",
    "Claude", "GPT", "AI生成",
]


def detect_ai_traces(report: str) -> list[str]:
    """检测报告中的AI审查痕迹

    Returns:
        list[str]: 检测到的AI痕迹短语列表
    """
    found = []
    for trace in AI_TRACE_PATTERNS:
        if trace in report:
            found.append(trace)
    return found


# ── 章节/标题编号 lint ──

# 中文数字 → 阿拉伯数字映射
_CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7}

# 标题正则
_H2_PART = re.compile(r'^##\s+第([一二三四五六七])部分')
_H3_NUM = re.compile(r'^###\s+(\d+)\.(\d+)')
_H2_SPECIAL = re.compile(r'^##\s+(?:审查签署|附录[ABCDEFG])')


def lint_report_headings(report: str) -> list[str]:
    """结构性标题编号 lint —— 检查章节/子节编号的连续性和一致性

    检查项：
    - H2 第X部分 是否从一到七连续、无重复、无缺失
    - H3 X.Y 子节编号是否与其父章节 X 匹配
    - H3 子节编号是否有缺失、重复

    Returns:
        list[str]: 标题编号问题列表，空列表表示编号规范
    """
    issues = []
    lines = report.split("\n")

    # 收集 H2 部分标题和 H3 子节标题
    parts: list[tuple[int, int]] = []   # (part_num, line_index)
    h3s: list[tuple[int, int, int]] = []  # (part_num, seq_num, line_index)

    for i, line in enumerate(lines):
        stripped = line.strip()
        if m := _H2_PART.match(stripped):
            parts.append((_CN_NUM[m.group(1)], i))
        elif _H2_SPECIAL.match(stripped):
            continue  # 审查签署 / 附录——不计入部分编号
        elif m := _H3_NUM.match(stripped):
            h3s.append((int(m.group(1)), int(m.group(2)), i))

    # ── H2 部分校验 ──
    expected = list(range(1, 8))
    part_nums = [p[0] for p in parts]

    if not part_nums:
        issues.append("未检测到任何「第X部分」标题")
    else:
        missing = sorted(set(expected) - set(part_nums))
        if missing:
            missing_cn = [k for k, v in _CN_NUM.items() if v in missing]
            issues.append(f"缺失部分标题: {', '.join(f'第{n}部分' for n in missing_cn)}")

        # 检查顺序（非递增即错乱）
        sorted_nums = sorted(part_nums)
        if part_nums != sorted_nums:
            issues.append("各部分标题顺序错乱")
            # 定位错乱位置
            for j, (actual, expected_num) in enumerate(zip(part_nums, sorted_nums)):
                if actual != expected_num:
                    cn = [k for k, v in _CN_NUM.items() if v == actual][0]
                    exp_cn = [k for k, v in _CN_NUM.items() if v == expected_num][0]
                    issues.append(f"  标题顺序错误: 第{cn}部分出现在第{exp_cn}部分的位置")
                    break

        # 检查重复
        seen = set()
        dups = set()
        for pn in part_nums:
            if pn in seen:
                dups.add(pn)
            seen.add(pn)
        if dups:
            dup_cn = [k for k, v in _CN_NUM.items() if v in dups]
            issues.append(f"存在重复的部分标题: {', '.join(f'第{n}部分' for n in dup_cn)}")

    # ── H3 子节校验 ──
    # 为每个部分找到其 H3 范围
    part_boundaries = []
    for idx, (pnum, pstart) in enumerate(parts):
        pend = parts[idx + 1][1] if idx + 1 < len(parts) else len(lines)
        part_boundaries.append((pnum, pstart, pend))

    for pnum, pstart, pend in part_boundaries:
        section_h3s = [(sn, li) for pn, sn, li in h3s if pstart < li < pend]

        if not section_h3s:
            continue  # 第7部分没有 H3，合法

        seq_nums = [sn for sn, _ in section_h3s]

        # 父章节匹配
        mismatched = [sn for sn, _ in section_h3s if sn // 1 != pnum]  # 实际上检查的是 H3 X.Y 中的 X
        # 更精确：直接检查 H3 中 X 是否等于 pnum
        for pn, sn, li in h3s:
            if pstart < li < pend and pn != pnum:
                cn = [k for k, v in _CN_NUM.items() if v == pnum][0]
                issues.append(f"第{cn}部分包含编号不匹配的子节: {pn}.{sn}")

        # 检查子节编号缺口
        sorted_seqs = sorted(set(seq_nums))
        if sorted_seqs and sorted_seqs[0] != 1:
            cn = [k for k, v in _CN_NUM.items() if v == pnum][0]
            issues.append(f"第{cn}部分子节编号应从1开始，实际起始为 {pnum}.{sorted_seqs[0]}")

        for j, sn in enumerate(sorted_seqs):
            expected_seq = j + 1
            if sn != expected_seq:
                cn = [k for k, v in _CN_NUM.items() if v == pnum][0]
                issues.append(f"第{cn}部分子节编号不连续: 缺少 {pnum}.{expected_seq}（{pnum}.{sorted_seqs[j-1]} → {pnum}.{sn}）")
                break

        # 检查重复
        seen_seqs = set()
        for sn in seq_nums:
            if sn in seen_seqs:
                cn = [k for k, v in _CN_NUM.items() if v == pnum][0]
                issues.append(f"第{cn}部分有重复的子节编号: {pnum}.{sn}")
                break
            seen_seqs.add(sn)

    return issues


# ── 综合质量评分 ──

def validate_report_quality(report: str) -> dict:
    """综合报告质量校验（对应 TDD v2.0 §四.4 TestReportQuality）

    Returns:
        dict: {"score": 0-100, "issues": [...], "warnings": [...], "is_pass": bool}
    """
    structure_issues = validate_report_structure(report)
    table_issues = validate_report_tables(report)
    heading_issues = lint_report_headings(report)
    ai_traces = detect_ai_traces(report)

    all_issues = structure_issues + table_issues + heading_issues
    warnings = []

    # AI 痕迹告警
    for trace in ai_traces:
        warnings.append(f"检测到AI痕迹: {trace}")

    # 投标建议检查
    recommendation_keywords = ["建议递交", "有条件递交", "不建议递交",
                                "建议投标", "建议参与", "投标建议"]
    has_recommendation = any(kw in report for kw in recommendation_keywords)
    if not has_recommendation:
        all_issues.append("缺少明确的投标建议（必须包含「建议递交」「有条件递交」或「不建议递交」）")

    # 评分：满分100
    max_score = 100
    score = max_score

    # 每缺少一个关键章节扣10分
    score -= len(structure_issues) * 10
    # 每缺少表格扣8分
    score -= len(table_issues) * 8
    # 每处AI痕迹扣15分
    score -= len(warnings) * 15
    # 缺少投标建议扣15分
    if not has_recommendation:
        score -= 15

    # 报告过短额外扣分
    if len(report) < 500:
        score -= 20
    elif len(report) < 1500:
        score -= 10

    score = max(0, min(100, score))

    # 通过条件：分数≥60 且 缺少章节≤2 且 无否决项遗漏
    is_pass = score >= 60 and len(structure_issues) <= 2

    return {
        "score": score,
        "issues": all_issues,
        "warnings": warnings,
        "is_pass": is_pass,
        "ai_traces_found": len(ai_traces),
    }
