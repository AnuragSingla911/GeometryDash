import json

from upgradeproof.checks import harness_checks
from upgradeproof.harness import investigate, project_cases
from upgradeproof.rules_engine import matching_rule, propose_rule


def test_promoted_rule_repairs_tint_without_a_model_call():
    report = investigate(project_cases() / "tint_colour", mode="deterministic")
    assert report["verdict"] == "verified_repair"
    assert report["selector"] == "promoted_rule"
    assert report["model_calls"] == 0
    assert report["estimated_cost_usd"] == 0.0
    assert "ORACLE_CANARY" not in report.get("patch_diff", "")
    assert "colour" in report["patch_diff"]


def test_deterministic_mode_abstains_when_two_exception_types_match():
    report = investigate(project_cases() / "ages_split", mode="deterministic")
    assert report["verdict"] == "unresolved"
    assert "ambiguous_repair" in report["reasons"]
    assert report["model_calls"] == 0
    assert report["patch_diff"] == ""


def test_cpu_mode_repairs_the_ambiguous_case_and_keeps_the_sealed_behavior():
    report = investigate(project_cases() / "ages_split", mode="cpu")
    assert report["verdict"] == "verified_repair"
    assert report["selector"] == "cpu_model"
    assert report["model_calls"] == 1
    assert report["selected_action"]["id"] == "except_type:InputError"
    assert report["estimated_cost_usd"] == 0.0


def test_version_bump_without_code_changes_is_verified():
    report = investigate(project_cases() / "note_patch", mode="deterministic")
    assert report["verdict"] == "verified_bump"
    assert "requirements.txt" in report["patch_diff"]


def test_invalid_baseline_stops_before_the_upgrade():
    report = investigate(project_cases() / "already_failing", mode="cpu")
    assert report["verdict"] == "invalid_baseline"
    assert "bump" not in report["states"]


def test_missing_requirement_is_a_constraint_conflict():
    report = investigate(project_cases() / "missing_extra", mode="deterministic")
    assert report["verdict"] == "constraint_conflict"
    assert "missinglib==1.2.3" in report["reasons"]


def test_public_pass_without_an_oracle_is_not_verified():
    report = investigate(project_cases() / "echo_partial", mode="deterministic")
    assert report["verdict"] == "unresolved"
    assert "evidence_insufficient" in report["reasons"]
    assert report["verified"] is False


def test_harness_checks_cover_the_adversarial_table():
    results = harness_checks()
    failed = [item for item in results if not item["passed"]]
    assert failed == []


def test_promote_writes_a_narrow_candidate_that_can_be_reused(tmp_path):
    report = investigate(project_cases() / "bell_rename", mode="deterministic")
    assert report["verdict"] == "verified_repair"
    rule = propose_rule(report)
    assert rule["status"] == "candidate"
    assert rule["auto_generated"] is True
    destination = tmp_path / "bell.json"
    destination.write_text(json.dumps(rule), encoding="utf-8")
    loaded = json.loads(destination.read_text(encoding="utf-8"))
    from upgradeproof.classify import Classification
    from upgradeproof.packages import load_package

    package = load_package(project_cases() / "bell_rename" / "pkgs" / "1.1.0")
    classification = Classification(**{
        key: report["classification"][key]
        for key in Classification.__dataclass_fields__
        if key != "failing_lines"
    })
    classification.failing_lines = tuple(tuple(item) for item in report["classification"]["failing_lines"])
    assert matching_rule([loaded], package, classification, report["failure_excerpt"]) is not None
