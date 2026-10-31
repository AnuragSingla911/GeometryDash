import json
from pathlib import Path

from upgradeproof.actions import Action
from upgradeproof.cpu_model import ActionModel, train

ROOT = Path(__file__).resolve().parents[1]


def _action(action_id: str, text: str, kind: str = "rename_except", broad: bool = False) -> Action:
    return Action(action_id, kind, text, "analyzer", text, broad=broad, payload={})


def test_blank_failure_selects_input_error_and_closed_failure_selects_state_error():
    model = ActionModel.load()
    blank = "FAILED tests/test_public.py::test_blank_is_invalid\nE AttributeError: module 'ages' has no attribute 'LegacyError'"
    closed = "FAILED tests/test_public.py::test_closed_registry registry is closed"
    options = [
        _action("except_type:InputError", "InputError: blank or malformed values"),
        _action("except_type:StateError", "StateError: operation while the registry is closed"),
        _action("broad_except", "catch Exception to suppress every error", broad=True),
    ]
    blank_choice, _ = model.select(blank, options)
    closed_choice, _ = model.select(closed, options)
    assert blank_choice is not None and blank_choice.id == "except_type:InputError"
    assert closed_choice is not None and closed_choice.id == "except_type:StateError"


def test_training_file_does_not_contain_challenge_sources():
    text = (ROOT / "training" / "synthetic.jsonl").read_text(encoding="utf-8")
    assert "ORACLE_CANARY" not in text
    assert "def age_label" not in text
    rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    retrained = train(rows)
    assert retrained.weights
