"""案例1 LZ270 项目提取+审查一体化脚本

1. 从 tests/examples/ 提取所有 PDF/docx/xlsx 文本
2. 构建 pipeline 输入
3. 运行审查流水线
4. 与 DeepSeek v4 报告对比评分
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.orchestrator.pipeline import ReviewPipeline
from src.orchestrator.report_validator import validate_report_quality

# ── 文档提取 ──

def extract_pdf(path: str) -> str:
    try:
        import pymupdf
        doc = pymupdf.open(path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text.strip()
    except Exception as e:
        return f"[PDF 提取失败: {e}]"


def extract_docx(path: str) -> str:
    try:
        from docx import Document
        doc = Document(path)
        parts = []
        for para in doc.paragraphs:
            if para.text.strip():
                parts.append(para.text)
        # 也提取表格
        for table in doc.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells]
                parts.append(" | ".join(cells))
        return "\n".join(parts)
    except Exception as e:
        return f"[DOCX 提取失败: {e}]"


def extract_xlsx(path: str) -> str:
    try:
        import openpyxl
        wb = openpyxl.load_workbook(path, data_only=True)
        parts = []
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            parts.append(f"--- Sheet: {sheet_name} ---")
            for row in ws.iter_rows(values_only=True):
                cells = [str(c) if c is not None else "" for c in row]
                if any(c.strip() for c in cells):
                    parts.append(" | ".join(cells))
        wb.close()
        return "\n".join(parts)
    except Exception as e:
        return f"[XLSX 提取失败: {e}]"


def extract_file(filepath: Path) -> str:
    suffix = filepath.suffix.lower()
    path_str = str(filepath)
    if suffix == ".pdf":
        return extract_pdf(path_str)
    elif suffix == ".docx":
        return extract_docx(path_str)
    elif suffix == ".xlsx":
        return extract_xlsx(path_str)
    elif suffix in (".md", ".txt"):
        return filepath.read_text(encoding="utf-8")
    else:
        return f"[不支持的文件格式: {suffix}]"


def build_bid_docs(examples_dir: Path) -> dict[str, str]:
    """遍历 01-价格文件/02-资格证明文件/03-商务技术文件，提取所有文件"""
    bid_docs = {}
    for subdir in sorted(examples_dir.iterdir()):
        if not subdir.is_dir():
            continue
        if subdir.name.startswith("."):
            continue
        for f in sorted(subdir.iterdir()):
            if f.is_file() and not f.name.startswith("."):
                # key 格式: "子目录/文件名"
                key = f"{subdir.name}/{f.name}"
                print(f"    提取: {key}")
                text = extract_file(f)
                if text:
                    bid_docs[key] = text
                else:
                    bid_docs[key] = f"[空文件或提取无内容]"
    return bid_docs


# ── 主流程 ──

async def main():
    examples_dir = Path(__file__).parent / "tests" / "examples"
    tender_path = examples_dir / "案例1-某LZ270项目招标文件.md"
    gold_report_path = examples_dir / "case1-review-report.md"
    output_dir = Path(__file__).parent / "output" / "case1"

    print("=" * 60)
    print("案例1 LZ270 项目审查")
    print("=" * 60)

    # 1. 加载招标文件
    print(f"\n📄 加载招标文件: {tender_path.name}")
    tender_doc = tender_path.read_text(encoding="utf-8")
    print(f"   招标文件长度: {len(tender_doc)} 字符, {len(tender_doc.splitlines())} 行")

    # 2. 提取投标文件
    print(f"\n📦 提取投标文件...")
    bid_docs = build_bid_docs(examples_dir)
    total_chars = sum(len(v) for v in bid_docs.values())
    print(f"   共 {len(bid_docs)} 个文件, 总计 {total_chars} 字符")

    # 3. 加载 Gold Report
    print(f"\n📊 加载 DeepSeek v4 Gold Report")
    gold_report = gold_report_path.read_text(encoding="utf-8")
    gold_quality = validate_report_quality(gold_report)
    print(f"   Gold Report 评分: {gold_quality['score']}/100")
    print(f"   长度: {len(gold_report)} 字符")

    # 4. 运行审查流水线
    print(f"\n🚀 启动审查流水线...")
    pipeline = ReviewPipeline(
        project_code="case1-lz270",
        output_dir=str(output_dir),
    )

    try:
        report = await pipeline.run(
            tender_doc=tender_doc,
            bid_docs=bid_docs,
            skip_user_confirm=True,
        )

        if report:
            report_path = output_dir / "case1-lz270-review-report.md"
            print(f"\n✅ 审查完成！报告已保存至: {report_path}")
            print(f"   报告长度: {len(report)} 字符")

            # 5. 质量评分
            quality = validate_report_quality(report)
            print(f"\n📊 Qwen 27B 报告质量评分:")
            print(f"   总分: {quality['score']}/100 (pass: {quality['is_pass']})")
            print(f"   结构问题: {len(quality['issues'])} 项")
            for issue in quality['issues']:
                print(f"     - {issue}")
            print(f"   告警: {len(quality['warnings'])} 项")
            for w in quality['warnings']:
                print(f"     - {w}")
            print(f"   AI痕迹: {quality['ai_traces_found']} 处")

            # 6. 与 Gold 对比
            print(f"\n📊 对比分析:")
            print(f"   Gold Report 评分: {gold_quality['score']}/100")
            print(f"   Qwen 27B 评分:   {quality['score']}/100")
            print(f"   差距: {gold_quality['score'] - quality['score']} 分")
            print(f"   Gold 长度: {len(gold_report)} 字符")
            print(f"   Qwen 长度: {len(report)} 字符")

            # 保存对比结果
            comparison = {
                "gold_score": gold_quality["score"],
                "qwen_score": quality["score"],
                "gap": gold_quality["score"] - quality["score"],
                "gold_length": len(gold_report),
                "qwen_length": len(report),
                "qwen_issues": quality["issues"],
                "qwen_warnings": quality["warnings"],
            }
            comp_path = output_dir / "comparison.json"
            comp_path.write_text(json.dumps(comparison, ensure_ascii=False, indent=2))
            print(f"\n   对比结果已保存: {comp_path}")

        else:
            print("\n⚠️  审查报告未生成")
            # 列出中间产物
            for f in sorted(output_dir.glob("*.md")):
                print(f"   中间产物: {f}")
            for f in sorted(output_dir.glob("*.json")):
                print(f"   状态文件: {f}")

    except Exception as e:
        print(f"\n❌ 审查流水线执行失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
