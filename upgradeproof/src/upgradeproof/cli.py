"""Command line entry points."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from upgradeproof.harness import investigate
from upgradeproof.rules_engine import propose_rule


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="upgradeproof")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="Investigate one case")
    run.add_argument("--case", required=True)
    run.add_argument("--mode", choices=["deterministic", "cpu", "paid"], default="deterministic")
    run.add_argument("--out", default="")

    bench = sub.add_parser("benchmark", help="Run the feasibility benchmark")
    bench.add_argument("--out", default="artifacts")

    promote = sub.add_parser("promote", help="Write a candidate rule from a verified report")
    promote.add_argument("--report", required=True)
    promote.add_argument("--out", required=True)

    mcp = sub.add_parser("mcp", help="Serve the MCP tool surface on stdio")
    mcp.add_argument("--workspace", required=True)
    mcp.add_argument("--package", required=True)

    args = parser.parse_args(argv)
    if args.command == "run":
        report = investigate(args.case, mode=args.mode)
        text = json.dumps(report, indent=2)
        if args.out:
            Path(args.out).parent.mkdir(parents=True, exist_ok=True)
            Path(args.out).write_text(text + "\n", encoding="utf-8")
        else:
            print(text)
        return 0 if report["verified"] or report["verdict"] in {"unresolved", "rejected", "invalid_baseline", "constraint_conflict", "regression"} else 1
    if args.command == "benchmark":
        from upgradeproof.benchmark import run_benchmark

        run_benchmark(Path(args.out))
        print(f"wrote {args.out}")
        return 0
    if args.command == "promote":
        report = json.loads(Path(args.report).read_text(encoding="utf-8"))
        if report.get("verdict") not in {"verified_repair"}:
            print("promote only accepts a verified_repair report", file=__import__("sys").stderr)
            return 2
        rule = propose_rule(report)
        destination = Path(args.out)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(rule, indent=2) + "\n", encoding="utf-8")
        print(f"wrote candidate rule {destination}")
        return 0
    if args.command == "mcp":
        from upgradeproof.mcp_server import serve

        serve(Path(args.workspace), Path(args.package))
        return 0
    return 2
