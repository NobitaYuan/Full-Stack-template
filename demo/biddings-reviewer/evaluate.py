#!/usr/bin/env python3
"""自循环质量评估框架 —— biddings-reviewer

基于 TDD v2.0 §六，使用 Claude Sonnet 4.6 作为 Judge，
对 Qwen 27B 生成的审查报告进行 5 维度评分，识别最弱维度，
生成 prompt 改进建议。

运行:
  python evaluate.py --project TEST           # 单次评估
  python evaluate.py --project TEST --loop --rounds 3  # 自循环3轮
  python evaluate.py --project TEST --report  # 查看历史评分趋势
"""

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime
from pathlib import Path

# 项目根目录
_PROJECT_ROOT = Path(__file__).parent

# Judge 配置
_JUDGE_SYSTEM_PROMPT_PATH = _PROJECT_ROOT / "tests" / "quality" / "judge_system.md"
_OUTPUT_DIR = _PROJECT_ROOT / "output" / "bidding-reviewer"
_HISTORY_FILE = _OUTPUT_DIR / "evaluation_history.json"


def load_judge_system_prompt() -> str:
    if _JUDGE_SYSTEM_PROMPT_PATH.exists():
        return _JUDGE_SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
    return "你是一名军用软件标书合规审查质量评审专家。"


def build_judge_user_prompt(
    project_code: str,
    model_name: str,
    tender_summary: str,
    bid_summary: str,
    report_content: str,
) -> str:
    """构建 Judge 评分 prompt（对应 TDD §6.4）"""
    return f"""请对以下标书合规检验报告进行5维度评分。

【报告基本信息】
项目代号：{project_code}
生成模型：{model_name}

【审查输入摘要】
招标文件：{tender_summary[:500]}
投标文件：{bid_summary[:500]}

【待评报告全文】
{report_content[:15000]}

【5维度评分（每项0-5分）】

**D1：审查完整度（权重30%）**
- 5分：★条款全部提取、资格准入9项全覆盖、评分标准逐项提取、格式要求完整
- 3分：主要条款覆盖但个别遗漏
- 1分：关键审查基准大量遗漏
请评分：[X分] 理由：...

**D2：判定准确性（权重25%）**
- 5分：否决项判定准确无误、偏离状态符合招标原文、得分预测有充分依据
- 3分：主要判定正确但个别边界模糊
- 1分：否决项遗漏或误判
请评分：[X分] 理由：...

**D3：报告结构规范性（权重20%）**
- 5分：7部分结构完整、表格格式规范、图号表号正确
- 3分：主要章节齐备但个别格式问题
- 1分：章节大量缺失或格式严重不规范
请评分：[X分] 理由：...

**D4：建议可操作性（权重15%）**
- 5分：投标建议有充分证据支撑、每条整改建议具体可执行、人工复核事项完整
- 3分：有建议但部分笼统
- 1分：无实质可操作建议
请评分：[X分] 理由：...

**D5：AI痕迹零检出（权重10%）**
- 5分：全文无任何AI审查痕迹
- 每检出1处扣1分（最低0分）
请评分：[X分] 理由：...

**加权总分：[计算结果] / 5.0**
**最弱维度：[维度名]**
**核心改进建议（1-2句）：**"""


def parse_judge_response(response: str) -> dict:
    """从 Judge 响应中解析评分"""
    scores = {}

    # 解析各维度分数
    dim_patterns = {
        "d1_completeness": r"D1.*?评分[：:]\s*\[?(\d+(?:\.\d+)?)",
        "d2_accuracy": r"D2.*?评分[：:]\s*\[?(\d+(?:\.\d+)?)",
        "d3_structure": r"D3.*?评分[：:]\s*\[?(\d+(?:\.\d+)?)",
        "d4_actionability": r"D4.*?评分[：:]\s*\[?(\d+(?:\.\d+)?)",
        "d5_no_ai_trace": r"D5.*?评分[：:]\s*\[?(\d+(?:\.\d+)?)",
    }

    for dim, pattern in dim_patterns.items():
        match = re.search(pattern, response)
        if match:
            scores[dim] = float(match.group(1))

    # 解析加权总分
    total_match = re.search(r"加权总分[：:]\s*\[?(\d+(?:\.\d+)?)", response)
    if total_match:
        scores["overall_avg"] = float(total_match.group(1))
    elif scores:
        scores["overall_avg"] = sum(scores.values()) / len(scores)

    # 解析最弱维度
    weakest_match = re.search(r"最弱维度[：:]\s*\[?(\w+)", response)
    if weakest_match:
        scores["weakest_dimension"] = weakest_match.group(1)

    # 解析改进建议
    suggestion_match = re.search(
        r"核心改进建议[（(]?1-2句[）)]?[：:]\s*(.+?)(?:\n\n|\n$|$)",
        response, re.DOTALL
    )
    if suggestion_match:
        scores["improvement_suggestion"] = suggestion_match.group(1).strip()

    return scores


async def judge_report(
    project_code: str,
    model_name: str,
    report_content: str,
    tender_summary: str = "",
    bid_summary: str = "",
) -> dict:
    """使用 Claude Judge 对报告进行评分"""
    from src.agents.client import call_agent

    system_prompt = load_judge_system_prompt()
    user_prompt = build_judge_user_prompt(
        project_code, model_name, tender_summary, bid_summary, report_content
    )

    # 使用 Claude Sonnet 4.6 作为 Judge
    from src.agents.options import AgentOptions
    from src.agents.options import _read_env_model

    judge_opts = AgentOptions(
        model=_read_env_model("JUDGE_MODEL", "PIPELINE_MODEL"),
        temperature=0.0,
        max_tokens=4096,
        system_prompt=system_prompt,
    )

    response = await call_agent(prompt=user_prompt, options=judge_opts)
    scores = parse_judge_response(response)
    scores["raw_response"] = response
    return scores


def load_history() -> dict:
    """加载评估历史"""
    if _HISTORY_FILE.exists():
        try:
            return json.loads(_HISTORY_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"runs": []}


def save_history(history: dict) -> None:
    """保存评估历史"""
    _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    # 原子写入
    tmp = _HISTORY_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(_HISTORY_FILE)


def append_run(
    project_code: str,
    model_name: str,
    prompt_version: str,
    scores: dict,
    improvement_actions: str = "",
) -> None:
    """追加一轮评估结果到历史文件"""
    history = load_history()

    run_record = {
        "run_id": f"{project_code}-{datetime.now().strftime('%Y%m%d-%H%M')}",
        "model": model_name,
        "prompt_version": prompt_version,
        "dimension_scores": {
            k: v for k, v in scores.items()
            if k.startswith("d") and k != "raw_response"
        },
        "overall_avg": scores.get("overall_avg", 0),
        "weakest_dimensions": [scores.get("weakest_dimension", "unknown")],
        "improvement_actions": improvement_actions,
        "raw_judge_response": scores.get("raw_response", ""),
    }

    history["runs"].append(run_record)
    save_history(history)

    print(f"\n评估结果已记录: {run_record['run_id']}")
    print(f"整体平均分: {run_record['overall_avg']:.1f}/5.0")
    print(f"最弱维度: {run_record['weakest_dimensions']}")
    if scores:
        for dim, val in sorted(scores.items()):
            if dim.startswith("d"):
                print(f"  {dim}: {val}/5.0")


def show_report() -> None:
    """显示历史评分趋势"""
    history = load_history()
    runs = history.get("runs", [])
    if not runs:
        print("暂无评估记录。")
        return

    print(f"\n{'='*60}")
    print(f"评估历史趋势（共 {len(runs)} 轮）")
    print(f"{'='*60}")

    for i, run in enumerate(runs):
        avg = run.get("overall_avg", 0)
        dims = run.get("dimension_scores", {})
        print(f"\n轮次 {i+1}: {run['run_id']}")
        print(f"  模型: {run.get('model', 'unknown')}")
        print(f"  Prompt版本: {run.get('prompt_version', 'unknown')}")
        print(f"  整体平均分: {avg:.1f}/5.0")
        for dim, val in sorted(dims.items()):
            print(f"    {dim}: {val}/5.0")
        print(f"  改进措施: {run.get('improvement_actions', '无')}")

    # 趋势分析
    if len(runs) >= 2:
        first_avg = runs[0].get("overall_avg", 0)
        last_avg = runs[-1].get("overall_avg", 0)
        delta = last_avg - first_avg
        print(f"\n{'='*60}")
        print(f"趋势: {first_avg:.1f} → {last_avg:.1f} (Δ={delta:+.1f})")
        if delta > 0:
            print("✓ 评分呈上升趋势")
        elif delta == 0:
            print("→ 评分持平")
        else:
            print("✗ 评分下降，需调整策略")


async def evaluate_single(
    project_code: str,
    model_name: str = "qwen/qwen3-2-27b",
    report_path: Path | None = None,
) -> dict:
    """单次评估"""
    if report_path is None:
        report_path = _OUTPUT_DIR / f"{project_code}-review-report.md"

    if not report_path.exists():
        print(f"错误: 报告文件不存在: {report_path}")
        sys.exit(1)

    report_content = report_path.read_text(encoding="utf-8")
    print(f"加载报告: {report_path} ({len(report_content)} 字符)")

    # 尝试加载中间产物作为评估摘要
    tender_summary = ""
    baseline_path = _OUTPUT_DIR / f"{project_code}-review-baseline.md"
    if baseline_path.exists():
        tender_summary = baseline_path.read_text(encoding="utf-8")[:500]

    print("正在使用 Claude Judge 评估...")
    scores = await judge_report(
        project_code, model_name, report_content,
        tender_summary=tender_summary,
    )
    return scores


async def main():
    parser = argparse.ArgumentParser(description="标书合规检验报告自循环质量评估")
    parser.add_argument("--project", required=True, help="项目代号")
    parser.add_argument("--model", default="qwen/qwen3-2-27b", help="被评估的模型名称")
    parser.add_argument("--report", action="store_true", help="仅查看历史评分趋势")
    parser.add_argument("--loop", action="store_true", help="自循环模式")
    parser.add_argument("--rounds", type=int, default=3, help="自循环轮数（默认3）")
    parser.add_argument("--report-path", help="指定报告文件路径")
    args = parser.parse_args()

    if args.report:
        show_report()
        return

    report_path = Path(args.report_path) if args.report_path else None

    if args.loop:
        print(f"自循环评估模式: {args.rounds} 轮")
        for round_num in range(1, args.rounds + 1):
            print(f"\n{'='*60}")
            print(f"第 {round_num}/{args.rounds} 轮评估")
            print(f"{'='*60}")

            scores = await evaluate_single(args.project, args.model, report_path)
            append_run(
                args.project, args.model,
                prompt_version=f"v{round_num}.0",
                scores=scores,
                improvement_actions=scores.get("improvement_suggestion", ""),
            )

            if round_num < args.rounds:
                print(f"\n等待人工修改 prompts 后继续下一轮...")
                print(f"按 Enter 继续下一轮，或输入 'q' 退出...")
                try:
                    user_input = input("> ").strip()
                    if user_input.lower() == 'q':
                        print("用户退出自循环。")
                        break
                except (EOFError, KeyboardInterrupt):
                    print("\n用户中断。")
                    break

        show_report()
    else:
        scores = await evaluate_single(args.project, args.model, report_path)
        append_run(args.project, args.model, "single", scores)


if __name__ == "__main__":
    asyncio.run(main())
