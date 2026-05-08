"""ReviewPipeline —— biddings-reviewer 审查流水线

核心编排器，执行四阶段审查：
1. DPA Round 1: 提取审查基准
2. DPA Round 2: 投标文件字段护照提取
3. BCA + FCA 并行审查
4. ORA 编译报告

qwen3.6-27b 适配：
- 代码级格式校验优先于 LLM 审查
- 单次调用超时/空响应自动重试
- 输出规范化（去 JSON code block 标记等）
"""

import asyncio
import re
from pathlib import Path
from typing import Optional

from src.shared.models import (
    ReviewPhase, ReviewVerdict,
    ReviewBaseline, ComplianceResult, ReviewReport,
    PipelineState, DimensionSummary, RiskLevel,
)
from src.orchestrator.state import ReviewStateManager, transition
from src.orchestrator.context_builder import (
    build_dpa_round1_prompt,
    build_dpa_round2_prompt,
    build_bca_prompt,
    build_fca_prompt,
    build_report_prompt,
    validate_review_format,
    is_format_valid,
)
from src.agents.prompts import load_prompt
from src.agents.options import OPTIONS_BUILDERS
from src.agents.client import call_with_retry
from src.orchestrator.report_validator import validate_report_quality

MAX_RETRY = 3


class ReviewPipeline:
    """标书合规审查流水线"""

    def __init__(self, project_code: str, output_dir: str = "output/bidding-reviewer"):
        self.project_code = project_code
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.state_manager = ReviewStateManager(
            self.output_dir / f"{project_code}-pipeline_state.json"
        )
        self.state: Optional[PipelineState] = None

        # 文档内容缓存
        self.tender_doc: str = ""
        self.bid_docs: dict[str, str] = {}
        self.baseline_text: str = ""
        self.extracted_fields_text: str = ""

    # ── 状态管理 ──

    def init_state(self) -> PipelineState:
        self.state = self.state_manager.load_or_init(self.project_code)
        return self.state

    def _save(self) -> None:
        if self.state:
            self.state_manager.save(self.state)

    # ── 主驱动 ──

    async def run(
        self,
        tender_doc: str,
        bid_docs: dict[str, str],
        skip_user_confirm: bool = True,
    ) -> str:
        """执行完整审查流水线

        Args:
            tender_doc: 招标文件全文
            bid_docs: 投标文件字典 {文件名: 内容}
            skip_user_confirm: 是否跳过用户确认（自动化模式）

        Returns:
            最终审查报告 Markdown 文本
        """
        self.tender_doc = tender_doc
        self.bid_docs = bid_docs
        self.init_state()

        # Phase 1: DPA Round 1 → 提取审查基准
        if self.state.phase == ReviewPhase.DPA_ROUND_1:
            await self._run_dpa_round1()
            self.state = transition(self.state, ReviewPhase.DPA_ROUND_2)
            self._save()

        # Phase 2: DPA Round 2 → 字段护照提取
        if self.state.phase == ReviewPhase.DPA_ROUND_2:
            await self._run_dpa_round2()
            self.state = transition(self.state, ReviewPhase.BCA_BCA)
            self._save()

        # Phase 3: BCA + FCA 并行审查
        if self.state.phase == ReviewPhase.BCA_BCA:
            await self._run_bca_fca_parallel()
            self.state = transition(self.state, ReviewPhase.REPORT_COMPILING)
            self._save()

        # Phase 4: ORA 编译报告
        if self.state.phase == ReviewPhase.REPORT_COMPILING:
            report = await self._run_report_compilation()
            self.state = transition(self.state, ReviewPhase.DONE)
            self._save()
            return report

        return ""

    # ── Phase 1: DPA Round 1 ──

    async def _run_dpa_round1(self) -> None:
        """DPA 第一轮：从招标文件提取审查基准"""
        system_prompt = load_prompt("dpa")
        prompt = build_dpa_round1_prompt(self.tender_doc)
        opts = OPTIONS_BUILDERS["dpa"](system_prompt)

        for attempt in range(MAX_RETRY):
            result = await call_with_retry(prompt=prompt, options=opts, max_retries=2)
            if not result.strip():
                continue

            # 格式校验
            issues = validate_review_format(result, "dpa_round1")
            if is_format_valid(issues):
                self.baseline_text = result
                self._save_baseline_file(result)
                return

            # 格式不通过，补充格式要求重试
            if attempt < MAX_RETRY - 1:
                prompt = _build_format_fix_prompt(prompt, issues)

        # 最后一次结果即使格式不完美也保留
        self.baseline_text = result if result.strip() else ""
        if self.baseline_text:
            self._save_baseline_file(self.baseline_text)

    def _save_baseline_file(self, text: str) -> None:
        path = self.output_dir / f"{self.project_code}-review-baseline.md"
        path.write_text(text, encoding="utf-8")

    # ── Phase 2: DPA Round 2 ──

    async def _run_dpa_round2(self) -> None:
        """DPA 第二轮：投标文件字段护照提取"""
        system_prompt = load_prompt("dpa")
        prompt = build_dpa_round2_prompt(self.bid_docs, self.baseline_text)
        opts = OPTIONS_BUILDERS["dpa"](system_prompt)

        for attempt in range(MAX_RETRY):
            result = await call_with_retry(prompt=prompt, options=opts, max_retries=2)
            if not result.strip():
                continue

            issues = validate_review_format(result, "dpa_round2")
            if is_format_valid(issues):
                self.extracted_fields_text = result
                self._save_extracted_fields(result)
                return

            if attempt < MAX_RETRY - 1:
                prompt = _build_format_fix_prompt(prompt, issues)

        self.extracted_fields_text = result if result.strip() else ""
        if self.extracted_fields_text:
            self._save_extracted_fields(self.extracted_fields_text)

    def _save_extracted_fields(self, text: str) -> None:
        path = self.output_dir / f"{self.project_code}-extracted_fields.md"
        path.write_text(text, encoding="utf-8")

    # ── Phase 3: BCA + FCA 并行 ──

    async def _run_bca_fca_parallel(self) -> None:
        """BCA 和 FCA 并行执行审查"""
        bca_task = self._run_bca()
        fca_task = self._run_fca()
        results = await asyncio.gather(bca_task, fca_task, return_exceptions=True)

        self.bca_result = results[0] if not isinstance(results[0], Exception) else f"BCA 审查异常: {results[0]}"
        self.fca_result = results[1] if not isinstance(results[1], Exception) else f"FCA 审查异常: {results[1]}"

        # 保存中间产物便于调试
        if self.bca_result:
            bca_path = self.output_dir / f"{self.project_code}-bca_result.md"
            bca_path.write_text(self.bca_result, encoding="utf-8")
        if self.fca_result:
            fca_path = self.output_dir / f"{self.project_code}-fca_result.md"
            fca_path.write_text(self.fca_result, encoding="utf-8")

    async def _run_bca(self) -> str:
        """执行 BCA 审查"""
        system_prompt = load_prompt("bca")
        prompt = build_bca_prompt(self.baseline_text, self.extracted_fields_text, bid_docs=self.bid_docs)
        opts = OPTIONS_BUILDERS["bca"](system_prompt)

        for attempt in range(MAX_RETRY):
            result = await call_with_retry(prompt=prompt, options=opts, max_retries=2)
            if not result.strip():
                continue

            issues = validate_review_format(result, "bca")
            if is_format_valid(issues):
                return result

            if attempt < MAX_RETRY - 1:
                prompt = _build_format_fix_prompt(prompt, issues)

        return result if result.strip() else "BCA 审查未产生有效输出"

    async def _run_fca(self) -> str:
        """执行 FCA 审查"""
        system_prompt = load_prompt("fca")
        # 合并所有投标文件内容（27b适配：提升单文件限制）
        bid_docs_text = "\n\n".join(
            f"【{name}】\n{content[:12000]}"
            for name, content in self.bid_docs.items()
        )
        prompt = build_fca_prompt(bid_docs_text, self.extracted_fields_text, bid_docs=self.bid_docs)
        opts = OPTIONS_BUILDERS["fca"](system_prompt)

        for attempt in range(MAX_RETRY):
            result = await call_with_retry(prompt=prompt, options=opts, max_retries=2)
            if not result.strip():
                continue

            issues = validate_review_format(result, "fca")
            if is_format_valid(issues):
                return result

            if attempt < MAX_RETRY - 1:
                prompt = _build_format_fix_prompt(prompt, issues)

        return result if result.strip() else "FCA 审查未产生有效输出"

    # ── Phase 4: 报告编译 ──

    async def _run_report_compilation(self) -> str:
        """ORA 编译最终审查报告"""
        system_prompt = load_prompt("ora")
        prompt = build_report_prompt(
            self.project_code,
            self.baseline_text,
            getattr(self, 'bca_result', ''),
            getattr(self, 'fca_result', ''),
            tender_doc=self.tender_doc,
        )
        opts = OPTIONS_BUILDERS["ora"](system_prompt)

        for attempt in range(MAX_RETRY):
            result = await call_with_retry(prompt=prompt, options=opts, max_retries=2)
            if not result.strip() or len(result) < 300:
                if attempt < MAX_RETRY - 1:
                    await asyncio.sleep(2)
                continue

            # 报告质量校验
            quality = validate_report_quality(result)
            if quality["is_pass"]:
                report_path = self.output_dir / f"{self.project_code}-review-report.md"
                report_path.write_text(result, encoding="utf-8")
                return result

            # 质量不通过：补充要求重试
            if attempt < MAX_RETRY - 1:
                issues_text = "\n".join(f"- {i}" for i in quality["issues"])
                prompt = f"""{prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 上一版报告存在以下问题，请修正后重新编译完整报告：
━━━━━━━━━━━━━━━━━━━━━━━━━━
{issues_text}

请确保报告包含全部七个部分。直接输出完整报告，不要输出任何解释或说明。"""
                await asyncio.sleep(2)

        # 最后一次结果即使质量不完全达标也输出
        if result.strip() and len(result) > 300:
            report_path = self.output_dir / f"{self.project_code}-review-report.md"
            report_path.write_text(result, encoding="utf-8")
            return result

        return "报告编译失败——请检查中间产物文件"


# ── 辅助函数 ──

def _build_format_fix_prompt(original_prompt: str, issues: list[str]) -> str:
    """在原始 prompt 后追加格式修正要求"""
    issues_text = "\n".join(f"- {i}" for i in issues)
    return f"""{original_prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 格式修正要求（上一轮输出存在以下格式问题）
━━━━━━━━━━━━━━━━━━━━━━━━━━
{issues_text}

请重新输出，务必修正上述格式问题。其余内容不变。"""
