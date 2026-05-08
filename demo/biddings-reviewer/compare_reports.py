"""DeepSeek v4 Gold vs Qwen 27B 报告对比分析脚本

Usage:
    python compare_reports.py [--judge]  # --judge 启用 Claude Judge 深度评分
"""

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.orchestrator.report_validator import validate_report_quality, detect_ai_traces


def load_reports(qwen_path: Path, gold_path: Path) -> tuple[str, str]:
    qwen = qwen_path.read_text(encoding="utf-8") if qwen_path.exists() else ""
    gold = gold_path.read_text(encoding="utf-8") if gold_path.exists() else ""
    return qwen, gold


def count_sections(report: str) -> dict:
    """统计7章节出现情况"""
    sections = {
        "第一部分：项目概况与审查摘要": False,
        "第二部分：废标红线审查": False,
        "第三部分：中标胜算评估": False,
        "第四部分：隐蔽风险探测": False,
        "第五部分：电子文件安检": False,
        "第六部分：审查发现与整改建议": False,
        "第七部分：线下人工复核事项": False,
    }
    for sec in sections:
        if sec in report:
            sections[sec] = True
    return sections


def count_tables(report: str) -> int:
    """统计表格数量"""
    separator_lines = [l for l in report.splitlines() if re.match(r'^\|[\s\-|:]*\|$', l.strip())]
    return len(separator_lines)


def extract_key_findings(report: str) -> list[str]:
    """提取关键发现"""
    findings = []
    patterns = [
        r'(?:否决项|不合格|★).*?(?:保密资质|资质.*?缺|缺失)',
        r'(?:项目名称|项目编号).*?(?:不一致|错误|误写)',
        r'(?:建议递交|有条件递交|不建议递交)',
        r'(?:报价|投标报价).*?(\d[\d,.]*)',
        r'(?:得分预测|评分预测|预估).*?(\d+)',
    ]
    for pat in patterns:
        matches = re.findall(pat, report)
        findings.extend(matches)
    return findings[:20]


def deep_compare(qwen: str, gold: str) -> dict:
    """深度对比分析"""
    comparison = {
        "length": {
            "qwen": len(qwen),
            "gold": len(gold),
            "ratio": round(len(qwen) / len(gold) * 100, 1) if gold else 0,
        },
        "sections": {
            "qwen": count_sections(qwen),
            "gold": count_sections(gold),
        },
        "tables": {
            "qwen": count_tables(qwen),
            "gold": count_tables(gold),
        },
        "ai_traces": {
            "qwen": detect_ai_traces(qwen),
            "gold": detect_ai_traces(gold),
        },
        "quality": {
            "qwen": validate_report_quality(qwen),
            "gold": validate_report_quality(gold),
        },
    }

    # 对比关键要素是否存在
    key_elements = [
        "项目名称", "项目编号", "审查结论", "建议递交", "不建议递交",
        "否决项", "★", "保密资质", "资格准入", "中标胜算",
        "隐蔽风险", "电子文件", "人工复核", "整改建议",
    ]
    element_check = {}
    for elem in key_elements:
        element_check[elem] = {
            "qwen": elem in qwen,
            "gold": elem in gold,
        }
    comparison["key_elements"] = element_check

    return comparison


def print_comparison(comp: dict):
    """格式化输出对比结果"""
    print("\n" + "=" * 70)
    print("  Qwen 27B vs DeepSeek V4 报告对比分析")
    print("=" * 70)

    # 长度对比
    l = comp["length"]
    print(f"\n📏 报告长度:")
    print(f"   Qwen: {l['qwen']:,} 字符")
    print(f"   Gold: {l['gold']:,} 字符")
    print(f"   比率: {l['ratio']}%")

    # 质量评分
    q = comp["quality"]
    print(f"\n📊 代码级质量评分:")
    print(f"   Qwen: {q['qwen']['score']}/100 (pass={q['qwen']['is_pass']})")
    print(f"   Gold: {q['gold']['score']}/100 (pass={q['gold']['is_pass']})")
    print(f"   差距: {q['gold']['score'] - q['qwen']['score']} 分")

    if q['qwen']['issues']:
        print(f"\n⚠️  Qwen 结构问题:")
        for issue in q['qwen']['issues']:
            print(f"   - {issue}")

    # AI 痕迹
    ai = comp["ai_traces"]
    if ai['qwen']:
        print(f"\n🤖 Qwen AI痕迹 ({len(ai['qwen'])}处):")
        for trace in ai['qwen']:
            print(f"   - {trace}")
    if ai['gold']:
        print(f"   Gold AI痕迹 ({len(ai['gold'])}处):")
        for trace in ai['gold']:
            print(f"   - {trace}")

    # 章节对比
    s = comp["sections"]
    print(f"\n📑 章节覆盖:")
    qwen_secs = sum(1 for v in s['qwen'].values() if v)
    gold_secs = sum(1 for v in s['gold'].values() if v)
    print(f"   Qwen: {qwen_secs}/7 章节")
    print(f"   Gold: {gold_secs}/7 章节")

    missing_in_qwen = [k for k in s['gold'] if s['gold'][k] and not s['qwen'].get(k, False)]
    if missing_in_qwen:
        print(f"   Qwen 缺失章节: {missing_in_qwen}")

    # 表格对比
    t = comp["tables"]
    print(f"\n📋 表格数量:")
    print(f"   Qwen: {t['qwen']} 个")
    print(f"   Gold: {t['gold']} 个")

    # 关键要素
    e = comp["key_elements"]
    missing = [k for k, v in e.items() if v['gold'] and not v['qwen']]
    if missing:
        print(f"\n🔑 Qwen 缺失的关键要素: {missing}")

    # 改进建议
    print(f"\n💡 初步改进方向:")
    ratio_pct = l['ratio']
    if ratio_pct < 50:
        print(f"   1. 报告长度严重不足（仅{ratio_pct}%），需扩充报告生成 prompt")
    if qwen_secs < 7:
        print(f"   2. 缺少{7-qwen_secs}个章节，需强化 ORA 强制输出结构")
    if len(ai['qwen']) > 0:
        print(f"   3. 存在{len(ai['qwen'])}处AI痕迹，需扩充禁用语料库")
    if t['qwen'] < 10:
        print(f"   4. 表格数量不足（{t['qwen']}个），需在 ORA prompt 中要求更多结构化表格")
    if q['qwen']['score'] < 60:
        print(f"   5. 质量评分不及格（{q['qwen']['score']}），报告可能需要重试流程")


async def judge_compare(qwen_report: str, gold_report: str, tender_summary: str = "") -> dict:
    """使用 Claude Judge 对比两份报告"""
    from src.agents.client import call_agent
    from src.agents.options import AgentOptions

    prompt = f"""你是军用标书审查质量专家。请对比以下两份审查报告，指出Qwen报告的不足和改进方向。

【DeepSeek V4 Gold Report（参考标准）】
{gold_report[:8000]}

【Qwen 27B Report（待评估）】
{qwen_report[:8000]}

【招标文件摘要】
{tender_summary[:500]}

请从以下维度对比分析：
1. 否决项识别：Qwen是否遗漏了Gold中发现的关键否决项？
2. 审查完整度：Qwen的章节和检查项覆盖是否与Gold一致？
3. 判定深度：Qwen的分析是否如Gold般深入细致？
4. 表格质量：Qwen的表格是否结构完整、数据充分？
5. 改进建议可操作性：Qwen的整改建议是否具体可执行？

请用中文回答，列出Qwen报告最关键的3-5个改进点。"""

    opts = AgentOptions(
        model="claude-sonnet-4-6",
        temperature=0.0,
        max_tokens=4096,
        system_prompt="你是一名军用软件标书合规审查质量专家。请给出具体、可操作的对比分析。",
    )

    try:
        result = await call_agent(prompt=prompt, options=opts)
        return {"judge_analysis": result}
    except Exception as e:
        return {"judge_error": str(e)}


async def main():
    parser = argparse.ArgumentParser(description="对比 Qwen vs DeepSeek v4 报告")
    parser.add_argument("--qwen", default="output/case1/case1-lz270-review-report.md")
    parser.add_argument("--gold", default="tests/examples/case1-review-report.md")
    parser.add_argument("--judge", action="store_true", help="启用 Claude Judge 对比评分")
    parser.add_argument("--output", default="output/case1/comparison.json")
    args = parser.parse_args()

    qwen_path = Path(args.qwen)
    gold_path = Path(args.gold)

    if not qwen_path.exists():
        print(f"❌ Qwen 报告不存在: {qwen_path}")
        print("   请先运行 run_case1.py 生成报告")
        sys.exit(1)

    qwen, gold = load_reports(qwen_path, gold_path)

    # 代码级对比
    comp = deep_compare(qwen, gold)
    print_comparison(comp)

    # Claude Judge 对比
    if args.judge:
        print("\n🤖 正在使用 Claude Judge 深度对比...")
        tender = Path("tests/examples/案例1-某LZ270项目招标文件.md")
        tender_summary = tender.read_text(encoding="utf-8")[:500] if tender.exists() else ""
        judge_result = await judge_compare(qwen, gold, tender_summary)
        comp["judge"] = judge_result
        if "judge_analysis" in judge_result:
            print(f"\n📝 Claude Judge 分析:\n{judge_result['judge_analysis']}")
        elif "judge_error" in judge_result:
            print(f"\n⚠️  Judge 评估失败: {judge_result['judge_error']}")

    # 保存
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(comp, ensure_ascii=False, indent=2))
    print(f"\n对比结果已保存至: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
