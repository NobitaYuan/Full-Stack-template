"""Re-run ORA compilation with updated appendix-enabled template."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.agents.prompts import load_prompt
from src.agents.options import OPTIONS_BUILDERS
from src.agents.client import call_with_retry
from src.orchestrator.context_builder import build_report_prompt
from src.orchestrator.report_validator import validate_report_quality, lint_report_headings

MAX_RETRY = 3
output_dir = Path(__file__).parent / "output" / "case1"

baseline = (output_dir / "case1-lz270-review-baseline.md").read_text()
bca_result = (output_dir / "case1-lz270-bca_result.md").read_text()
fca_result = (output_dir / "case1-lz270-fca_result.md").read_text()
tender_doc = (Path(__file__).parent / "tests/examples/案例1-某LZ270项目招标文件.md").read_text()

print(f"Baseline: {len(baseline)} chars, BCA: {len(bca_result)} chars, FCA: {len(fca_result)} chars")


async def run_ora():
    system_prompt = load_prompt("ora")
    prompt = build_report_prompt("case1-lz270", baseline, bca_result, fca_result, tender_doc=tender_doc)
    opts = OPTIONS_BUILDERS["ora"](system_prompt)
    print(f"ORA prompt: {len(prompt)} chars")

    for attempt in range(MAX_RETRY):
        result = await call_with_retry(prompt=prompt, options=opts, max_retries=2)
        if not result.strip() or len(result) < 300:
            print(f"  Attempt {attempt+1}: too short ({len(result)} chars)")
            if attempt < MAX_RETRY - 1:
                await asyncio.sleep(2)
            continue

        quality = validate_report_quality(result)
        heading_issues = lint_report_headings(result)
        all_issues = quality["issues"] + heading_issues

        print(f"  Attempt {attempt+1}: score={quality['score']}, issues={len(all_issues)}")
        for i in all_issues:
            print(f"    - {i}")

        if quality["is_pass"] and not heading_issues:
            print(f"  PASSED — {len(result)} chars")
            return result

        if attempt < MAX_RETRY - 1 and all_issues:
            issues_text = "\n".join(f"- {i}" for i in all_issues)
            prompt = f"""{prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 上一版报告存在以下问题，请修正后重新编译完整报告（包括全部七个部分、审查签署和附录A-G）：
━━━━━━━━━━━━━━━━━━━━━━━━━━
{issues_text}

请确保报告包含全部七个部分、审查签署和附录A-G。直接输出完整报告，不要输出任何解释或说明。"""
            await asyncio.sleep(2)

    if result.strip() and len(result) > 300:
        return result
    return "报告编译失败"


async def main():
    report = await run_ora()
    print(f"\nFinal report: {len(report)} chars")

    if len(report) > 300:
        path = output_dir / "case1-lz270-review-report.md"
        path.write_text(report, encoding="utf-8")
        print(f"Saved to {path}")

        q = validate_report_quality(report)
        h = lint_report_headings(report)
        print(f"Quality: {q['score']}/100, ai_traces={q['ai_traces_found']}")
        for i in q["issues"] + h:
            print(f"  - {i}")
    else:
        print("FAILED")


asyncio.run(main())
