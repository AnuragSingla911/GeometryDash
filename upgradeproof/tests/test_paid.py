import json

from upgradeproof.harness import investigate, project_cases


class _Response:
    def __init__(self, payload: dict):
        self.payload = payload

    def read(self) -> bytes:
        return json.dumps(self.payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_paid_mode_does_not_run_without_explicit_configuration(monkeypatch):
    monkeypatch.delenv("UPGRADEPROOF_ALLOW_PAID", raising=False)
    report = investigate(project_cases() / "ages_split", mode="paid")
    assert report["verdict"] == "unresolved"
    assert "paid_not_configured" in report["reasons"]
    assert report["model_calls"] == 0


def test_paid_mode_uses_only_the_configured_call(monkeypatch):
    monkeypatch.setenv("UPGRADEPROOF_ALLOW_PAID", "1")
    monkeypatch.setenv("UPGRADEPROOF_PAID_MODEL", "cheap-test")
    monkeypatch.setenv("UPGRADEPROOF_PAID_API_KEY", "test-key")
    monkeypatch.setenv("UPGRADEPROOF_PAID_BASE_URL", "https://example.invalid/v1")
    monkeypatch.setenv("UPGRADEPROOF_PAID_PRICE_PER_CALL", "0.01")

    def opener(request, timeout):
        assert request.get_header("Authorization") == "Bearer test-key"
        body = json.loads(request.data.decode())
        assert body["model"] == "cheap-test"
        assert "ORACLE_CANARY" not in body["messages"][1]["content"]
        return _Response({"choices": [{"message": {"content": "except_type:InputError"}}]})

    report = investigate(project_cases() / "ages_split", mode="paid", opener=opener)
    assert report["verdict"] == "verified_repair"
    assert report["model_calls"] == 1
    assert report["estimated_cost_usd"] == 0.01
    assert report["selector"] == "paid_model"
