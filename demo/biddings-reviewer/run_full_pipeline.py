"""biddings-reviewer 全流水线端到端运行脚本

使用示例:
    python biddings-reviewer/run_full_pipeline.py --tender tender.md --bid bid.md
    python biddings-reviewer/run_full_pipeline.py --tender tender.md --bid-dir bids/
"""

import argparse
import asyncio
import sys
from pathlib import Path

# 确保项目根目录在 Python 路径中
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.orchestrator.pipeline import ReviewPipeline


def load_doc(path: str) -> str:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"文件不存在: {p}")
    return p.read_text(encoding="utf-8")


def load_bid_docs(path: str) -> dict[str, str]:
    p = Path(path)
    if p.is_dir():
        docs = {}
        for f in sorted(p.glob("*.md")):
            docs[f.name] = f.read_text(encoding="utf-8")
        for f in sorted(p.glob("*.txt")):
            docs[f.name] = f.read_text(encoding="utf-8")
        return docs
    elif p.is_file():
        return {p.name: p.read_text(encoding="utf-8")}
    else:
        raise FileNotFoundError(f"投标文件路径无效: {p}")


async def main():
    parser = argparse.ArgumentParser(description="biddings-reviewer 标书合规审查")
    parser.add_argument("--tender", required=True, help="招标文件路径 (.md/.txt)")
    parser.add_argument("--bid", help="投标文件路径 (.md/.txt)")
    parser.add_argument("--bid-dir", help="投标文件目录")
    parser.add_argument("--project", help="项目代号", default="")
    parser.add_argument("--output", help="输出目录", default="output/bidding-reviewer")
    parser.add_argument("--skip-confirm", action="store_true", default=True, help="跳过用户确认（自动化模式）")

    args = parser.parse_args()

    # 加载文档
    print(f"📄 加载招标文件: {args.tender}")
    tender_doc = load_doc(args.tender)

    bid_path = args.bid_dir or args.bid
    if not bid_path:
        print("❌ 请提供投标文件路径 (--bid 或 --bid-dir)")
        sys.exit(1)

    print(f"📄 加载投标文件: {bid_path}")
    bid_docs = load_bid_docs(bid_path)

    # 项目代号
    project_code = args.project or Path(args.tender).stem[:20]
    print(f"🔍 项目代号: {project_code}")

    # 运行审查流水线
    pipeline = ReviewPipeline(
        project_code=project_code,
        output_dir=args.output,
    )

    print("🚀 启动审查流水线...")
    print("  Phase 1: DPA 提取审查基准")
    print("  Phase 2: DPA 字段护照提取")
    print("  Phase 3: BCA + FCA 并行审查")
    print("  Phase 4: ORA 编译审查报告")

    try:
        report = await pipeline.run(
            tender_doc=tender_doc,
            bid_docs=bid_docs,
            skip_user_confirm=args.skip_confirm,
        )

        if report:
            report_path = Path(args.output) / f"{project_code}-review-report.md"
            print(f"\n✅ 审查完成！报告已保存至: {report_path}")
            print(f"   报告长度: {len(report)} 字符")
        else:
            print("\n⚠️  审查报告未生成，请检查中间产物文件")
            output_dir = Path(args.output)
            for f in sorted(output_dir.glob("*.md")):
                print(f"   中间产物: {f}")

    except Exception as e:
        print(f"\n❌ 审查流水线执行失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
