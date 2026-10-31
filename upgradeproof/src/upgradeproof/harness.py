"""Upgrade investigation state machine.

The repair loop never receives sealed tests. A passing public suite is not
reported as verified unless the sealed oracle passes too.
"""

from __future__ import annotations

import json
import shutil
import tempfile
import time
from pathlib import Path

from upgradeproof.actions import Action, apply_action
from upgradeproof.analyze import analyze, deterministic_choice
from upgradeproof.classify import Classification, classify_output
from upgradeproof.cpu_model import ActionModel
from upgradeproof.limits import Limits
from upgradeproof.packages import load_package, unmet_requirements
from upgradeproof.paid import PaidCallError, PaidDisabled, load_paid_config, select_paid
from upgradeproof.policy import assess_sources, syntax_ok, unified_diff
from upgradeproof.rules_engine import action_from_rule, load_promoted_rules, matching_rule
from upgradeproof.runner import RetryLimitExceeded, TestRun, ToolBudget, ToolFailure, run_pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
VERIFIED = {"verified_repair", "verified_bump"}
CANARY = "ORACLE_CANARY"


def investigate(
    case_dir: str | Path,
    mode: str = "deterministic",
    limits: Limits | None = None,
    rules_dir: Path | None = None,
    extra_actions: list[Action] | None = None,
    force_action_id: str | None = None,
    enable_rules: bool = True,
    opener=None,
) -> dict:
    started = time.monotonic()
    limits = limits or Limits()
    case_dir = Path(case_dir).resolve()
    case = _load_case(case_dir)
    deadline = started + limits.workflow_timeout_seconds
    states = ["load_case"]
    report: dict = {
        "case": case,
        "mode": mode,
        "states": states,
        "attempts": [],
        "model_calls": 0,
        "estimated_cost_usd": 0.0 if mode != "paid" else None,
        "limits": limits.to_dict(),
        "patch_diff": "",
        "reasons": [],
        "verdict": "unresolved",
        "selector": None,
        "classification": None,
        "selected_action": None,
        "contamination_note": (
            "Challenge cases were written for this repository. "
            "Historical catalog entries are references only and are not executed. "
            "A model's training corpus may still contain similar public migrations."
        ),
        "scope_note": "Passing tests are evidence only for the tests that ran.",
    }
    workspace_dir = Path(tempfile.mkdtemp(prefix="upgradeproof-"))
    try:
        workspace = _materialize(case_dir, case, workspace_dir)
        _assert_isolated(workspace)
        old_pkg = load_package(case_dir / case["package_dirs"]["from"])
        new_pkg = load_package(case_dir / case["package_dirs"]["to"])
        budget = ToolBudget(limits.max_tool_failures)
        if len(case.get("dependencies", [case["dependency"]])) > limits.max_upgrades:
            return _finish(report, "unresolved", ["upgrade_limit"], started, states)

        states.append("baseline")
        baseline_public = _run(workspace, workspace / "tests", [workspace / "src", old_pkg.root], limits, budget)
        baseline_sealed = _run_sealed(case_dir, case, workspace, old_pkg.root, limits, budget)
        report["baseline"] = {"public": baseline_public.to_dict(), "sealed": _maybe(baseline_sealed)}
        if not baseline_public.ok or (baseline_sealed is not None and not baseline_sealed.ok):
            return _finish(report, "invalid_baseline", ["invalid_baseline"], started, states)

        states.append("bump")
        _rewrite_pin(workspace / "requirements.txt", case["dependency"]["name"], case["dependency"]["to"])
        missing = unmet_requirements(new_pkg)
        if missing:
            report["unmet_requirements"] = missing
            return _finish(report, "constraint_conflict", ["constraint_conflict", *missing], started, states)

        states.append("reproduce")
        breakage = _run(workspace, workspace / "tests", [workspace / "src", new_pkg.root], limits, budget)
        report["breakage"] = breakage.to_dict()
        if breakage.ok:
            sealed_new = _run_sealed(case_dir, case, workspace, new_pkg.root, limits, budget)
            report["sealed"] = _maybe(sealed_new)
            sources = _snapshot(workspace)
            report["patch_diff"] = unified_diff(case_sources_before_pin(case_dir, case), sources)
            if sealed_new is not None and sealed_new.ok:
                return _finish(report, "verified_bump", ["tests_passed_without_code_changes"], started, states)
            if sealed_new is None:
                return _finish(report, "unresolved", ["evidence_insufficient"], started, states)
            return _finish(report, "regression", ["sealed_oracle_failed"], started, states)

        if time.monotonic() > deadline:
            return _finish(report, "unresolved", ["workflow_timeout"], started, states)

        states.append("classify")
        classification = classify_output(breakage.output)
        report["classification"] = classification.to_dict()
        failure_text = _failure_text(breakage.output, workspace, limits.max_context_chars)
        report["failure_excerpt"] = failure_text
        report["distinguishing_failure_regex"] = _distinguishing_regex(breakage.output)
        analyzed = extra_actions if extra_actions is not None else analyze(classification, new_pkg)
        rule_action = None
        if enable_rules and extra_actions is None:
            rules = load_promoted_rules(rules_dir or (PROJECT_ROOT / "rules" / "promoted"))
            rule = matching_rule(rules, new_pkg, classification, breakage.output)
            if rule is not None:
                rule_action = action_from_rule(rule)
        candidates = ([rule_action] if rule_action else []) + analyzed
        report["candidates"] = [action.to_dict() for action in candidates]
        pristine = _snapshot(workspace)
        used: set[str] = set()
        paid_config = None
        cpu_model = ActionModel.load() if mode == "cpu" else None
        if mode == "paid":
            try:
                paid_config = load_paid_config()
                if paid_config.price_per_call is None:
                    report["estimated_cost_usd"] = None
            except PaidDisabled as exc:
                return _finish(report, "unresolved", ["paid_not_configured", str(exc)], started, states)

        states.append("repair")
        outcomes: list[list[str]] = []
        for _attempt in range(limits.max_repair_attempts):
            if time.monotonic() > deadline:
                outcomes.append(["workflow_timeout"])
                break
            _restore(workspace, pristine)
            try:
                action, selector, call_count, detail = _choose(
                    mode,
                    candidates,
                    used,
                    failure_text,
                    cpu_model,
                    paid_config,
                    opener,
                    limits,
                    force_action_id,
                )
            except ToolFailure as exc:
                report["model_calls"] += 1 if mode == "paid" else 0
                outcomes.append(["paid_call_failed", str(exc)])
                break
            report["model_calls"] += call_count
            if paid_config and paid_config.price_per_call is not None:
                report["estimated_cost_usd"] = round(report["model_calls"] * paid_config.price_per_call, 6)
            if action is None:
                outcomes.append(detail or ["ambiguous_repair"])
                report["attempts"].append(
                    {"selector": selector, "action": None, "reasons": outcomes[-1]}
                )
                break
            used.add(action.id)
            report["selector"] = selector
            report["selected_action"] = {**action.to_dict(), "payload": action.payload}
            attempt = {"selector": selector, "action": action.to_dict(), "reasons": []}
            try:
                apply_action(workspace, action, _src_lines(classification, workspace))
            except Exception as exc:  # noqa: BLE001 - a bad edit is a failed attempt, not a crash
                attempt["reasons"] = ["edit_failed", str(exc)]
                report["attempts"].append(attempt)
                outcomes.append(attempt["reasons"])
                continue
            current = _snapshot(workspace)
            syntax_reasons = []
            for path, source in current.items():
                if path.endswith(".py") and path.startswith("src/") and not syntax_ok(source):
                    syntax_reasons = ["syntax_error"]
                    break
            if syntax_reasons:
                attempt["reasons"] = syntax_reasons
                report["attempts"].append(attempt)
                outcomes.append(syntax_reasons)
                continue
            assessment = assess_sources(
                pristine,
                current,
                case["allowed_prefixes"],
                pin_file="requirements.txt",
                dependency=case["dependency"]["name"],
                version_to=case["dependency"]["to"],
            )
            attempt["diff"] = unified_diff(pristine, current)
            report["patch_diff"] = attempt["diff"]
            if not assessment.ok:
                attempt["reasons"] = assessment.reasons
                report["attempts"].append(attempt)
                outcomes.append(assessment.reasons)
                continue
            retest = _run(workspace, workspace / "tests", [workspace / "src", new_pkg.root], limits, budget)
            attempt["public"] = {"ok": retest.ok, "exit_code": retest.exit_code}
            if not retest.ok:
                reasons = ["execution_failed"]
                if "not_a_real_function" in retest.output:
                    reasons.append("unknown_api")
                attempt["reasons"] = reasons
                attempt["output_excerpt"] = retest.output[-1500:]
                report["attempts"].append(attempt)
                outcomes.append(reasons)
                continue
            if not case["sealed_tests"]:
                attempt["reasons"] = ["evidence_insufficient"]
                report["attempts"].append(attempt)
                return _finish(report, "unresolved", ["evidence_insufficient"], started, states, selector)
            sealed = _run_sealed(case_dir, case, workspace, new_pkg.root, limits, budget)
            report["sealed"] = _maybe(sealed)
            if sealed is None or not sealed.ok:
                attempt["reasons"] = ["sealed_oracle_failed"]
                report["attempts"].append(attempt)
                outcomes.append(["sealed_oracle_failed"])
                continue
            report["attempts"].append(attempt)
            _assert_isolated(workspace)
            return _finish(report, "verified_repair", ["public_and_sealed_passed"], started, states, selector)
        return _finish(report, _verdict_from_outcomes(outcomes), _flatten(outcomes), started, states, report.get("selector"))
    except RetryLimitExceeded as exc:
        return _finish(report, "unresolved", ["retry_limit", str(exc)], started, states)
    except ToolFailure as exc:
        return _finish(report, "unresolved", ["tool_failure", str(exc)], started, states)
    finally:
        shutil.rmtree(workspace_dir, ignore_errors=True)


def project_cases() -> Path:
    return PROJECT_ROOT / "cases" / "challenge"


def _choose(mode, candidates, used, failure_text, model, paid_config, opener, limits, force_action_id):
    remaining = [action for action in candidates if action.id not in used]
    if force_action_id:
        forced = [action for action in remaining if action.id == force_action_id]
        if not forced:
            return None, "forced", 0, ["missing_forced_action"]
        return forced[0], "forced", 0, []
    rules = [action for action in remaining if action.origin == "promoted_rule"]
    if rules:
        return rules[0], "promoted_rule", 0, []
    if mode == "injected":
        injected = [action for action in remaining if action.origin == "injected"]
        if len(injected) == 1:
            return injected[0], "injected", 0, []
        return None, "injected", 0, ["ambiguous_repair"]
    choice = deterministic_choice([action for action in remaining if action.origin != "promoted_rule"])
    if choice is not None:
        return choice, "deterministic", 0, []
    specific = [action for action in remaining if not action.broad]
    if mode == "deterministic":
        if len(specific) != 1:
            return None, "deterministic", 0, ["ambiguous_repair"]
        return specific[0], "deterministic", 0, []
    if mode == "cpu":
        chosen, _scored = model.select(failure_text, remaining)
        if chosen is None:
            return None, "cpu_model", 1, ["model_abstained"]
        return chosen, "cpu_model", 1, []
    if mode == "paid":
        try:
            chosen, text = select_paid(
                failure_text,
                remaining,
                paid_config,
                opener=opener,
                max_chars=limits.max_context_chars,
            )
        except PaidCallError as exc:
            raise ToolFailure(f"paid_call_failed: {exc}") from exc
        if chosen is None:
            return None, "paid_model", 1, ["paid_abstained" if text == "abstain" else "invalid_model_choice"]
        return chosen, "paid_model", 1, []
    return None, mode, 0, ["unknown_mode"]


def _finish(report, verdict, reasons, started, states, selector=None) -> dict:
    report["verdict"] = verdict
    report["reasons"] = reasons
    report["states"] = states + ["report"]
    if selector:
        report["selector"] = selector
    report["wall_clock_seconds"] = round(time.monotonic() - started, 4)
    if report["estimated_cost_usd"] is None and report["mode"] != "paid":
        report["estimated_cost_usd"] = 0.0
    report["verified"] = verdict in VERIFIED
    return report


def _load_case(case_dir: Path) -> dict:
    raw = json.loads((case_dir / "case.json").read_text(encoding="utf-8"))
    dependency = raw["dependency"]
    return {
        "id": raw["id"],
        "title": raw["title"],
        "dependency": dependency,
        "expect": raw["expect"],
        "package_dirs": raw["package_dirs"],
        "sealed_tests": raw.get("sealed_tests", []),
        "allowed_prefixes": raw.get("allowed_prefixes", ["src/"]),
        "source": raw.get("source", "newly-authored"),
    }


def _materialize(case_dir: Path, case: dict, root: Path) -> Path:
    workspace = root / "workspace"
    shutil.copytree(case_dir / "app", workspace)
    migration = case_dir / case["package_dirs"]["to"] / "MIGRATION.md"
    if migration.exists():
        target = workspace / "DEPENDENCY_MIGRATION.md"
        target.write_text(migration.read_text(encoding="utf-8"), encoding="utf-8")
    return workspace


def _assert_isolated(workspace: Path) -> None:
    for path in workspace.rglob("*"):
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if CANARY in text:
            raise RuntimeError(f"sealed oracle leaked into {path}")


def _snapshot(workspace: Path) -> dict[str, str]:
    files = {}
    for path in sorted(workspace.rglob("*")):
        if path.is_file() and path.name != "DEPENDENCY_MIGRATION.md":
            files[path.relative_to(workspace).as_posix()] = path.read_text(encoding="utf-8")
    return files


def _restore(workspace: Path, snapshot: dict[str, str]) -> None:
    for relative, source in snapshot.items():
        path = workspace / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source, encoding="utf-8")
    for path in list(workspace.rglob("*")):
        if path.is_file() and path.name != "DEPENDENCY_MIGRATION.md":
            relative = path.relative_to(workspace).as_posix()
            if relative not in snapshot:
                path.unlink()


def case_sources_before_pin(case_dir: Path, case: dict) -> dict[str, str]:
    files = {}
    app = case_dir / "app"
    for path in sorted(app.rglob("*")):
        if path.is_file():
            files[path.relative_to(app).as_posix()] = path.read_text(encoding="utf-8")
    return files


def _rewrite_pin(path: Path, name: str, version: str) -> None:
    lines = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{name}=="):
            lines.append(f"{name}=={version}")
        else:
            lines.append(line)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _run(workspace: Path, tests: Path, pythonpath: list[Path], limits: Limits, budget: ToolBudget) -> TestRun:
    return run_pytest(workspace, tests, pythonpath, limits.test_timeout_seconds, budget, limits.max_output_chars)


def _run_sealed(case_dir: Path, case: dict, workspace: Path, package_root: Path, limits: Limits, budget: ToolBudget):
    if not case["sealed_tests"]:
        return None
    sealed_src = case_dir / case["sealed_tests"][0]
    with tempfile.TemporaryDirectory(prefix="upgradeproof-oracle-") as tmp:
        oracle = Path(tmp)
        if sealed_src.is_dir():
            for path in sealed_src.iterdir():
                if path.is_file():
                    shutil.copy(path, oracle / path.name)
            target = oracle
        else:
            shutil.copy(sealed_src, oracle / sealed_src.name)
            target = oracle / sealed_src.name
        return run_pytest(
            workspace,
            target,
            [workspace / "src", package_root],
            limits.test_timeout_seconds,
            budget,
            limits.max_output_chars,
        )


def _src_lines(classification: Classification, workspace: Path) -> set[int]:
    lines = set()
    src = (workspace / "src").resolve()
    for file_name, line in classification.failing_lines:
        candidate = Path(file_name)
        if not candidate.is_absolute():
            candidate = (workspace / candidate).resolve()
        else:
            candidate = candidate.resolve()
        if candidate.is_relative_to(src):
            lines.add(line)
    return lines


def _failure_text(output: str, workspace: Path, limit: int) -> str:
    """Failure text for the selector. Migration notes are omitted here on purpose.

    The report still records that migration notes were available. Overlap
    features would otherwise see every migration bullet and could not tell
    the failing test apart from the other bullets.
    """
    parts = [output]
    for file_name, line in classify_output(output).failing_lines:
        path = Path(file_name)
        if not path.is_absolute():
            path = workspace / path
        if path.is_file() and "src" in path.parts:
            rows = path.read_text(encoding="utf-8").splitlines()
            start = max(line - 3, 1)
            snippet = "\n".join(rows[start - 1 : line + 2])
            parts.append(snippet)
    text = "\n".join(parts)
    return text[:limit]


def _distinguishing_regex(output: str) -> str | None:
    for line in output.splitlines():
        if "::test_" in line or "test_" in line and line.strip().startswith("E "):
            continue
        stripped = line.strip()
        if stripped.startswith("FAILED ") and "::" in stripped:
            node = stripped.split("::", 1)[1].split(" ")[0]
            if node.startswith("test_"):
                return re_escape_partial(node)
    # pytest -q failure summary uses "FAILED tests/test_public.py::test_name - ..."
    return None


def re_escape_partial(node: str) -> str:
    return node


def _flatten(outcomes: list[list[str]]) -> list[str]:
    flat: list[str] = []
    for group in outcomes:
        for reason in group:
            if reason not in flat:
                flat.append(reason)
    return flat or ["repairs_exhausted"]


def _verdict_from_outcomes(outcomes: list[list[str]]) -> str:
    flat = _flatten(outcomes)
    if "sealed_oracle_failed" in flat:
        return "regression"
    policy = {"protected_test_modification", "patch_scope"}
    ignored = {"ambiguous_repair", "model_abstained", "missing_forced_action", "repairs_exhausted"}
    substantive = [group for group in outcomes if set(group) - ignored]
    if substantive and all(set(group) - ignored <= policy for group in substantive):
        return "rejected"
    return "unresolved"


def _maybe(run: TestRun | None) -> dict | None:
    if run is None:
        return None
    return run.to_dict()
