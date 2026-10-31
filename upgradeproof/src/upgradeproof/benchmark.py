"""Run the feasibility cohort and write a public results table."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from upgradeproof.actions import Action
from upgradeproof.checks import harness_checks
from upgradeproof.harness import investigate, project_cases

CHALLENGE_ORDER = [
    "tint_colour",
    "bell_rename",
    "banner_text",
    "ages_split",
    "note_patch",
]
ADVERSARIAL_CASES = [
    "already_failing",
    "echo_partial",
    "missing_extra",
]
MODES = ["deterministic", "cpu"]


def run_benchmark(out_dir: Path | None = None) -> dict:
    root = project_cases()
    rows = []
    for case_id in CHALLENGE_ORDER + ADVERSARIAL_CASES:
        case_dir = root / case_id
        expect = json.loads((case_dir / "case.json").read_text(encoding="utf-8"))["expect"]
        cohort = "challenge" if case_id in CHALLENGE_ORDER else "adversarial"
        for mode in MODES:
            report = investigate(case_dir, mode=mode)
            rows.append(_row(report, cohort, expect.get(mode)))
    checks = harness_checks()
    payload = {
        "suite": "upgradeproof-feasibility",
        "version": "0.1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "modes": MODES,
        "cohorts": {"challenge": CHALLENGE_ORDER, "adversarial_cases": ADVERSARIAL_CASES},
        "rows": rows,
        "checks": checks,
        "aggregates": {mode: _aggregate(rows, mode) for mode in MODES},
        "notes": [
            "Challenge cases were newly authored for this repository. They are not a contamination-free claim about language models.",
            "The CPU path is a tiny linear selector over bounded actions, trained on training/synthetic.jsonl. It is not a generative code model.",
            "Verified means the original tests passed, the upgrade failed or needed no code change, and the sealed oracle passed. It does not prove universal compatibility.",
            "GitHub Models was retired on 30 July 2026, including its inference API. This harness does not call it.",
            "Deterministic and CPU runs record API cost as 0. Paid mode is off unless UPGRADEPROOF_ALLOW_PAID, a model, a base URL, and an API key are all set.",
        ],
    }
    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "results.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        _write_markdown(out_dir / "results.md", payload)
        for row in rows:
            if row.get("patch_diff"):
                name = f"{row['case_id']}.{row['mode']}.diff"
                (out_dir / name).write_text(row["patch_diff"], encoding="utf-8")
        site = Path(__file__).resolve().parents[2] / "site"
        site.mkdir(parents=True, exist_ok=True)
        public = _public_payload(payload)
        (site / "results.json").write_text(json.dumps(public, indent=2) + "\n", encoding="utf-8")
        (site / "results.js").write_text(
            "window.UPGRADEPROOF_RESULTS = " + json.dumps(public, indent=2) + ";\n",
            encoding="utf-8",
        )
        _write_markdown(site / "results.md", public)
    return payload


def _row(report: dict, cohort: str, expected: str | None) -> dict:
    return {
        "case_id": report["case"]["id"],
        "title": report["case"]["title"],
        "cohort": cohort,
        "mode": report["mode"],
        "verdict": report["verdict"],
        "expected": expected,
        "expectation_met": report["verdict"] == expected,
        "verified": report["verified"],
        "regression": report["verdict"] == "regression",
        "abstained": report["verdict"] == "unresolved",
        "selector": report.get("selector"),
        "wall_clock_seconds": report["wall_clock_seconds"],
        "model_calls": report["model_calls"],
        "estimated_cost_usd": report["estimated_cost_usd"],
        "reasons": report["reasons"],
        "patch_diff": report.get("patch_diff") or "",
    }


def _aggregate(rows: list[dict], mode: str) -> dict:
    challenge = [row for row in rows if row["cohort"] == "challenge" and row["mode"] == mode]
    verified = [row for row in challenge if row["verified"]]
    cost_values = [row["estimated_cost_usd"] for row in challenge]
    cost_known = all(value is not None for value in cost_values)
    total_cost = sum(cost_values) if cost_known else None
    repairs = [row for row in verified if row["verdict"] == "verified_repair"]
    return {
        "challenge_cases": len(challenge),
        "verified_successes": len(verified),
        "verified_success_rate": round(len(verified) / len(challenge), 4) if challenge else None,
        "verified_repairs": len(repairs),
        "verified_bumps": sum(1 for row in verified if row["verdict"] == "verified_bump"),
        "regressions": sum(1 for row in challenge if row["regression"]),
        "abstentions": sum(1 for row in challenge if row["abstained"]),
        "wall_clock_seconds": round(sum(row["wall_clock_seconds"] for row in challenge), 4),
        "model_calls": sum(row["model_calls"] for row in challenge),
        "estimated_cost_usd": total_cost,
        "cost_per_verified_repair_usd": (
            round(total_cost / len(repairs), 6) if cost_known and repairs else (0.0 if cost_known else None)
        ),
    }


def _public_payload(payload: dict) -> dict:
    public = json.loads(json.dumps(payload))
    for row in public["rows"]:
        row.pop("patch_diff", None)
    return public


def _write_markdown(path: Path, payload: dict) -> None:
    lines = [
        "# UpgradeProof feasibility results",
        "",
        "Passing tests cover only the tests that ran.",
        "",
        "| Mode | Verified | Rate | Regressions | Abstentions | Wall clock (s) | Model calls | Cost / verified repair |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for mode, agg in payload["aggregates"].items():
        lines.append(
            "| {mode} | {verified_successes}/{challenge_cases} | {verified_success_rate} | {regressions} | {abstentions} | {wall_clock_seconds} | {model_calls} | {cost_per_verified_repair_usd} |".format(
                mode=mode, **agg
            )
        )
    lines.extend(["", "| Case | Cohort | Mode | Verdict | Expected | Selector | Model calls |", "|---|---|---|---|---|---|---:|"])
    for row in payload["rows"]:
        lines.append(
            f"| {row['case_id']} | {row['cohort']} | {row['mode']} | {row['verdict']} | {row['expected']} | {row['selector']} | {row['model_calls']} |"
        )
    lines.extend(["", "## Harness checks", "", "| Check | Passed | Detail |", "|---|---|---|"])
    for check in payload["checks"]:
        lines.append(f"| {check['id']} | {check['passed']} | {check['detail']} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Run the UpgradeProof feasibility benchmark")
    parser.add_argument("--out", default="artifacts")
    args = parser.parse_args()
    payload = run_benchmark(Path(args.out))
    for mode, agg in payload["aggregates"].items():
        print(
            f"{mode}: verified {agg['verified_successes']}/{agg['challenge_cases']} "
            f"regressions={agg['regressions']} model_calls={agg['model_calls']}"
        )


if __name__ == "__main__":
    main()
