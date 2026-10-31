import json

from upgradeproof.mcp_server import Session, handle


def test_mcp_lists_tools_and_classifies_without_leaving_the_jail(tmp_path):
    workspace = tmp_path / "ws"
    package = tmp_path / "pkg" / "1.1.0"
    (workspace / "src").mkdir(parents=True)
    (workspace / "src" / "app.py").write_text("x = 1\n", encoding="utf-8")
    (package / "tintlib").mkdir(parents=True)
    (package / "tintlib" / "__init__.py").write_text(
        "class Tint:\n    def __init__(self, colour: str):\n        self.colour = colour\n",
        encoding="utf-8",
    )
    (package / "upgradeproof.meta.json").write_text(
        json.dumps({"name": "tintlib", "version": "1.1.0", "requires": []}),
        encoding="utf-8",
    )
    session = Session(workspace, package)
    listed = handle({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, session)
    names = {tool["name"] for tool in listed["result"]["tools"]}
    assert "classify_failure" in names
    assert "run_shell" not in names
    classified = handle(
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "classify_failure",
                "arguments": {"output": "E   TypeError: Tint.__init__() got an unexpected keyword argument 'color'"},
            },
        },
        session,
    )
    body = json.loads(classified["result"]["content"][0]["text"])
    assert body["kind"] == "unexpected_keyword"
    denied = handle(
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "read_file", "arguments": {"path": "../secret.txt"}},
        },
        session,
    )
    assert denied["result"]["isError"] is True
