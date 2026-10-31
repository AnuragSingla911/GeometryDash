"""Promoted migration rules. Candidates stay inert until a maintainer moves them."""

from __future__ import annotations

import json
import re
from pathlib import Path

from upgradeproof.actions import Action
from upgradeproof.classify import Classification
from upgradeproof.packages import PackageInfo


def load_promoted_rules(directory: Path) -> list[dict]:
    if not directory.is_dir():
        return []
    rules = []
    for path in sorted(directory.glob("*.json")):
        rule = json.loads(path.read_text(encoding="utf-8"))
        rule["_path"] = str(path)
        rules.append(rule)
    return rules


def matching_rule(
    rules: list[dict],
    package: PackageInfo,
    classification: Classification,
    failure_output: str,
) -> dict | None:
    for rule in rules:
        if rule.get("package") != package.name:
            continue
        if rule.get("to_version") and rule["to_version"] != package.version:
            continue
        if _matches(rule, package, classification, failure_output):
            return rule
    return None


def action_from_rule(rule: dict) -> Action:
    body = rule["action"]
    kind = body["kind"]
    payload = {key: value for key, value in body.items() if key != "kind"}
    return Action(
        id=f"rule:{rule['id']}",
        kind=kind,
        summary=f"Promoted rule {rule['id']}",
        origin="promoted_rule",
        candidate_text=rule["id"],
        payload=payload,
    )


def propose_rule(report: dict) -> dict:
    """Turn one verified repair into a candidate rule. It is not auto-promoted."""
    classification = report.get("classification") or {}
    action = report.get("selected_action") or {}
    case = report.get("case") or {}
    dependency = case.get("dependency") or {}
    failure_regex = report.get("distinguishing_failure_regex")
    preconditions = [
        {"op": "error_type", "value": classification.get("error_type")},
    ]
    if classification.get("missing_name"):
        preconditions.append({"op": "missing_name", "value": classification["missing_name"]})
    if classification.get("unexpected_keyword"):
        preconditions.append({"op": "unexpected_keyword", "value": classification["unexpected_keyword"]})
    if failure_regex:
        preconditions.append({"op": "failure_regex", "value": failure_regex})
    payload = dict(action.get("payload") or {})
    return {
        "id": f"candidate-{case.get('id', 'case')}-{action.get('id', 'action')}".replace(":", "-"),
        "status": "candidate",
        "auto_generated": True,
        "package": dependency.get("name"),
        "to_version": dependency.get("to"),
        "preconditions": [item for item in preconditions if item.get("value")],
        "action": {"kind": action.get("kind"), **payload},
        "note": "Reviewer must confirm the scope before moving this file into rules/promoted.",
    }


def _matches(rule: dict, package: PackageInfo, classification: Classification, failure_output: str) -> bool:
    for condition in rule.get("preconditions", []):
        op = condition["op"]
        if op == "error_type" and classification.error_type != condition["value"]:
            return False
        if op == "message_regex" and not re.search(condition["value"], classification.message or ""):
            return False
        if op == "failure_regex" and not re.search(condition["value"], failure_output):
            return False
        if op == "missing_name" and classification.missing_name != condition["value"]:
            return False
        if op == "unexpected_keyword" and classification.unexpected_keyword != condition["value"]:
            return False
        if op == "signature_has_param":
            names = []
            symbol = condition["symbol"]
            if symbol in package.signatures:
                names.extend(package.signatures[symbol])
            names.extend(package.signatures.get(f"{symbol}.__init__", []))
            if condition["param"] not in names:
                return False
    return True
